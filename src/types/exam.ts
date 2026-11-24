export type QuestionType = 'multiple_choice' | 'essay';

export interface QuestionOption {
  label: string;
  text: string;
}

export interface ExamQuestion {
  id: string;
  originalNumber: number;
  type: QuestionType;
  sectionTitle?: string;
  passage?: string;
  stem: string;
  options: QuestionOption[];
  correctAnswer?: string;
  lockPosition?: boolean;
}

export interface ExamHeader {
  schoolName: string;
  examTitle: string;
  subject: string;
  gradeLevel: string;
  academicYear: string;
  duration: string;
  instructions: string;
}

export interface ParsedExamData {
  header: ExamHeader;
  questions: ExamQuestion[];
  sourceFileName?: string;
}

export interface ShuffleConfig {
  variantCount: number;
  variantPrefix: string;
  namingStyle: 'alphabet' | 'numeric';
  shuffleQuestions: boolean;
  groupBySection: boolean;
  shuffleOptions: boolean;
  pinSpecialLastOption: boolean;
  includeAnswerKeyPage: boolean;
  showStudentIdentityBox: boolean;
  columns: 1 | 2;
}

export interface OptionMappingItem {
  newLabel: string;
  originalLabel: string;
}

export interface ShuffledQuestion extends ExamQuestion {
  displayNumber: number;
  remappedCorrectAnswer?: string;
  optionMapping?: OptionMappingItem[];
}

export interface ExamVariant {
  id: string;
  code: string;
  label: string;
  seed: number;
  questions: ShuffledQuestion[];
}

export type UsageActionType =
  | 'visit'
  | 'parse_exam'
  | 'load_sample'
  | 'reshuffle'
  | 'export_pdf'
  | 'export_docx'
  | 'export_zip';

export interface IpUsageRecord {
  ip: string;
  totalUses: number;
  visits: number;
  parses: number;
  exports: number;
  lastAction: string;
  deviceSummary: string;
  firstSeen: string;
  lastSeen: string;
}

export interface UsageStatsResponse {
  currentIp: string;
  summary: {
    uniqueIps: number;
    totalUses: number;
    totalParses: number;
    totalExports: number;
  };
  users: IpUsageRecord[];
}

