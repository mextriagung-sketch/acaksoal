import { useEffect, useMemo, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import type { ExamVariant, ParsedExamData, ShuffleConfig } from './types/exam';
import { generateVariants } from './lib/randomizer';
import { exportAllVariantsZip } from './lib/exporters';
import { SAMPLE_EXAM_DATA } from './lib/sampleExam';
import { UploadWorkspace } from './components/UploadWorkspace';
import { VariantConfigSidebar } from './components/VariantConfigSidebar';
import { QuestionBankEditor } from './components/QuestionBankEditor';
import { PrintPreviewSheet } from './components/PrintPreviewSheet';
import { AnswerMatrixView } from './components/AnswerMatrixView';
import { IpUsageView } from './components/IpUsageView';
import { trackUsage } from './lib/usageTracker';

type ActiveTab = 'upload' | 'bank' | 'preview' | 'matrix' | 'usage';

const DEFAULT_CONFIG: ShuffleConfig = {
  variantCount: 4,
  variantPrefix: 'Paket',
  namingStyle: 'alphabet',
  shuffleQuestions: true,
  groupBySection: true,
  shuffleOptions: true,
  pinSpecialLastOption: true,
  includeAnswerKeyPage: true,
  showStudentIdentityBox: true,
  columns: 1,
};

export default function App() {
  const [examData, setExamData] = useState<ParsedExamData | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [config, setConfig] = useState<ShuffleConfig>(DEFAULT_CONFIG);
  const [seed, setSeed] = useState<number>(() => Math.floor(Date.now() % 1000000));
  const [activeVariantId, setActiveVariantId] = useState<string>('');
  const [isExportingZip, setIsExportingZip] = useState(false);

  const variants: ExamVariant[] = useMemo(() => {
    if (!examData || examData.questions.length === 0) return [];
    return generateVariants(examData, config, seed);
  }, [examData, config, seed]);

  useEffect(() => {
    trackUsage('visit');
  }, []);

  useEffect(() => {
    if (variants.length > 0 && !variants.some((v) => v.id === activeVariantId)) {
      setActiveVariantId(variants[0].id);
    }
  }, [variants, activeVariantId]);

  const handleExamLoaded = (data: ParsedExamData) => {
    setExamData(data);
    setSeed(Math.floor(Date.now() % 1000000) + 17);
    setActiveTab('preview');
  };

  const handleLoadSample = () => {
    trackUsage('load_sample');
    const cloned: ParsedExamData = JSON.parse(JSON.stringify(SAMPLE_EXAM_DATA));
    handleExamLoaded(cloned);
  };

  const handleReshuffle = () => {
    trackUsage('reshuffle');
    setSeed((prev) => (prev + 48611) % 2147483647);
  };

  const handleDownloadAllZip = async (format: 'pdf' | 'docx' | 'both') => {
    if (!examData || variants.length === 0) return;
    setIsExportingZip(true);
    try {
      await exportAllVariantsZip(examData, variants, config, format);
      trackUsage('export_zip', format.toUpperCase());
    } finally {
      setIsExportingZip(false);
    }
  };

  const navItems: { id: ActiveTab; label: string; requiresExam?: boolean }[] = [
    { id: 'upload', label: 'Unggah Sumber' },
    { id: 'bank', label: 'Bank Soal', requiresExam: true },
    { id: 'preview', label: 'Pratinjau Cetak', requiresExam: true },
    { id: 'matrix', label: 'Matriks Kunci', requiresExam: true },
    { id: 'usage', label: 'Pengguna IP' },
  ];

  const mcqCount = examData
    ? examData.questions.filter((q) => q.type === 'multiple_choice').length
    : 0;
  const essayCount = examData
    ? examData.questions.filter((q) => q.type === 'essay').length
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: exactly 3 zones separated by gap-8 */}
      <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab(examData ? 'preview' : 'upload')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            AcakSoal
          </button>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const disabled = Boolean(item.requiresExam && !examData);
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveTab(item.id)}
                  className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'border-blue-700 text-blue-700'
                      : disabled
                        ? 'border-transparent text-slate-300 cursor-not-allowed'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300 cursor-pointer'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="flex items-center shrink-0">
            {examData ? (
              <button
                type="button"
                disabled={isExportingZip}
                onClick={() => handleDownloadAllZip('both')}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <PackageCheck className="h-4 w-4" />
                {isExportingZip ? 'Menyiapkan...' : 'Unduh Semua (.zip)'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLoadSample}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
              >
                Coba Contoh Soal
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation strip */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-slate-100 px-6 py-2 text-xs font-medium">
          {navItems.map((item) => {
            const disabled = Boolean(item.requiresExam && !examData);
            const isActive = activeTab === item.id;
            return (
              <button
                key={`mobile-${item.id}`}
                type="button"
                disabled={disabled}
                onClick={() => setActiveTab(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'font-semibold text-blue-700 underline underline-offset-4'
                    : disabled
                      ? 'text-slate-300'
                      : 'text-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content */}
      {activeTab === 'usage' ? (
        <main className="flex-1">
          <IpUsageView />
        </main>
      ) : !examData || activeTab === 'upload' ? (
        <main className="flex-1">
          <UploadWorkspace
            onExamLoaded={handleExamLoaded}
            onLoadSample={handleLoadSample}
            hasExistingExam={Boolean(examData)}
            onCancel={() => setActiveTab('preview')}
          />
        </main>
      ) : (
        <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row">
          <div className="no-print">
            <VariantConfigSidebar
              config={config}
              onChange={setConfig}
              onReshuffle={handleReshuffle}
              onDownloadAllZip={handleDownloadAllZip}
              isExportingZip={isExportingZip}
              totalQuestions={examData.questions.length}
            />
          </div>

          <main className="min-w-0 flex-1 p-5 sm:p-8">
            {/* Contextual Unboxed Metadata Bar */}
            <div className="no-print mb-6 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  {examData.header.subject || examData.header.examTitle}
                </h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{examData.sourceFileName || 'Naskah Aktif'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{examData.questions.length} Soal</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{mcqCount} Pilihan Ganda</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{essayCount} Uraian</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{variants.length} Paket Dihasilkan</span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('bank')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'bank'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Edit Bank Soal
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pratinjau Dokumen
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('matrix')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === 'matrix'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Matriks Kunci
                </button>
              </div>
            </div>

            {activeTab === 'bank' && (
              <QuestionBankEditor exam={examData} onUpdateExam={setExamData} />
            )}

            {activeTab === 'preview' && (
              <PrintPreviewSheet
                exam={examData}
                variants={variants}
                activeVariantId={activeVariantId}
                onSelectVariant={setActiveVariantId}
                config={config}
              />
            )}

            {activeTab === 'matrix' && (
              <AnswerMatrixView
                exam={examData}
                variants={variants}
                onUpdateExam={setExamData}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}
