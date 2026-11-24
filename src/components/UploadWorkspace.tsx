import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  Shuffle,
} from 'lucide-react';
import type { ParsedExamData } from '../types/exam';
import {
  parseExamFileInBrowser,
  parseExamFromRawText,
} from '../lib/localExamParser';
import { trackUsage } from '../lib/usageTracker';

interface UploadWorkspaceProps {
  onExamLoaded: (data: ParsedExamData) => void;
  onLoadSample: () => void;
  hasExistingExam: boolean;
  onCancel?: () => void;
}

class EndpointNotFoundError extends Error {
  constructor() {
    super('API_NOT_FOUND');
  }
}

async function consumeParseResponse(
  res: Response,
  onStatus: (msg: string) => void
): Promise<ParsedExamData> {
  const contentType = res.headers.get('content-type') || '';

  if (res.status === 404 || (res.ok && contentType.includes('text/html'))) {
    throw new EndpointNotFoundError();
  }

  if (contentType.includes('text/event-stream')) {
    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('Koneksi streaming ke server tidak tersedia.');
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: ParsedExamData | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const rawEvent of events) {
        const line = rawEvent
          .split('\n')
          .find((l) => l.startsWith('data:'));
        if (!line) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        const evt = JSON.parse(jsonStr);
        if (evt.type === 'status' && evt.message) {
          onStatus(evt.message);
        } else if (evt.type === 'error') {
          throw new Error(evt.error || 'Gagal memproses dokumen.');
        } else if (evt.type === 'done' && evt.data) {
          finalData = evt.data as ParsedExamData;
        }
      }
    }

    if (!finalData) {
      throw new Error('Pemrosesan dokumen terputus sebelum selesai. Silakan coba lagi.');
    }
    return finalData;
  }

  const rawText = await res.text();
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    if (res.status === 413) {
      throw new Error('Ukuran file melebihi batas unggahan server. Coba kompres PDF atau pecah file.');
    }
    if (res.status === 502 || res.status === 504) {
      throw new Error('Server membutuhkan waktu terlalu lama untuk merespons. Silakan coba kembali.');
    }
    throw new Error(
      `Server mengembalikan respons yang tidak valid (HTTP ${res.status}). Pastikan format file adalah PDF atau Word (.docx).`
    );
  }

  if (!res.ok) {
    throw new Error(parsedJson?.error || `Gagal memproses dokumen (HTTP ${res.status}).`);
  }

  return parsedJson as ParsedExamData;
}

export const UploadWorkspace: React.FC<UploadWorkspaceProps> = ({
  onExamLoaded,
  onLoadSample,
  hasExistingExam,
  onCancel,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputMode, setInputMode] = useState<'file' | 'paste'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Sedang mengekstrak butir soal dan pilihan jawaban...');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setErrorMsg(null);
    setSelectedFileName(file.name);
    setStatusMessage(`Mengunggah dan membaca ${file.name}...`);
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/parse-exam', {
        method: 'POST',
        body: formData,
      });

      const parsed = await consumeParseResponse(res, setStatusMessage);
      onExamLoaded(parsed);
    } catch (err: any) {
      if (err instanceof EndpointNotFoundError) {
        try {
          setStatusMessage(`Membaca ${file.name} langsung di browser...`);
          const localParsed = await parseExamFileInBrowser(file);
          trackUsage('parse_exam', file.name);
          onExamLoaded(localParsed);
          return;
        } catch (localErr: any) {
          setErrorMsg(localErr?.message || 'Gagal membaca dokumen di browser.');
          return;
        }
      }
      setErrorMsg(err?.message || 'Terjadi kesalahan saat membaca dokumen.');
    } finally {
      setIsParsing(false);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) {
      setErrorMsg('Tempelkan teks naskah soal terlebih dahulu.');
      return;
    }
    setErrorMsg(null);
    setStatusMessage('Menganalisis teks naskah soal...');
    setIsParsing(true);

    try {
      const res = await fetch('/api/parse-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: pastedText,
          fileName: 'Naskah_Teks_Langsung.txt',
        }),
      });
      const parsed = await consumeParseResponse(res, setStatusMessage);
      onExamLoaded(parsed);
    } catch (err: any) {
      if (err instanceof EndpointNotFoundError) {
        try {
          const localParsed = parseExamFromRawText(pastedText, 'Naskah_Teks_Langsung.txt');
          if (localParsed.questions.length === 0) {
            throw new Error(
              'Tidak ada butir soal bernomor yang terdeteksi. Pastikan tiap soal diawali nomor (misalnya: 1. Pertanyaan...).'
            );
          }
          trackUsage('parse_exam', 'Tempelan_Soal.txt');
          onExamLoaded(localParsed);
          return;
        } catch (localErr: any) {
          setErrorMsg(localErr?.message || 'Gagal memproses teks soal.');
          return;
        }
      }
      setErrorMsg(err?.message || 'Terjadi kesalahan saat memproses teks soal.');
    } finally {
      setIsParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Acak Naskah Soal Ujian Sekolah
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
            Unggah naskah soal berformat PDF atau Microsoft Word (.docx) sebagai sumber data.
            Sistem menyusun beberapa paket variasi soal dengan urutan berbeda dan menghasilkan
            dokumen siap cetak beserta kunci jawabannya.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasExistingExam && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Kembali ke Naskah Aktif
            </button>
          )}
          <button
            type="button"
            onClick={onLoadSample}
            disabled={isParsing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <BookOpen className="h-4 w-4 text-blue-700" />
            Gunakan Contoh Naskah
          </button>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setInputMode('file');
              setErrorMsg(null);
            }}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'file'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Unggah File PDF / Word
          </button>
          <button
            type="button"
            onClick={() => {
              setInputMode('paste');
              setErrorMsg(null);
            }}
            className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              inputMode === 'paste'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tempel Teks Soal
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
          <span>Format didukung: .pdf, .docx, .txt</span>
          <span aria-hidden="true">·</span>
          <span>Maksimal 20 MB</span>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Gagal Memproses Dokumen</p>
            <p className="mt-0.5 text-red-700">{errorMsg}</p>
          </div>
        </div>
      )}

      {inputMode === 'file' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            isDragging
              ? 'border-blue-600 bg-blue-50/60'
              : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file);
              }
              e.target.value = '';
            }}
          />

          {isParsing ? (
            <div className="flex flex-col items-center">
              <Loader2 className="h-10 w-10 animate-spin text-blue-700" />
              <p className="mt-4 text-base font-semibold text-slate-900">
                {statusMessage}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                File sumber: {selectedFileName}. Proses berjalan secara otomatis.
              </p>
            </div>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-blue-700">
                <FileUp className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                Tarik & lepas file soal PDF atau Word (.docx) di sini
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-slate-500">
                Mendukung soal pilihan ganda, wacana bacaan, soal uraian, serta deteksi otomatis
                kop ujian dan kunci jawaban jika tersedia di dokumen.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 transition-colors whitespace-nowrap shrink-0"
                >
                  Pilih File dari Komputer
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <form
          onSubmit={handlePasteSubmit}
          className="rounded-xl border border-slate-200 bg-white p-6"
        >
          <label htmlFor="raw-exam-text" className="block text-sm font-semibold text-slate-900">
            Tempel Teks Naskah Soal
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Salin teks soal bernomor beserta pilihan A, B, C, D, E dari Microsoft Word atau Google
            Docs lalu tempel di kolom berikut.
          </p>
          <textarea
            id="raw-exam-text"
            rows={11}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={`Contoh:\n1. Ibu kota negara Indonesia yang baru adalah...\nA. Bandung\nB. Nusantara\nC. Surabaya\nD. Medan\nKunci: B\n\n2. Sebutkan tiga prinsip utama ekosistem seimbang!`}
            className="mt-3 w-full rounded-lg border border-slate-300 bg-slate-50/50 p-3.5 font-sans text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {isParsing ? statusMessage : ''}
            </span>
            <button
              type="submit"
              disabled={isParsing || !pastedText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {isParsing && <Loader2 className="h-4 w-4 animate-spin" />}
              {isParsing ? 'Mengekstrak Soal...' : 'Proses Naskah Soal'}
            </button>
          </div>
        </form>
      )}

      {/* Clean 3-column workflow summary (no pill badges, no nested cards) */}
      <div className="mt-10 grid grid-cols-1 gap-6 border-t border-slate-200 pt-8 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText className="h-4 w-4 text-blue-700 shrink-0" />
            <span>01. Ekstraksi Otomatis PDF & Word</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Memisahkan kop naskah, teks bacaan, nomor soal, opsi pilihan ganda, dan soal uraian
            secara terstruktur agar siap diacak.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Shuffle className="h-4 w-4 text-blue-700 shrink-0" />
            <span>02. Variasi Paket & Kunci Terpeta</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Hasilkan Paket A, B, C, hingga J secara unik. Jika opsi A–E ikut diacak, huruf kunci
            jawaban otomatis ikut disesuaikan.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileSpreadsheet className="h-4 w-4 text-blue-700 shrink-0" />
            <span>03. Unduh Siap Cetak PDF & Word</span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Unduh masing-masing paket atau sekaligus dalam arsip ZIP berformat A4 PDF dan Microsoft
            Word (.docx) lengkap dengan matriks koreksi.
          </p>
        </div>
      </div>
    </div>
  );
};
