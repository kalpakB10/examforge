// Enums
export enum CorrectOption {
  A = "A",
  B = "B",
  C = "C",
  D = "D",
}

export enum Difficulty {
  EASY = "EASY",
  MEDIUM = "MEDIUM",
  HARD = "HARD",
}

export enum TimerMode {
  FIXED_DURATION = "FIXED_DURATION",
  PER_QUESTION = "PER_QUESTION",
}

export enum ExamStatus {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
}

export enum SessionStatus {
  IN_PROGRESS = "IN_PROGRESS",
  SUBMITTED = "SUBMITTED",
  EXPIRED = "EXPIRED",
}

export enum DisputeStatus {
  OPEN = "OPEN",
  UNDER_REVIEW = "UNDER_REVIEW",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
}

export enum UserRole {
  TEACHER = "TEACHER",
  STUDENT = "STUDENT",
}

// Interfaces
export interface Subject {
  id: string;
  name: string;
  description?: string | null;
  createdAt: Date;
}

export interface Question {
  id: string;
  subjectId: string;
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: CorrectOption;
  difficulty: Difficulty;
  tags: string[];
  marksWeight: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionPublic extends Omit<Question, "correctOption"> {
  correctOption?: never;
}

export interface Exam {
  id: string;
  subjectId: string;
  cohortId: string;
  title: string;
  marksPerQuestion: number;
  totalMarks: number;
  totalQuestions: number;
  timerMode: TimerMode;
  durationMinutes: number;
  negativeMarking: boolean;
  negativeMarksValue: number;
  status: ExamStatus;
  createdBy: string;
  scheduledAt?: Date | null;
  createdAt: Date;
}

export interface ExamQuestion {
  id: string;
  examId: string;
  questionId: string;
  questionOrder: number;
}

export interface ExamHistory {
  id: string;
  subjectId: string;
  cohortId: string;
  questionId: string;
  usedInExamId: string;
  usedAt: Date;
}

export interface ExamSession {
  id: string;
  examId: string;
  studentId: string;
  startedAt: Date;
  submittedAt?: Date | null;
  isAutoSubmitted: boolean;
  answers: Record<string, string>;
  status: SessionStatus;
}

export interface Result {
  id: string;
  examSessionId: string;
  studentId: string;
  examId: string;
  totalAttempted: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  rawScore: number;
  negativeDeduction: number;
  finalScore: number;
  percentage: number;
  rank?: number | null;
  answerKeyUrl?: string | null;
  calculatedAt: Date;
}

export interface Dispute {
  id: string;
  examSessionId: string;
  studentId: string;
  examId: string;
  questionId: string;
  studentReason: string;
  status: DisputeStatus;
  teacherNote?: string | null;
  resolvedBy?: string | null;
  raisedAt: Date;
  resolvedAt?: Date | null;
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  role: UserRole;
  cohortId?: string | null;
  createdAt: Date;
}

// API Response types
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  cohortId?: string | null;
}

// BullMQ Job types
export interface ResultCalculationJob {
  sessionId: string;
  examId: string;
  studentId: string;
}

export interface RecalculationJob {
  examId: string;
}
