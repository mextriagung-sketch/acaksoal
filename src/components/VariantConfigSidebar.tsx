import React from 'react';
import { Download, FileText, PackageCheck, RefreshCw } from 'lucide-react';
import type { ShuffleConfig } from '../types/exam';

interface VariantConfigSidebarProps {
  config: ShuffleConfig;
  onChange: (next: ShuffleConfig) => void;
  onReshuffle: () => void;
  onDownloadAllZip: (format: 'pdf' | 'docx' | 'both') => void;
  isExportingZip: boolean;
  totalQuestions: number;
}

export const VariantConfigSidebar: React.FC<VariantConfigSidebarProps> = ({
  config,
  onChange,
  onReshuffle,
  onDownloadAllZip,
  isExportingZip,
  totalQuestions,
}) => {
  const update = <K extends keyof ShuffleConfig>(key: K, value: ShuffleConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r">
      <div className="p-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Pengaturan Pengacakan</h2>
            <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {totalQuestions} butir soal sumber
            </p>
          </div>
          <button
            type="button"
            onClick={onReshuffle}
            title="Acak ulang seluruh urutan paket"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Acak Ulang
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Jumlah Paket */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="variant-count" className="text-xs font-medium text-slate-700">
                Jumlah Paket Variasi
              </label>
              <span className="font-mono text-xs font-semibold text-blue-700 tabular-nums">
                {config.variantCount} Paket
              </span>
            </div>
            <input
              id="variant-count"
              type="range"
              min={1}
              max={10}
              value={config.variantCount}
              onChange={(e) => update('variantCount', Number(e.target.value))}
              className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-700"
            />
            <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400 tabular-nums">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Awalan & Kode Paket */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="variant-prefix" className="block text-xs font-medium text-slate-700">
                Label Paket
              </label>
              <input
                id="variant-prefix"
                type="text"
                value={config.variantPrefix}
                onChange={(e) => update('variantPrefix', e.target.value)}
                placeholder="Paket"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Penamaan</label>
              <div className="mt-1.5 grid grid-cols-2 rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => update('namingStyle', 'alphabet')}
                  className={`rounded-md py-1 text-xs font-medium transition-colors ${
                    config.namingStyle === 'alphabet'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  A, B, C
                </button>
                <button
                  type="button"
                  onClick={() => update('namingStyle', 'numeric')}
                  className={`rounded-md py-1 text-xs font-medium transition-colors ${
                    config.namingStyle === 'numeric'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  01, 02
                </button>
              </div>
            </div>
          </div>

          {/* Opsi Pengacakan */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-800">Aturan Pengacakan</p>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={config.shuffleQuestions}
                onChange={(e) => update('shuffleQuestions', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs leading-snug text-slate-700">
                Acak urutan nomor soal antar paket
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={config.groupBySection}
                onChange={(e) => update('groupBySection', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs leading-snug text-slate-700">
                Pisahkan kelompok bagian (Pilihan Ganda & Uraian tetap terkelompok)
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={config.shuffleOptions}
                onChange={(e) => update('shuffleOptions', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs leading-snug text-slate-700">
                Acak urutan pilihan jawaban (A–E) & sesuaikan kunci jawaban otomatis
              </span>
            </label>

            {config.shuffleOptions && (
              <label className="flex cursor-pointer items-start gap-2.5 pl-6">
                <input
                  type="checkbox"
                  checked={config.pinSpecialLastOption}
                  onChange={(e) => update('pinSpecialLastOption', e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-xs leading-snug text-slate-600">
                  Tahan opsi &ldquo;Semua benar/salah&rdquo; di posisi terakhir
                </span>
              </label>
            )}
          </div>

          {/* Tata Letak Dokumen Cetak */}
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-800">Format Dokumen Siap Cetak</p>

            <div>
              <span className="block text-xs text-slate-600">Kolom Halaman Naskah</span>
              <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => update('columns', 1)}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                    config.columns === 1
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1 Kolom
                </button>
                <button
                  type="button"
                  onClick={() => update('columns', 2)}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors ${
                    config.columns === 2
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2 Kolom
                </button>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={config.showStudentIdentityBox}
                onChange={(e) => update('showStudentIdentityBox', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs leading-snug text-slate-700">
                Tampilkan kotak identitas peserta (Nama, Kelas, No. Ujian)
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={config.includeAnswerKeyPage}
                onChange={(e) => update('includeAnswerKeyPage', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
              />
              <span className="text-xs leading-snug text-slate-700">
                Lampirkan halaman kunci jawaban di akhir tiap file paket
              </span>
            </label>
          </div>

          {/* Unduh Massal ZIP */}
          <div className="space-y-2 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-800">Unduh Semua Paket Sekaligus</p>
            <button
              type="button"
              disabled={isExportingZip}
              onClick={() => onDownloadAllZip('both')}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors"
            >
              <PackageCheck className="h-4 w-4" />
              {isExportingZip ? 'Menyiapkan Arsip...' : 'Unduh Semua PDF + Word (.zip)'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isExportingZip}
                onClick={() => onDownloadAllZip('pdf')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-red-600" />
                Semua PDF
              </button>
              <button
                type="button"
                disabled={isExportingZip}
                onClick={() => onDownloadAllZip('docx')}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <FileText className="h-3.5 w-3.5 text-blue-700" />
                Semua Word
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
