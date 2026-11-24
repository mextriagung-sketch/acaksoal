import React, { useState } from 'react';
import { Check, Download, FileText, KeyRound } from 'lucide-react';
import type { ExamVariant, ParsedExamData } from '../types/exam';
import {
  buildMasterKeyDocxBlob,
  buildMasterKeyPdfBlob,
  triggerBlobDownload,
} from '../lib/exporters';
import { parseAnswerKeyText } from '../lib/localExamParser';
import { trackUsage } from '../lib/usageTracker';

interface AnswerMatrixViewProps {
  exam: ParsedExamData;
  variants: ExamVariant[];
  onUpdateExam: (next: ParsedExamData) => void;
}

export const AnswerMatrixView: React.FC<AnswerMatrixViewProps> = ({
  exam,
  variants,
  onUpdateExam,
}) => {
  const [isExportingWord, setIsExportingWord] = useState(false);
  const [bulkKeyInput, setBulkKeyInput] = useState('');
  const [keyAppliedCount, setKeyAppliedCount] = useState<number | null>(null);

  const filePrefix = (exam.header.subject || 'Naskah_Ujian').replace(/[^a-zA-Z0-9_-]/g, '_');

  const mcqQuestions = exam.questions.filter((q) => q.type === 'multiple_choice');
  const missingKeyCount = mcqQuestions.filter((q) => !q.correctAnswer).length;

  const handleDownloadPdf = () => {
    const blob = buildMasterKeyPdfBlob(exam, variants);
    triggerBlobDownload(blob, `${filePrefix}_Kunci_Jawaban_Master.pdf`);
    trackUsage('export_pdf', 'Matriks Kunci');
  };

  const handleDownloadWord = async () => {
    setIsExportingWord(true);
    try {
      const blob = await buildMasterKeyDocxBlob(exam, variants);
      triggerBlobDownload(blob, `${filePrefix}_Kunci_Jawaban_Master.docx`);
      trackUsage('export_docx', 'Matriks Kunci');
    } finally {
      setIsExportingWord(false);
    }
  };

  const handleSetQuestionKey = (qId: string, answerLetter: string) => {
    onUpdateExam({
      ...exam,
      questions: exam.questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              correctAnswer: q.correctAnswer === answerLetter ? undefined : answerLetter,
            }
          : q
      ),
    });
  };

  const handleApplyBulkKeys = (e: React.FormEvent) => {
    e.preventDefault();
    const keyMap = parseAnswerKeyText(bulkKeyInput);
    if (keyMap.size === 0) return;

    let applied = 0;
    const updatedQuestions = exam.questions.map((q, idx) => {
      if (q.type !== 'multiple_choice') return q;
      const byOriginal = keyMap.get(q.originalNumber);
      const byPosition = keyMap.get(idx + 1);
      const matched = byOriginal || byPosition;
      if (matched) {
        applied += 1;
        return { ...q, correctAnswer: matched };
      }
      return q;
    });

    onUpdateExam({ ...exam, questions: updatedQuestions });
    setKeyAppliedCount(applied);
    setBulkKeyInput('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Matriks Kunci Jawaban Lintas Paket
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Menampilkan posisi nomor baru dan huruf kunci jawaban yang sudah disesuaikan untuk
            seluruh paket variasi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh Matriks PDF
          </button>
          <button
            type="button"
            disabled={isExportingWord}
            onClick={handleDownloadWord}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            {isExportingWord ? 'Menyusun...' : 'Unduh Matriks Word'}
          </button>
        </div>
      </div>

      {/* Quick Answer Key Input Panel */}
      {mcqQuestions.length > 0 && (
        <form
          onSubmit={handleApplyBulkKeys}
          className="rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <KeyRound className="h-4 w-4 text-blue-700 shrink-0" />
              <span>Isi atau Tempel Kunci Jawaban Asli</span>
            </div>
            <span className="text-xs text-slate-500 tabular-nums">
              {missingKeyCount > 0
                ? `${missingKeyCount} dari ${mcqQuestions.length} soal PG belum memiliki kunci`
                : `Seluruh ${mcqQuestions.length} kunci soal PG sudah terisi`}
            </span>
          </div>

          <p className="mt-1 text-xs text-slate-500">
            Jika naskah sumber belum mencantumkan kunci jawaban, masukkan deretan kunci seperti{' '}
            <span className="font-mono text-slate-700">1.B 2.A 3.C 4.D</span> atau langsung huruf
            berurutan seperti <span className="font-mono text-slate-700">BACDE...</span>, atau klik
            huruf opsi langsung di tabel bawah.
          </p>

          <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={bulkKeyInput}
              onChange={(e) => {
                setBulkKeyInput(e.target.value);
                setKeyAppliedCount(null);
              }}
              placeholder="Contoh: 1.B 2.C 3.A 4.D 5.E atau BCADE..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!bulkKeyInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="h-3.5 w-3.5" />
              Terapkan Kunci
            </button>
          </div>

          {keyAppliedCount !== null && (
            <p className="mt-2 text-xs font-medium text-emerald-700 tabular-nums">
              Berhasil memperbarui {keyAppliedCount} kunci jawaban. Seluruh paket di bawah otomatis
              disesuaikan.
            </p>
          )}
        </form>
      )}

      {/* Tabel Matriks Pemetaan */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
              <th className="px-4 py-3 whitespace-nowrap">No. Asli</th>
              <th className="px-4 py-3 whitespace-nowrap">Kunci Asli</th>
              {variants.map((v) => (
                <th key={v.id} className="px-4 py-3 whitespace-nowrap text-blue-800">
                  {v.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {exam.questions.map((origQ) => (
              <tr key={origQ.id} className="hover:bg-slate-50/70">
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                  {origQ.originalNumber}
                </td>
                <td className="px-4 py-2.5">
                  {origQ.type === 'multiple_choice' ? (
                    <div className="inline-flex items-center gap-1">
                      {(origQ.options.length > 0
                        ? origQ.options.map((o) => o.label)
                        : ['A', 'B', 'C', 'D', 'E']
                      ).map((letter) => {
                        const active =
                          origQ.correctAnswer?.trim().toUpperCase() === letter.toUpperCase();
                        return (
                          <button
                            key={`${origQ.id}-k-${letter}`}
                            type="button"
                            onClick={() => handleSetQuestionKey(origQ.id, letter)}
                            className={`h-6 w-6 rounded border font-mono text-[11px] font-semibold transition-colors ${
                              active
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-800'
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="font-mono text-xs font-medium text-slate-500">Uraian</span>
                  )}
                </td>
                {variants.map((v) => {
                  const match = v.questions.find((sq) => sq.id === origQ.id);
                  return (
                    <td
                      key={`${origQ.id}-${v.id}`}
                      className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap"
                    >
                      {!match ? (
                        '-'
                      ) : match.type === 'multiple_choice' ? (
                        <span>
                          No.{match.displayNumber}{' '}
                          <strong
                            className={
                              match.remappedCorrectAnswer ? 'text-emerald-700' : 'text-slate-400'
                            }
                          >
                            ({match.remappedCorrectAnswer || '-'})
                          </strong>
                        </span>
                      ) : (
                        <span>No.{match.displayNumber}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ringkasan Koreksi Cepat per Paket */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {variants.map((v) => {
          const mcqs = v.questions.filter((q) => q.type === 'multiple_choice');
          return (
            <div key={`summary-${v.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Rekap Kunci Koreksi — {v.label}
              </h3>
              {mcqs.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Tidak terdapat soal pilihan ganda pada paket ini.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-5 gap-2 font-mono text-xs tabular-nums">
                  {mcqs.map((q) => (
                    <div
                      key={`recap-${v.id}-${q.id}`}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                    >
                      <span className="text-slate-500">{q.displayNumber}.</span>
                      <span
                        className={`font-bold ${
                          q.remappedCorrectAnswer ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {q.remappedCorrectAnswer || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
