import React, { useState } from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import type { ExamVariant, ParsedExamData, ShuffleConfig } from '../types/exam';
import {
  buildVariantDocxBlob,
  buildVariantPdfBlob,
  triggerBlobDownload,
} from '../lib/exporters';
import { trackUsage } from '../lib/usageTracker';

interface PrintPreviewSheetProps {
  exam: ParsedExamData;
  variants: ExamVariant[];
  activeVariantId: string;
  onSelectVariant: (id: string) => void;
  config: ShuffleConfig;
}

export const PrintPreviewSheet: React.FC<PrintPreviewSheetProps> = ({
  exam,
  variants,
  activeVariantId,
  onSelectVariant,
  config,
}) => {
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const activeVariant =
    variants.find((v) => v.id === activeVariantId) || variants[0];

  if (!activeVariant) return null;

  const baseFileName = `${(exam.header.subject || 'Naskah_Ujian').replace(/[^a-zA-Z0-9_-]/g, '_')}_${activeVariant.label.replace(/\s+/g, '_')}`;

  const handleDownloadPdf = () => {
    const blob = buildVariantPdfBlob(exam, activeVariant, config);
    triggerBlobDownload(blob, `${baseFileName}.pdf`);
    trackUsage('export_pdf', activeVariant.label);
  };

  const handleDownloadDocx = async () => {
    setIsExportingDocx(true);
    try {
      const blob = await buildVariantDocxBlob(exam, activeVariant, config);
      triggerBlobDownload(blob, `${baseFileName}.docx`);
      trackUsage('export_docx', activeVariant.label);
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  let lastSection = '';

  return (
    <div className="space-y-4">
      {/* Variant Switcher & Individual Download Bar */}
      <div className="no-print flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectVariant(v.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                v.id === activeVariant.id
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            Unduh PDF ({activeVariant.code})
          </button>
          <button
            type="button"
            disabled={isExportingDocx}
            onClick={handleDownloadDocx}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            {isExportingDocx ? 'Menyusun...' : `Unduh Word (${activeVariant.code})`}
          </button>
        </div>
      </div>

      {/* A4 Paper Preview */}
      <div className="print-only-sheet exam-paper-font mx-auto max-w-[820px] rounded-xl border border-slate-200 bg-white px-8 py-10 text-slate-950 shadow-xs sm:px-12 sm:py-12">
        {/* Kop Surat */}
        <div className="flex items-start justify-between gap-4 border-b-4 border-double border-slate-900 pb-4">
          <div className="flex-1 text-center">
            <p className="text-base font-bold uppercase tracking-wide">
              {exam.header.schoolName}
            </p>
            <p className="mt-0.5 text-sm font-bold uppercase">
              {exam.header.examTitle}
            </p>
            <p className="mt-1 text-xs text-slate-700">
              {[
                exam.header.subject ? `Mapel: ${exam.header.subject}` : '',
                exam.header.gradeLevel ? `Kelas: ${exam.header.gradeLevel}` : '',
                exam.header.academicYear ? `TA: ${exam.header.academicYear}` : '',
                exam.header.duration ? `Waktu: ${exam.header.duration}` : '',
              ]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
          </div>

          <div className="shrink-0 border-2 border-slate-900 px-3 py-1.5 text-center">
            <div className="font-sans text-[10px] font-bold tracking-wider text-slate-600 uppercase">
              Kode Naskah
            </div>
            <div className="mt-0.5 text-sm font-bold uppercase">{activeVariant.label}</div>
          </div>
        </div>

        {/* Kotak Identitas Peserta */}
        {config.showStudentIdentityBox && (
          <div className="mt-4 grid grid-cols-1 gap-y-2 border border-slate-400 px-4 py-3 text-xs sm:grid-cols-2 sm:gap-x-6">
            <div>Nama Lengkap : ..................................................</div>
            <div>Kelas / Ruang : .................................</div>
            <div>No. Peserta &nbsp;&nbsp;&nbsp;: ..................................................</div>
            <div>Tanggal Ujian : .................................</div>
          </div>
        )}

        {/* Petunjuk Umum */}
        {exam.header.instructions?.trim() && (
          <div className="mt-4 border-b border-slate-300 pb-3 text-xs leading-relaxed">
            <p className="font-bold uppercase">Petunjuk Umum:</p>
            <p className="mt-1 whitespace-pre-line text-slate-800">
              {exam.header.instructions.trim()}
            </p>
          </div>
        )}

        {/* Daftar Soal */}
        <div
          className={`mt-6 ${
            config.columns === 2
              ? 'columns-1 gap-8 md:columns-2 md:gap-x-8 md:[column-rule:1px_solid_#e2e8f0]'
              : 'space-y-5'
          }`}
        >
          {activeVariant.questions.map((q) => {
            const sectionLabel =
              q.sectionTitle?.trim() ||
              (q.type === 'multiple_choice'
                ? 'Bagian I: Pilihan Ganda'
                : 'Bagian II: Uraian');
            const showSection = sectionLabel !== lastSection;
            if (showSection) {
              lastSection = sectionLabel;
            }

            return (
              <div key={q.id} className="mb-5 break-inside-avoid">
                {showSection && (
                  <div className="mb-3 bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-900">
                    {sectionLabel}
                  </div>
                )}

                {q.passage && (
                  <p className="mb-2 pl-6 text-xs italic leading-relaxed text-slate-700">
                    {q.passage}
                  </p>
                )}

                <div className="flex items-start gap-2 text-[13.5px] leading-relaxed">
                  <span className="w-5 shrink-0 font-bold tabular-nums">
                    {q.displayNumber}.
                  </span>
                  <div className="flex-1">
                    <p>{q.stem}</p>

                    {q.type === 'multiple_choice' && q.options.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {q.options.map((opt) => (
                          <div key={`${q.id}-${opt.label}`} className="flex items-start gap-2">
                            <span className="w-5 shrink-0 font-semibold">{opt.label}.</span>
                            <span className="flex-1">{opt.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Lampiran Kunci Jawaban di Pratinjau jika diaktifkan */}
        {config.includeAnswerKeyPage && (
          <div className="mt-10 border-t-2 border-dashed border-slate-300 pt-6">
            <h3 className="text-sm font-bold uppercase tracking-wide">
              Kunci Jawaban & Pemetaan Nomor — {activeVariant.label}
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 text-left">
                    <th className="border border-slate-300 px-3 py-1.5 font-bold">No. Paket</th>
                    <th className="border border-slate-300 px-3 py-1.5 font-bold">No. Asli</th>
                    <th className="border border-slate-300 px-3 py-1.5 font-bold">Jenis</th>
                    <th className="border border-slate-300 px-3 py-1.5 font-bold">
                      Kunci Jawaban
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeVariant.questions.map((q) => (
                    <tr key={`key-${q.id}`}>
                      <td className="border border-slate-300 px-3 py-1 font-mono tabular-nums">
                        {q.displayNumber}
                      </td>
                      <td className="border border-slate-300 px-3 py-1 font-mono tabular-nums text-slate-600">
                        {q.originalNumber}
                      </td>
                      <td className="border border-slate-300 px-3 py-1">
                        {q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Uraian'}
                      </td>
                      <td className="border border-slate-300 px-3 py-1 font-bold">
                        {q.type === 'multiple_choice'
                          ? q.remappedCorrectAnswer || '-'
                          : q.correctAnswer || '(Rubrik Uraian)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
