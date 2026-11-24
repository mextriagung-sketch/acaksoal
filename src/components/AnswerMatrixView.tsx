import React, { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import type { ExamVariant, ParsedExamData } from '../types/exam';
import {
  buildMasterKeyDocxBlob,
  buildMasterKeyPdfBlob,
  triggerBlobDownload,
} from '../lib/exporters';

interface AnswerMatrixViewProps {
  exam: ParsedExamData;
  variants: ExamVariant[];
}

export const AnswerMatrixView: React.FC<AnswerMatrixViewProps> = ({ exam, variants }) => {
  const [isExportingWord, setIsExportingWord] = useState(false);

  const filePrefix = (exam.header.subject || 'Naskah_Ujian').replace(/[^a-zA-Z0-9_-]/g, '_');

  const handleDownloadPdf = () => {
    const blob = buildMasterKeyPdfBlob(exam, variants);
    triggerBlobDownload(blob, `${filePrefix}_Kunci_Jawaban_Master.pdf`);
  };

  const handleDownloadWord = async () => {
    setIsExportingWord(true);
    try {
      const blob = await buildMasterKeyDocxBlob(exam, variants);
      triggerBlobDownload(blob, `${filePrefix}_Kunci_Jawaban_Master.docx`);
    } finally {
      setIsExportingWord(false);
    }
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
                <td className="px-4 py-2.5 font-mono text-xs font-semibold text-emerald-700">
                  {origQ.type === 'multiple_choice'
                    ? origQ.correctAnswer || '-'
                    : 'Uraian'}
                </td>
                {variants.map((v) => {
                  const match = v.questions.find((sq) => sq.id === origQ.id);
                  return (
                    <td
                      key={`${origQ.id}-${v.id}`}
                      className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums"
                    >
                      {!match ? (
                        '-'
                      ) : match.type === 'multiple_choice' ? (
                        <span>
                          No.{match.displayNumber}{' '}
                          <strong className="text-slate-900">
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
                      <span className="font-bold text-slate-900">
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
