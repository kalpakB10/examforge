export interface ClassItem { id: string; name: string }
export interface SubjectItem { id: string; name: string }
export interface ChapterItem {
  id: string;
  name: string;
  subject?: { id: string; name: string };
  subSubject?: { id: string; name: string } | null;
}

export type ScopeMode = 'chapters' | 'subject' | 'subjects'
export type SectionType = 'MCQ' | 'SUBJECTIVE'

export interface DifficultyMix {
  easy: number   // 0..100, treated as weights (do not need to sum to 100)
  medium: number
  hard: number
}

export interface Section {
  id: string
  title: string
  type: SectionType
  marksPerQuestion: number
  numQuestions: number
  blankLines: number
  scopeMode: ScopeMode
  subjectIds: string[]
  chapterIds: string[]
  shuffle: boolean
  // Advanced sampling options
  distributeAcrossChapters: boolean
  useDifficultyMix: boolean
  difficultyMix: DifficultyMix
  availableCount?: number
  loadingCount?: boolean
}

let sectionCounter = 0
export function newSection(defaults: Partial<Section> = {}): Section {
  sectionCounter++
  return {
    id: `s${Date.now()}${sectionCounter}`,
    title: `Section ${String.fromCharCode(64 + sectionCounter)}`,
    type: 'MCQ',
    marksPerQuestion: 1,
    numQuestions: 10,
    blankLines: 4,
    scopeMode: 'chapters',
    subjectIds: [],
    chapterIds: [],
    shuffle: true,
    distributeAcrossChapters: false,
    useDifficultyMix: false,
    difficultyMix: { easy: 30, medium: 50, hard: 20 },
    ...defaults,
  }
}
