import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import type { ExamHeader, ExamQuestion, ParsedExamData } from '../types/exam';

interface QuestionBankEditorProps {
  exam: ParsedExamData;
  onUpdateExam: (next: ParsedExamData) => void;
}

export const QuestionBankEditor: React.FC<QuestionBankEditorProps> = ({
  exam,
  onUpdateExam,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'multiple_choice' | 'essay'>('all');
  const [showHeaderEditor, setShowHeaderEditor] = useState(false);

  const updateHeader = <K extends keyof ExamHeader>(key: K, value: ExamHeader[K]) => {
    onUpdateExam({
      ...exam,
      header: { ...exam.header, [key]: value },
    });
  };

  const updateQuestion = (id: string, patch: Partial<ExamQuestion>) => {
    onUpdateExam({
      ...exam,
      questions: exam.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  };

  const updateOptionText = (qId: string, optIdx: number, text: string) => {
    onUpdateExam({
      ...exam,
      questions: exam.questions.map((q) => {
        if (q.id !== qId) return q;
        const nextOpts = q.options.map((o, idx) => (idx === optIdx ? { ...o, text } : o));
        return { ...q, options: nextOpts };
      }),
    });
  };

  const deleteQuestion = (id: string) => {
    const remaining = exam.questions
      .filter((q) => q.id !== id)
      .map((q, idx) => ({ ...q, originalNumber: idx + 1 }));
    onUpdateExam({ ...exam, questions: remaining });
  };

  const addQuestion = (type: 'multiple_choice' | 'essay') => {
    const nextNum = exam.questions.length + 1;
    const newQ: ExamQuestion = {
      id: `q-manual-${Date.now()}`,
      originalNumber: nextNum,
      type,
      sectionTitle:
        type === 'multiple_choice' ? 'Bagian I: Pilihan Ganda' : 'Bagian II: Uraian',
      stem: type === 'multiple_choice' ? 'Tulis pertanyaan pilihan ganda baru...' : 'Tulis pertanyaan uraian baru...',
      options:
        type === 'multiple_choice'
          ? [
              { label: 'A', text: 'Pilihan A' },
              { label: 'B', text: 'Pilihan B' },
              { label: 'C', text: 'Pilihan C' },
              { label: 'D', text: 'Pilihan D' },
            ]
          : [],
      correctAnswer: type === 'multiple_choice' ? 'A' : '',
      lockPosition: false,
    };
    onUpdateExam({
      ...exam,
      questions: [...exam.questions, newQ],
    });
  };

  const mcqCount = exam.questions.filter((q) => q.type === 'multiple_choice').length;
  const essayCount = exam.questions.filter((q) => q.type === 'essay').length;

  const filteredQuestions = exam.questions.filter((q) => {
    if (typeFilter !== 'all' && q.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const needle = searchQuery.toLowerCase();
      const inStem = q.stem.toLowerCase().includes(needle);
      const inOpts = q.options.some((o) => o.text.toLowerCase().includes(needle));
      const inPassage = q.passage?.toLowerCase().includes(needle);
      return inStem || inOpts || inPassage;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Kop Naskah Collapsible Card */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowHeaderEditor((prev) => !prev)}
          className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50/70 transition-colors rounded-xl"
        >
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Identitas & Kop Naskah Ujian
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {exam.header.schoolName} · {exam.header.examTitle} · {exam.header.subject} (Kelas{' '}
              {exam.header.gradeLevel})
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
            {showHeaderEditor ? 'Tutup Editor Kop' : 'Ubah Kop Naskah'}
            {showHeaderEditor ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </span>
        </button>

        {showHeaderEditor && (
          <div className="border-t border-slate-200 px-5 py-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Nama Sekolah / Instansi
                </label>
                <input
                  type="text"
                  value={exam.header.schoolName}
                  onChange={(e) => updateHeader('schoolName', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Judul Ujian
                </label>
                <input
                  type="text"
                  value={exam.header.examTitle}
                  onChange={(e) => updateHeader('examTitle', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Mata Pelajaran
                </label>
                <input
                  type="text"
                  value={exam.header.subject}
                  onChange={(e) => updateHeader('subject', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Kelas</label>
                  <input
                    type="text"
                    value={exam.header.gradeLevel}
                    onChange={(e) => updateHeader('gradeLevel', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    value={exam.header.academicYear}
                    onChange={(e) => updateHeader('academicYear', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Waktu</label>
                  <input
                    type="text"
                    value={exam.header.duration}
                    onChange={(e) => updateHeader('duration', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700">
                  Petunjuk Umum Ujian
                </label>
                <textarea
                  rows={2}
                  value={exam.header.instructions}
                  onChange={(e) => updateHeader('instructions', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Toolbar Bank Soal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari teks soal..."
              className="w-56 rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                typeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({exam.questions.length})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('multiple_choice')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                typeFilter === 'multiple_choice'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pilihan Ganda ({mcqCount})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('essay')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                typeFilter === 'essay'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Uraian ({essayCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => addQuestion('multiple_choice')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah PG
          </button>
          <button
            type="button"
            onClick={() => addQuestion('essay')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Uraian
          </button>
        </div>
      </div>

      {/* Question List */}
      {filteredQuestions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">
            Tidak ada soal yang sesuai dengan filter atau pencarian.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ubah kata kunci pencarian atau tambahkan butir soal baru secara manual.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {filteredQuestions.map((q) => (
            <div key={q.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    Soal #{q.originalNumber}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Uraian'}</span>
                  {q.sectionTitle && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{q.sectionTitle}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateQuestion(q.id, { lockPosition: !q.lockPosition })}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      q.lockPosition
                        ? 'border-amber-300 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Jika dikunci, nomor soal ini tidak ikut berpindah saat diacak"
                  >
                    {q.lockPosition ? (
                      <>
                        <Lock className="h-3 w-3" />
                        Posisi Terkunci
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3 w-3" />
                        Ikut Diacak
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteQuestion(q.id)}
                    aria-label={`Hapus soal nomor ${q.originalNumber}`}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {q.passage && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs italic leading-relaxed text-slate-700">
                  <span className="font-semibold not-italic text-slate-800">Wacana: </span>
                  {q.passage}
                </div>
              )}

              <textarea
                rows={2}
                value={q.stem}
                onChange={(e) => updateQuestion(q.id, { stem: e.target.value })}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
              />

              {q.type === 'multiple_choice' ? (
                <div className="mt-3 space-y-2">
                  {q.options.map((opt, idx) => {
                    const isCorrect =
                      q.correctAnswer?.trim().toUpperCase() === opt.label.toUpperCase();
                    return (
                      <div key={`${q.id}-opt-${opt.label}`} className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => updateQuestion(q.id, { correctAnswer: opt.label })}
                          title="Tandai sebagai kunci jawaban"
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-semibold transition-colors ${
                            isCorrect
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => updateOptionText(q.id, idx, e.target.value)}
                          className="w-full rounded-md border border-slate-200 px-2.5 py-1 text-sm text-slate-800 focus:border-blue-600 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                  <p className="pt-1 text-xs text-slate-500">
                    Klik huruf opsi untuk menandai kunci jawaban (saat ini:{' '}
                    <span className="font-mono font-semibold text-emerald-700">
                      {q.correctAnswer || 'Belum dipilih'}
                    </span>
                    ).
                  </p>
                </div>
              ) : (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Kunci / Rubrik Penilaian Uraian (opsional)
                  </label>
                  <input
                    type="text"
                    value={q.correctAnswer || ''}
                    onChange={(e) => updateQuestion(q.id, { correctAnswer: e.target.value })}
                    placeholder="Masukkan poin kunci jawaban uraian..."
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
