import type {
  ExamQuestion,
  ExamVariant,
  ParsedExamData,
  QuestionOption,
  ShuffleConfig,
  ShuffledQuestion,
} from '../types/exam';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function fisherYates<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isPinnedLastOptionText(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return (
    /semua\s+(jawaban|pilihan|pernyataan)?\s*(di\s*atas\s*)?(benar|salah)/.test(normalized) ||
    /tidak\s+ada\s+(jawaban\s+yang\s+)?benar/.test(normalized) ||
    /^[a-e]\s*(,|dan|serta|&)\s*[a-e]\s+(benar|salah)/.test(normalized) ||
    /keduanya\s+(benar|salah)/.test(normalized)
  );
}

function shuffleQuestionOptions(
  question: ExamQuestion,
  rand: () => number,
  config: ShuffleConfig
): {
  options: QuestionOption[];
  remappedCorrectAnswer?: string;
  optionMapping?: { newLabel: string; originalLabel: string }[];
} {
  if (question.type !== 'multiple_choice' || question.options.length <= 1) {
    return {
      options: question.options,
      remappedCorrectAnswer: question.correctAnswer,
    };
  }

  const originalOptions = question.options.map((opt, idx) => ({
    originalLabel: (opt.label || OPTION_LETTERS[idx] || String(idx + 1)).trim().toUpperCase(),
    text: opt.text,
  }));

  if (!config.shuffleOptions) {
    const cleanOptions = originalOptions.map((o, idx) => ({
      label: OPTION_LETTERS[idx] || o.originalLabel,
      text: o.text,
    }));
    return {
      options: cleanOptions,
      remappedCorrectAnswer: question.correctAnswer?.trim().toUpperCase(),
      optionMapping: cleanOptions.map((o, idx) => ({
        newLabel: o.label,
        originalLabel: originalOptions[idx].originalLabel,
      })),
    };
  }

  const lastIdx = originalOptions.length - 1;
  const shouldPinLast =
    config.pinSpecialLastOption && isPinnedLastOptionText(originalOptions[lastIdx].text);

  let shuffledPool: typeof originalOptions;
  if (shouldPinLast && originalOptions.length > 2) {
    const head = fisherYates(originalOptions.slice(0, lastIdx), rand);
    shuffledPool = [...head, originalOptions[lastIdx]];
  } else {
    shuffledPool = fisherYates(originalOptions, rand);
  }

  const newOptions: QuestionOption[] = [];
  const mapping: { newLabel: string; originalLabel: string }[] = [];
  const normalizedOriginalAnswer = question.correctAnswer?.trim().toUpperCase();
  let remappedAnswer = normalizedOriginalAnswer;

  shuffledPool.forEach((item, idx) => {
    const newLabel = OPTION_LETTERS[idx] || String(idx + 1);
    newOptions.push({ label: newLabel, text: item.text });
    mapping.push({ newLabel, originalLabel: item.originalLabel });
    if (normalizedOriginalAnswer && item.originalLabel === normalizedOriginalAnswer) {
      remappedAnswer = newLabel;
    }
  });

  return {
    options: newOptions,
    remappedCorrectAnswer: remappedAnswer,
    optionMapping: mapping,
  };
}

function reorderWithLocks(
  items: ExamQuestion[],
  rand: () => number,
  shuffleEnabled: boolean
): ExamQuestion[] {
  if (!shuffleEnabled || items.length <= 1) {
    return [...items];
  }

  const unlockedIndices: number[] = [];
  const unlockedItems: ExamQuestion[] = [];

  items.forEach((q, idx) => {
    if (!q.lockPosition) {
      unlockedIndices.push(idx);
      unlockedItems.push(q);
    }
  });

  if (unlockedItems.length <= 1) {
    return [...items];
  }

  const shuffledUnlocked = fisherYates(unlockedItems, rand);
  const result = [...items];
  unlockedIndices.forEach((targetIdx, i) => {
    result[targetIdx] = shuffledUnlocked[i];
  });

  return result;
}

function buildQuestionSequence(
  questions: ExamQuestion[],
  rand: () => number,
  config: ShuffleConfig
): ExamQuestion[] {
  if (!config.shuffleQuestions) {
    return [...questions];
  }

  if (!config.groupBySection) {
    return reorderWithLocks(questions, rand, true);
  }

  // Group consecutively by sectionTitle (or question type if sectionTitle is absent)
  const groups: { key: string; items: ExamQuestion[] }[] = [];
  const groupMap = new Map<string, ExamQuestion[]>();

  for (const q of questions) {
    const fallbackGroup = q.type === 'multiple_choice' ? 'Pilihan Ganda' : 'Uraian';
    const key = (q.sectionTitle?.trim() || fallbackGroup).toLowerCase();
    let list = groupMap.get(key);
    if (!list) {
      list = [];
      groupMap.set(key, list);
      groups.push({ key, items: list });
    }
    list.push(q);
  }

  const combined: ExamQuestion[] = [];
  for (const g of groups) {
    combined.push(...reorderWithLocks(g.items, rand, true));
  }
  return combined;
}

export function getVariantCode(index: number, config: ShuffleConfig): string {
  if (config.namingStyle === 'numeric') {
    return String(index + 1).padStart(2, '0');
  }
  // A, B, C, ... Z, AA, AB...
  let n = index;
  let code = '';
  while (n >= 0) {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
  }
  return code;
}

export function generateVariants(
  exam: ParsedExamData,
  config: ShuffleConfig,
  baseSeed: number
): ExamVariant[] {
  const variants: ExamVariant[] = [];
  const seenSignatures = new Set<string>();
  const count = Math.max(1, Math.min(10, config.variantCount));

  for (let v = 0; v < count; v++) {
    const code = getVariantCode(v, config);
    const prefix = config.variantPrefix.trim() || 'Paket';
    const label = `${prefix} ${code}`;

    let chosenQuestions: ExamQuestion[] = [];
    let attemptSeed = baseSeed + (v + 1) * 7919;

    // Try up to 12 seeds to avoid duplicate question order across variants
    for (let attempt = 0; attempt < 12; attempt++) {
      const rand = mulberry32(attemptSeed);
      const candidate = buildQuestionSequence(exam.questions, rand, config);
      const signature = candidate.map((q) => q.id).join('|');
      chosenQuestions = candidate;
      if (!seenSignatures.has(signature) || !config.shuffleQuestions) {
        seenSignatures.add(signature);
        break;
      }
      attemptSeed += 104729;
    }

    const optionRand = mulberry32(attemptSeed ^ 0x9e3779b9);
    const shuffledQuestions: ShuffledQuestion[] = chosenQuestions.map((q, idx) => {
      const { options, remappedCorrectAnswer, optionMapping } = shuffleQuestionOptions(
        q,
        optionRand,
        config
      );
      return {
        ...q,
        displayNumber: idx + 1,
        options,
        remappedCorrectAnswer,
        optionMapping,
      };
    });

    variants.push({
      id: `variant-${code}-${v}`,
      code,
      label,
      seed: attemptSeed,
      questions: shuffledQuestions,
    });
  }

  return variants;
}
