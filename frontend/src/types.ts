export interface User {
  id: string;
  name: string;
  email: string;
  role: 'TEACHER' | 'STUDENT';
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Subject {
  id: string;
  name: string;
  description?: string;
  chapter_count?: number;
  created_at?: string;
}

export interface Chapter {
  id: string;
  subject_id: string;
  name: string;
  description?: string;
  total_marks: number;
  time_minutes: number;
  order: number;
  question_count?: number;
  created_at?: string;
  subject?: Subject;
}

export interface Question {
  id: string;
  chapter_id: string;
  subject_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer?: string;
  marks?: number;
  created_at?: string;
}

export interface BulkUploadResult {
  inserted: number;
  failed: number;
  errors?: string[];
}
