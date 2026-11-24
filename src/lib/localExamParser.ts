import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExamHeader, ExamQuestion, ParsedExamData, QuestionOption } from '../types/exam';

interface PdfTextItem {
  x: number;
  y: number;
  width: number;
  str: string;
}

function groupItemsIntoLines(items: PdfTextItem[]): string[] {
  if (items.length === 0) return [];
  const linesMap = new Map<number, PdfTextItem[]>();

  for (const item of items) {
    const yBucket = Math.round(item.y / 3) * 3;
    const arr = linesMap.get(yBucket) || [];
    arr.push(item);
    linesMap.set(yBucket, arr);
  }

  const sortedYs = Array.from(linesMap.keys()).sort((a, b) => b - a);
  return sortedYs
    .map((y) => {
      const row = linesMap.get(y)!.sort((a, b) => a.x - b.x);
      let line = '';
      let prevEndX = -Infinity;
      for (const item of row) {
        const text = item.str;
        if (!text) continue;
        if (prevEndX > -Infinity) {
          const gap = item.x - prevEndX;
          if (gap > 14) {
            line += '   ';
          } else if (gap > 1.5 && !line.endsWith(' ') && !text.startsWith(' ')) {
            line += ' ';
          }
        }
        line += text;
        prevEndX = item.x + Math.max(item.width, text.length * 3);
      }
      return line.replace(/\s{4,}/g, '   ').trim();
    })
    .filter(Boolean);
}

function findColumnSplitX(items: PdfTextItem[], pageWidth: number): number | null {
  if (items.length < 20 || pageWidth <= 0) return null;

  // Test candidate vertical gutter positions between 42% and 58% of pageWidth
  let bestSplitX: number | null = null;
  let bestScore = -1;

  for (let frac = 0.44; frac <= 0.56; frac += 0.02) {
    const splitX = pageWidth * frac;
    const gutterHalf = 6;
    let crossingCount = 0;
    let leftCount = 0;
    let rightCount = 0;

    for (const item of items) {
      if (!item.str.trim()) continue;
      const start = item.x;
      const end = item.x + item.width;
      if (start < splitX - gutterHalf && end > splitX + gutterHalf) {
        crossingCount += 1;
      } else if (end <= splitX + gutterHalf) {
        leftCount += 1;
      } else if (start >= splitX - gutterHalf) {
        rightCount += 1;
      }
    }

    // Must have significant content on both sides and very few items crossing the gutter
    if (leftCount >= 8 && rightCount >= 8) {
      const crossRatio = crossingCount / items.length;
      if (crossRatio < 0.08) {
        const balance = Math.min(leftCount, rightCount) / Math.max(leftCount, rightCount);
        const score = balance - crossRatio * 5;
        if (score > bestScore) {
          bestScore = score;
          bestSplitX = splitX;
        }
      }
    }
  }

  return bestSplitX;
}

async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  if (typeof pdfWorkerUrl === 'string' && pdfWorkerUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PdfTextItem[] = [];
    for (const rawItem of content.items) {
      const item = rawItem as { str?: string; transform?: number[]; width?: number };
      if (!item.str || !item.str.trim()) continue;
      items.push({
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
        width: item.width ?? item.str.length * 4.5,
        str: item.str,
      });
    }

    const splitX = findColumnSplitX(items, viewport.width);
    if (splitX !== null) {
      // Separate top full-width header (items crossing splitX near top of page) from 2-column body
      const crossingItems = items.filter(
        (it) => it.x < splitX - 6 && it.x + it.width > splitX + 6
      );
      let bodyTopY = Infinity;
      if (crossingItems.length > 0 && p === 1) {
        const lowestTopHeaderY = Math.min(...crossingItems.map((it) => it.y));
        if (lowestTopHeaderY > viewport.height * 0.55) {
          bodyTopY = lowestTopHeaderY - 4;
        }
      }

      const headerItems = items.filter((it) => it.y >= bodyTopY);
      const leftItems = items.filter((it) => it.y < bodyTopY && it.x + it.width * 0.5 <= splitX);
      const rightItems = items.filter((it) => it.y < bodyTopY && it.x + it.width * 0.5 > splitX);

      const pageLines = [
        ...groupItemsIntoLines(headerItems),
        ...groupItemsIntoLines(leftItems),
        ...groupItemsIntoLines(rightItems),
      ];
      pageTexts.push(pageLines.join('\n'));
    } else {
      pageTexts.push(groupItemsIntoLines(items).join('\n'));
    }
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

    const kelasMatch = line.match(
      /^(?:kelas(?:\s*\/\s*program|\s*\/\s*jurusan)?|tingkat)\s*[:=]\s*(.+)$/i
    );
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

    if (
      /(?:sd|smp|mts|sma|ma|smk|sekolah|madrasah|yayasan|pemerintah)/i.test(line) &&
      header.schoolName === 'SEKOLAH MENENGAH'
    ) {
      header.schoolName = line;
      continue;
    }

    if (
      /(?:ujian|penilaian|asesmen|ulangan|try\s*out|sumatif|pas|pts|uas|uts)/i.test(line) &&
      header.examTitle === 'UJIAN SEKOLAH'
    ) {
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
  const matches = Array.from(
    line.matchAll(/(?:^|\s{2,}|\t|\s(?=[A-E]\s*[.)]\s))([A-Ea-e])\s*[.)]\s+/g)
  );
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

export function parseAnswerKeyText(rawKeyText: string): Map<number, string> {
  const map = new Map<number, string>();
  const cleaned = rawKeyText.trim();
  if (!cleaned) return map;

  // Match numbered pairs like "1. B", "1) B", "1: B", "1-B", "1 B"
  const pairMatches = Array.from(
    cleaned.matchAll(/\b(\d{1,3})\s*[.):=\-]?\s*([A-E])\b/gi)
  );
  if (pairMatches.length > 0) {
    for (const m of pairMatches) {
      map.set(Number(m[1]), m[2].toUpperCase());
    }
    return map;
  }

  // Fallback: raw sequence of letters like "ABCDEABCDE" or "A B C D E"
  const lettersOnly = cleaned.toUpperCase().replace(/[^A-E]/g, '');
  if (lettersOnly.length >= 2) {
    for (let i = 0; i < lettersOnly.length; i++) {
      map.set(i + 1, lettersOnly[i]);
    }
  }

  return map;
}

export function parseExamFromRawText(rawText: string, sourceFileName?: string): ParsedExamData {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim());

  let bodyLines = lines;
  const answerKeyMap = new Map<number, string>();
  const keyHeaderIdx = lines.findIndex((l) =>
    /^(?:kunci(?:\s+jawaban)?|pembahasan\s*&?\s*kunci|daftar\s+kunci|jawaban\s+soal)\b/i.test(l)
  );
  if (keyHeaderIdx > 0) {
    const keyLines = lines.slice(keyHeaderIdx + 1);
    bodyLines = lines.slice(0, keyHeaderIdx);
    const parsedKeys = parseAnswerKeyText(keyLines.join(' '));
    parsedKeys.forEach((val, num) => answerKeyMap.set(num, val));
  }

  const preambleLines: string[] = [];
  const questions: ExamQuestion[] = [];

  let currentSection = '';
  let currentQuestion: ExamQuestion | null = null;
  let pendingOptionLabel: string | null = null;
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
    pendingOptionLabel = null;
  };

  for (const line of bodyLines) {
    if (!line) continue;

    // Section heading detection
    const sectionMatch =
      line.match(
        /^(?:bagian\s+[ivx0-9a-z]+|romawi\s+[ivx0-9]+|[ivx]+\.)\s*[:.\-]?\s*(?:soal\s+)?(pilihan\s+ganda|uraian|esai|essay|isian).*$/i
      ) ||
      line.match(/^(?:A|B|I|II)\.\s+(?:Soal\s+)?(Pilihan\s+Ganda|Uraian|Esai|Essay)\b/i);

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
        pendingOptionLabel = null;
        currentQuestion.options.push(...multiOpts);
        continue;
      }
    }

    // Option label alone on a line (e.g. "A." or "B)")
    const soloOptLabelMatch = line.match(/^([A-Ea-e])\s*[.)]$/);
    if (soloOptLabelMatch && currentQuestion) {
      pendingOptionLabel = soloOptLabelMatch[1].toUpperCase();
      continue;
    }

    if (pendingOptionLabel && currentQuestion) {
      currentQuestion.options.push({
        label: pendingOptionLabel,
        text: line,
      });
      pendingOptionLabel = null;
      continue;
    }

    // Single option line e.g. "A. Jawaban" or "a) Jawaban" or "A.Jawaban"
    const singleOptMatch = line.match(/^([A-Ea-e])\s*[.)]\s*(.+)$/);
    if (singleOptMatch && currentQuestion) {
      const label = singleOptMatch[1].toUpperCase();
      const rawOptText = singleOptMatch[2].trim();
      // Guard against false match like "a.m." or "e.g."
      if (rawOptText.length > 0 && !/^(?:m|g|l)\b/i.test(rawOptText)) {
        const inlineKeyInOpt = rawOptText.match(/^(.*?)(?:\s*\((?:kunci|benar)\)|\s*\*)$/i);
        const opt: QuestionOption = {
          label,
          text: inlineKeyInOpt ? inlineKeyInOpt[1].trim() : rawOptText,
        };
        if (inlineKeyInOpt) {
          currentQuestion.correctAnswer = label;
        }
        currentQuestion.options.push(opt);
        continue;
      }
    }

    // Question start e.g. "1. Apa..." or "1) Apa..." or "No. 1 ..."
    const qStartMatch = line.match(/^(?:no\.?\s*|soal\s+)?(\d{1,3})\s*[.)]\s+(.+)$/i);
    if (qStartMatch) {
      const qNum = Number(qStartMatch[1]);
      const looksLikeInstruction =
        !seenFirstQuestion &&
        /(?:berdoa|tulislah|periksa|kerjakan|dilarang|lembar\s+jawaban|pengawas|pilihlah)/i.test(
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

  // Sort questions cleanly by originalNumber within each section/type so numbers never appear scrambled
  const mcqs = questions
    .filter((q) => q.type === 'multiple_choice')
    .sort((a, b) => a.originalNumber - b.originalNumber);
  const essays = questions
    .filter((q) => q.type === 'essay')
    .sort((a, b) => a.originalNumber - b.originalNumber);

  const orderedQuestions = [...mcqs, ...essays];
  for (const q of orderedQuestions) {
    if (!q.sectionTitle) {
      q.sectionTitle =
        q.type === 'multiple_choice' ? 'Bagian I: Pilihan Ganda' : 'Bagian II: Uraian';
    }
  }

  return {
    header: parseHeaderFromPreamble(preambleLines),
    questions: orderedQuestions,
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
