import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExamHeader, ExamQuestion, ParsedExamData, QuestionOption } from '../types/exam';

async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  if (typeof pdfWorkerUrl === 'string' && pdfWorkerUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const linesMap = new Map<number, { x: number; str: string }[]>();

    for (const rawItem of content.items) {
      const item = rawItem as { str?: string; transform?: number[] };
      if (!item.str) continue;
      const y = Math.round((item.transform?.[5] ?? 0) / 3) * 3;
      const x = item.transform?.[4] ?? 0;
      const arr = linesMap.get(y) || [];
      arr.push({ x, str: item.str });
      linesMap.set(y, arr);
    }

    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
    const lines = sortedYs.map((y) => {
      const items = linesMap.get(y)!.sort((a, b) => a.x - b.x);
      return items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    });

    pageTexts.push(lines.filter(Boolean).join('\n'));
  }

  return pageTexts.join('\n');
}

async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

function parseHeaderFromPreamble(preambleLines: string[]): ExamHeader {
  const header: ExamHeader = {
    schoolName: 'SEKOLAH MENENGAH',
    examTitle: 'UJIAN SEKOLAH',
    subject: 'Mata Pelajaran',
    gradeLevel: '-',
    academicYear: '2026 / 2027',
    duration: '90 Menit',
    instructions: '',
  };

  const instructionLines: string[] = [];
  let inInstructions = false;

  for (const raw of preambleLines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^(petunjuk|tata tertib)/i.test(line)) {
      inInstructions = true;
      continue;
    }

    if (inInstructions) {
      instructionLines.push(line);
      continue;
    }

    const mapelMatch = line.match(/^(?:mata\s+pelajaran|mapel)\s*[:=]\s*(.+)$/i);
    if (mapelMatch) {
      header.subject = mapelMatch[1].trim();
      continue;
    }

    const kelasMatch = line.match(/^(?:kelas(?:\s*\/\s*program|\s*\/\s*jurusan)?|tingkat)\s*[:=]\s*(.+)$/i);
    if (kelasMatch) {
      header.gradeLevel = kelasMatch[1].trim();
      continue;
    }

    const tahunMatch = line.match(/^(?:tahun\s+(?:ajaran|pelajaran)|ta)\s*[:=]\s*(.+)$/i);
    if (tahunMatch) {
      header.academicYear = tahunMatch[1].trim();
      continue;
    }

    const waktuMatch = line.match(/^(?:alokasi\s+waktu|waktu|durasi)\s*[:=]\s*(.+)$/i);
    if (waktuMatch) {
      header.duration = waktuMatch[1].trim();
      continue;
    }

    if (/(?:sd|smp|mts|sma|ma|smk|sekolah|madrasah|yayasan|pemerintah)/i.test(line) && header.schoolName === 'SEKOLAH MENENGAH') {
      header.schoolName = line;
      continue;
    }

    if (/(?:ujian|penilaian|asesmen|ulangan|try\s*out|sumatif|pas|pts|uas|uts)/i.test(line) && header.examTitle === 'UJIAN SEKOLAH') {
      header.examTitle = line;
      continue;
    }
  }

  if (instructionLines.length > 0) {
    header.instructions = instructionLines.join('\n');
  }

  return header;
}

function splitInlineOptions(line: string): { label: string; text: string }[] | null {
  // Detects multiple options on a single line e.g. "A. 10   B. 20   C. 30" or "a.\t10\tb.\t20"
  const matches = Array.from(line.matchAll(/(?:^|\s{2,}|\t|\s(?=[A-E]\s*[.)]\s))([A-Ea-e])\s*[.)]\s+/g));
  if (matches.length < 2) return null;

  const opts: { label: string; text: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = (matches[i].index ?? 0) + matches[i][0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? line.length) : line.length;
    opts.push({
      label: matches[i][1].toUpperCase(),
      text: line.slice(start, end).trim(),
    });
  }
  return opts;
}

export function parseExamFromRawText(rawText: string, sourceFileName?: string): ParsedExamData {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim());

  // Check if there is a trailing "KUNCI JAWABAN" section
  let bodyLines = lines;
  const answerKeyMap = new Map<number, string>();
  const keyHeaderIdx = lines.findIndex((l) =>
    /^(?:kunci\s+jawaban|pembahasan\s*&?\s*kunci|daftar\s+kunci)/i.test(l)
  );
  if (keyHeaderIdx > 0) {
    const keyLines = lines.slice(keyHeaderIdx + 1);
    bodyLines = lines.slice(0, keyHeaderIdx);
    const joinedKeys = keyLines.join(' ');
    for (const m of joinedKeys.matchAll(/\b(\d{1,3})\s*[.):-]?\s*([A-E])\b/gi)) {
      answerKeyMap.set(Number(m[1]), m[2].toUpperCase());
    }
  }

  const preambleLines: string[] = [];
  const questions: ExamQuestion[] = [];

  let currentSection = '';
  let currentQuestion: ExamQuestion | null = null;
  let seenFirstQuestion = false;

  const flushQuestion = () => {
    if (!currentQuestion) return;
    currentQuestion.stem = currentQuestion.stem.trim();
    if (!currentQuestion.correctAnswer && answerKeyMap.has(currentQuestion.originalNumber)) {
      currentQuestion.correctAnswer = answerKeyMap.get(currentQuestion.originalNumber);
    }
    if (currentQuestion.options.length >= 2) {
      currentQuestion.type = 'multiple_choice';
    } else {
      currentQuestion.type = 'essay';
      currentQuestion.options = [];
    }
    if (currentQuestion.stem.length > 0) {
      questions.push(currentQuestion);
    }
    currentQuestion = null;
  };

  for (const line of bodyLines) {
    if (!line) continue;

    // Section heading detection
    const sectionMatch = line.match(
      /^(?:bagian\s+[ivx0-9a-z]+|romawi\s+[ivx0-9]+|[ivx]+\.)\s*[:.\-]?\s*(?:soal\s+)?(pilihan\s+ganda|uraian|esai|essay|isian).*$/i
    ) || line.match(/^(?:A|B|I|II)\.\s+(?:Soal\s+)?(Pilihan\s+Ganda|Uraian|Esai|Essay)$/i);

    if (sectionMatch) {
      flushQuestion();
      currentSection = line.replace(/\s+/g, ' ').trim();
      continue;
    }

    // Inline answer key line e.g. "Kunci: B" or "Jawaban: C"
    const inlineKeyMatch = line.match(/^(?:kunci(?:\s+jawaban)?|jawaban)\s*[:=]\s*([A-E])\b/i);
    if (inlineKeyMatch && currentQuestion) {
      currentQuestion.correctAnswer = inlineKeyMatch[1].toUpperCase();
      continue;
    }

    // Inline multi-option line e.g. "A. ... B. ... C. ..."
    if (currentQuestion) {
      const multiOpts = splitInlineOptions(line);
      if (multiOpts) {
        currentQuestion.options.push(...multiOpts);
        continue;
      }
    }

    // Single option line e.g. "A. Jawaban" or "a) Jawaban" or "A . Jawaban"
    const singleOptMatch = line.match(/^([A-Ea-e])\s*[.)]\s+(.+)$/);
    if (singleOptMatch && currentQuestion) {
      const label = singleOptMatch[1].toUpperCase();
      const text = singleOptMatch[2].trim();
      const inlineKeyInOpt = text.match(/^(.*?)(?:\s*\((?:kunci|benar)\)|\s*\*)$/i);
      const opt: QuestionOption = {
        label,
        text: inlineKeyInOpt ? inlineKeyInOpt[1].trim() : text,
      };
      if (inlineKeyInOpt) {
        currentQuestion.correctAnswer = label;
      }
      currentQuestion.options.push(opt);
      continue;
    }

    // Question start e.g. "1. Apa..." or "1) Apa..." or "No. 1 ..."
    const qStartMatch = line.match(/^(?:no\.?\s*|soal\s+)?(\d{1,3})\s*[.)]\s+(.+)$/i);
    if (qStartMatch) {
      const qNum = Number(qStartMatch[1]);
      // Avoid treating instruction numbers (1. Berdoalah...) before exam sections start if they are in preamble
      const looksLikeInstruction =
        !seenFirstQuestion &&
        /(?:berdoa|tulislah|periksa|kerjakan|dilarang|lembar\s+jawaban|pengawas)/i.test(
          qStartMatch[2]
        );

      if (!looksLikeInstruction) {
        seenFirstQuestion = true;
        flushQuestion();
        currentQuestion = {
          id: `local-q-${Date.now()}-${questions.length + 1}`,
          originalNumber: qNum || questions.length + 1,
          type: 'essay',
          sectionTitle: currentSection || undefined,
          stem: qStartMatch[2].trim(),
          options: [],
          lockPosition: false,
        };
        continue;
      }
    }

    if (!seenFirstQuestion) {
      preambleLines.push(line);
    } else if (currentQuestion) {
      if (currentQuestion.options.length > 0) {
        const lastOpt = currentQuestion.options[currentQuestion.options.length - 1];
        lastOpt.text = `${lastOpt.text} ${line}`.trim();
      } else {
        currentQuestion.stem = `${currentQuestion.stem} ${line}`.trim();
      }
    }
  }

  flushQuestion();

  // Assign default sectionTitle if missing
  for (const q of questions) {
    if (!q.sectionTitle) {
      q.sectionTitle =
        q.type === 'multiple_choice' ? 'Bagian I: Pilihan Ganda' : 'Bagian II: Uraian';
    }
  }

  return {
    header: parseHeaderFromPreamble(preambleLines),
    questions,
    sourceFileName,
  };
}

export async function parseExamFileInBrowser(file: File): Promise<ParsedExamData> {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'doc') {
    throw new Error(
      'Format .doc lawas (Word 97-2003) belum didukung. Silakan simpan ulang dokumen sebagai .docx atau .pdf terlebih dahulu.'
    );
  }

  let text = '';
  if (ext === 'pdf' || file.type === 'application/pdf') {
    const buffer = await file.arrayBuffer();
    text = await extractTextFromPdf(buffer);
    if (!text.trim()) {
      throw new Error(
        'PDF tidak mengandung teks yang dapat dibaca (kemungkinan hasil scan gambar). Konversi PDF ke teks/Word atau gunakan server backend.'
      );
    }
  } else if (
    ext === 'docx' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const buffer = await file.arrayBuffer();
    text = await extractTextFromDocx(buffer);
    if (!text.trim()) {
      throw new Error('Dokumen Word (.docx) tidak mengandung teks yang dapat dibaca.');
    }
  } else if (ext === 'txt' || file.type.startsWith('text/')) {
    text = await file.text();
  } else {
    throw new Error(
      `Format file "${ext || file.type}" tidak didukung. Gunakan file PDF (.pdf), Word (.docx), atau teks (.txt).`
    );
  }

  const parsed = parseExamFromRawText(text, name);
  if (parsed.questions.length === 0) {
    throw new Error(
      'Tidak ada butir soal bernomor yang terdeteksi. Pastikan soal diawali nomor (contoh: 1. Pertanyaan...) dan opsi A, B, C, D.'
    );
  }
  return parsed;
}
