import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },
});

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const EXAM_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    header: {
      type: Type.OBJECT,
      properties: {
        schoolName: {
          type: Type.STRING,
          description: 'Nama sekolah atau instansi pendidikan dari kop naskah.',
        },
        examTitle: {
          type: Type.STRING,
          description: 'Judul ujian, misalnya PENILAIAN AKHIR SEMESTER atau UJIAN SEKOLAH.',
        },
        subject: {
          type: Type.STRING,
          description: 'Nama mata pelajaran.',
        },
        gradeLevel: {
          type: Type.STRING,
          description: 'Tingkat kelas atau jurusan.',
        },
        academicYear: {
          type: Type.STRING,
          description: 'Tahun ajaran.',
        },
        duration: {
          type: Type.STRING,
          description: 'Alokasi waktu ujian.',
        },
        instructions: {
          type: Type.STRING,
          description: 'Petunjuk umum pengerjaan ujian jika ada.',
        },
      },
      required: [
        'schoolName',
        'examTitle',
        'subject',
        'gradeLevel',
        'academicYear',
        'duration',
        'instructions',
      ],
    },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          originalNumber: {
            type: Type.INTEGER,
            description: 'Nomor urut soal asli pada dokumen.',
          },
          type: {
            type: Type.STRING,
            description: 'Harus bernilai "multiple_choice" atau "essay".',
          },
          sectionTitle: {
            type: Type.STRING,
            description: 'Judul bagian soal jika ada.',
          },
          passage: {
            type: Type.STRING,
            description: 'Teks bacaan/wacana pendukung khusus jika ada.',
          },
          stem: {
            type: Type.STRING,
            description: 'Teks pertanyaan utama tanpa nomor soal di depannya.',
          },
          options: {
            type: Type.ARRAY,
            description: 'Daftar opsi pilihan ganda (kosong [] jika soal essay).',
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: 'Huruf opsi: A, B, C, D, atau E.' },
                text: { type: Type.STRING, description: 'Isi pilihan jawaban tanpa huruf label.' },
              },
              required: ['label', 'text'],
            },
          },
          correctAnswer: {
            type: Type.STRING,
            description: 'Kunci jawaban jika tertera di dokumen.',
          },
        },
        required: ['originalNumber', 'type', 'stem', 'options'],
      },
    },
  },
  required: ['header', 'questions'],
};

const EXTRACTION_SYSTEM_INSTRUCTION = `Ekstrak kop naskah ujian dan seluruh butir soal secara utuh ke JSON.
Aturan:
1. Pertahankan teks soal, opsi, dan simbol/angka secara akurat tanpa meringkas.
2. Hilangkan nomor urut di awal "stem" dan hilangkan huruf label di awal "options.text".
3. Jika ada pilihan A-E, type = "multiple_choice"; jika tidak, type = "essay" dengan options = [].
4. Jika ada kunci jawaban (di soal atau halaman akhir), isi "correctAnswer" (huruf A-E untuk PG).
5. Jika beberapa soal berbagi teks wacana/bacaan, sertakan wacana tersebut di field "passage" tiap soal terkait.
6. Jika metadata kop tidak ada, isi nilai default singkat ("SEKOLAH MENENGAH", "UJIAN SEKOLAH", "-").`;

function extractErrorInfo(err: any): { status: number; rawMessage: string } {
  let status = Number(err?.status) || Number(err?.code) || 0;
  let rawMessage = String(err?.message || '');

  if (rawMessage.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(rawMessage);
      const inner = parsed?.error || parsed;
      if (!status && inner?.code) status = Number(inner.code) || 0;
      if (typeof inner?.message === 'string') {
        if (inner.message.trim().startsWith('{')) {
          try {
            const deep = JSON.parse(inner.message);
            if (!status && deep?.error?.code) status = Number(deep.error.code) || 0;
            rawMessage = deep?.error?.message || inner.message;
          } catch {
            rawMessage = inner.message;
          }
        } else {
          rawMessage = inner.message;
        }
      }
    } catch {
      // keep rawMessage
    }
  }

  if (!status && /\b503\b|UNAVAILABLE/i.test(rawMessage)) status = 503;
  if (!status && /\b429\b|RESOURCE_EXHAUSTED/i.test(rawMessage)) status = 429;
  if (!status && /\b403\b|PERMISSION_DENIED/i.test(rawMessage)) status = 403;
  if (!status && /\b400\b|API_KEY_INVALID/i.test(rawMessage)) status = 400;

  return { status, rawMessage };
}

async function runStreamWithModel(
  model: string,
  contents: unknown,
  thinkingLevel: ThinkingLevel,
  onProgress: (chars: number) => void
): Promise<string> {
  const stream = await ai.models.generateContentStream({
    model,
    contents: contents as any,
    config: {
      systemInstruction: EXTRACTION_SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: EXAM_EXTRACTION_SCHEMA,
      thinkingConfig: { thinkingLevel },
    },
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (chunk.text) {
      fullText += chunk.text;
      onProgress(fullText.length);
    }
  }

  if (!fullText.trim()) {
    throw new Error('Model mengembalikan respons kosong.');
  }
  return fullText;
}

async function streamGeminiExtraction(
  contents: unknown,
  onProgress: (chars: number) => void
): Promise<string> {
  const attempts: { model: string; thinking: ThinkingLevel; delayMs: number }[] = [
    { model: 'gemini-4-hydrogen', thinking: ThinkingLevel.LOW, delayMs: 1200 },
    { model: 'gemini-4-hydrogen', thinking: ThinkingLevel.LOW, delayMs: 2200 },
    { model: 'gemini-3.1-flash-lite', thinking: ThinkingLevel.MINIMAL, delayMs: 1200 },
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const { model, thinking, delayMs } = attempts[i];
    try {
      return await runStreamWithModel(model, contents, thinking, onProgress);
    } catch (err: any) {
      lastError = err;
      const { status } = extractErrorInfo(err);
      const retryable = status === 429 || status === 500 || status === 503;
      if (i < attempts.length - 1 && retryable) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function normalizeParsedExam(raw: any, fileName?: string) {
  const header = {
    schoolName: String(raw?.header?.schoolName || 'SEKOLAH MENENGAH'),
    examTitle: String(raw?.header?.examTitle || 'UJIAN SEKOLAH'),
    subject: String(raw?.header?.subject || 'Mata Pelajaran'),
    gradeLevel: String(raw?.header?.gradeLevel || '-'),
    academicYear: String(raw?.header?.academicYear || '2026 / 2027'),
    duration: String(raw?.header?.duration || '90 Menit'),
    instructions: String(raw?.header?.instructions || ''),
  };

  const questions = Array.isArray(raw?.questions)
    ? raw.questions
        .filter((q: any) => q && typeof q.stem === 'string' && q.stem.trim().length > 0)
        .map((q: any, idx: number) => {
          const isMcq =
            q.type === 'multiple_choice' || (Array.isArray(q.options) && q.options.length >= 2);
          const cleanOptions =
            isMcq && Array.isArray(q.options)
              ? q.options.map((o: any, oIdx: number) => ({
                  label:
                    String(o?.label || String.fromCharCode(65 + oIdx))
                      .replace(/[^A-Za-z0-9]/g, '')
                      .toUpperCase() || String.fromCharCode(65 + oIdx),
                  text: String(o?.text || '').trim(),
                }))
              : [];

          return {
            id: `q-${Date.now()}-${idx + 1}`,
            originalNumber: Number(q.originalNumber) || idx + 1,
            type: isMcq ? 'multiple_choice' : 'essay',
            sectionTitle: q.sectionTitle ? String(q.sectionTitle).trim() : undefined,
            passage: q.passage ? String(q.passage).trim() : undefined,
            stem: String(q.stem).trim(),
            options: cleanOptions,
            correctAnswer: q.correctAnswer ? String(q.correctAnswer).trim() : undefined,
            lockPosition: false,
          };
        })
    : [];

  return {
    header,
    questions,
    sourceFileName: fileName,
  };
}

function sendSseEvent(res: Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/parse-exam', upload.single('file'), async (req: Request, res: Response) => {
    // Prepare validation before starting SSE stream so 400 errors return clean JSON
    if (!process.env.GEMINI_API_KEY) {
      res.status(500).json({
        error:
          'GEMINI_API_KEY belum tersedia di lingkungan server. Silakan periksa pengaturan Secrets pada panel AI Studio.',
      });
      return;
    }

    let geminiInput: unknown = null;
    let sourceName = 'Naskah_Teks.txt';

    try {
      if (req.file) {
        sourceName = req.file.originalname;
        const ext = path.extname(req.file.originalname).toLowerCase();

        if (ext === '.doc') {
          res.status(400).json({
            error:
              'Format .doc lawas (Word 97-2003) belum didukung langsung. Silakan simpan ulang dokumen sebagai .docx atau .pdf terlebih dahulu.',
          });
          return;
        }

        if (ext === '.pdf' || req.file.mimetype === 'application/pdf') {
          geminiInput = {
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: req.file.buffer.toString('base64'),
                },
              },
              {
                text: `Ekstrak seluruh kop naskah ujian dan semua butir soal dari file PDF "${sourceName}" ini.`,
              },
            ],
          };
        } else if (
          ext === '.docx' ||
          req.file.mimetype ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ) {
          const extracted = await mammoth.extractRawText({ buffer: req.file.buffer });
          const docText = extracted.value?.trim();
          if (!docText) {
            res.status(400).json({
              error:
                'Dokumen Word (.docx) tidak mengandung teks yang dapat dibaca. Pastikan soal berupa teks, bukan sekadar gambar tempelan.',
            });
            return;
          }
          geminiInput = `Berikut isi dokumen Word (.docx) "${sourceName}". Ekstrak kop naskah dan seluruh soalnya:\n\n${docText}`;
        } else if (ext === '.txt' || req.file.mimetype.startsWith('text/')) {
          const docText = req.file.buffer.toString('utf-8').trim();
          if (!docText) {
            res.status(400).json({ error: 'File teks kosong.' });
            return;
          }
          geminiInput = `Berikut isi file teks naskah soal "${sourceName}". Ekstrak kop naskah dan seluruh soalnya:\n\n${docText}`;
        } else {
          res.status(400).json({
            error: `Format file "${ext || req.file.mimetype}" tidak didukung. Gunakan file PDF (.pdf), Word (.docx), atau teks (.txt).`,
          });
          return;
        }
      } else if (typeof req.body?.rawText === 'string' && req.body.rawText.trim().length > 0) {
        sourceName = req.body.fileName || 'Tempelan_Soal.txt';
        geminiInput = `Berikut teks naskah soal ujian. Ekstrak kop naskah dan seluruh soalnya:\n\n${req.body.rawText.trim()}`;
      } else {
        res.status(400).json({
          error: 'Silakan unggah file PDF/Word (.docx) atau masukkan teks soal terlebih dahulu.',
        });
        return;
      }
    } catch (preErr: any) {
      res.status(400).json({
        error: preErr?.message || 'Gagal membaca file dokumen yang diunggah.',
      });
      return;
    }

    // Stream SSE response so proxy gateways never idle-timeout on long exam documents
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    sendSseEvent(res, {
      type: 'status',
      message: `Menganalisis struktur dokumen ${sourceName}...`,
    });

    const keepaliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keepalive\n\n');
      }
    }, 3000);

    try {
      let lastReport = 0;
      const rawJsonText = await streamGeminiExtraction(geminiInput, (chars) => {
        if (chars - lastReport >= 400) {
          lastReport = chars;
          sendSseEvent(res, {
            type: 'status',
            message: `Mengekstrak butir soal dan opsi jawaban (${chars} karakter)...`,
          });
        }
      });

      const parsed = JSON.parse(rawJsonText);
      const normalized = normalizeParsedExam(parsed, sourceName);

      if (normalized.questions.length === 0) {
        sendSseEvent(res, {
          type: 'error',
          error:
            'Tidak ada butir soal yang berhasil dikenali dari dokumen tersebut. Pastikan file berisi daftar pertanyaan ujian yang jelas.',
        });
      } else {
        sendSseEvent(res, { type: 'done', data: normalized });
      }
    } catch (err: any) {
      console.error('Error parsing exam document:', err);
      const { status, rawMessage } = extractErrorInfo(err);
      const msg =
        status === 403 || status === 400
          ? 'Gagal memproses dokumen dengan API Gemini. Periksa validitas GEMINI_API_KEY di panel Settings > Secrets.'
          : status === 429
            ? 'Batas kuota permintaan tercapai sementara. Silakan tunggu beberapa detik lalu coba unggah kembali.'
            : status === 503
              ? 'Layanan ekstraksi AI sedang mengalami lonjakan trafik sementara. Silakan tunggu beberapa detik lalu coba kembali.'
              : rawMessage || 'Terjadi kesalahan saat membaca dokumen soal.';
      sendSseEvent(res, { type: 'error', error: msg });
    } finally {
      clearInterval(keepaliveTimer);
      res.end();
    }
  });

  // Ensure unknown /api/* routes return JSON instead of HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
  });

  // Global JSON error handler for Multer / Express errors so HTML error pages are never returned
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'Ukuran file terlalu besar. Batas maksimal ukuran file adalah 20 MB.',
        });
        return;
      }
      res.status(err?.status || 500).json({
        error: err?.message || 'Terjadi kesalahan pada server saat memproses permintaan.',
      });
      return;
    }
    next(err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AcakSoal server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
