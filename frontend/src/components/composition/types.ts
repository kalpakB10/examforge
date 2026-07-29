export interface ClassItem { id: string; name: string }
export interface SubjectItem { id: string; name: string }
export interface ChapterItem {
  id: string;
  name: string;
  subject?: { id: string; name: string };
  subSubject?: { id: string; name: string } | null;
}

// G.2: 4 scope shapes to match what real teachers ask for.
//   class      → all questions in the class (across every subject)
//   subSubject → all questions under one sub-subject (e.g. "SAT Math")
//   subjects   → one or more whole subjects
//   chapters   → one or more specific chapters (finest grain)
export type ScopeMode = 'class' | 'subSubject' | 'subjects' | 'chapters'
export type SectionType = 'MCQ' | 'SUBJECTIVE'
export type SubjectiveSubType = 'FILL_BLANK' | 'ONE_WORD' | 'SHORT_ANSWER' | 'LONG_ANSWER'

export interface DifficultyMix {
  easy: number   // 0..100, treated as weights (do not need to sum to 100)
  medium: number
  hard: number
}

export interface Section {
  id: string
  title: string
  type: SectionType
  subType?: SubjectiveSubType    // only meaningful when type=SUBJECTIVE
  attemptAny?: number             // "attempt any N of M"; undefined = all compulsory
  instructions?: string           // per-section header line
  marksPerQuestion: number
  numQuestions: number
  blankLines: number
  scopeMode: ScopeMode
  // Payload for each scope shape. Only the fields relevant to the active
  // scopeMode are consulted at send-time; the rest are ignored.
  classId?: string           // scopeMode='class'
  subSubjectId?: string      // scopeMode='subSubject'
  subjectIds: string[]       // scopeMode='subjects'
  chapterIds: string[]       // scopeMode='chapters'
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
