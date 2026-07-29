import { useState, useEffect } from 'react'
import api from '../../api'
import type { ClassItem, SubjectItem, ChapterItem } from './types'

export interface SubSubjectItem { id: string; name: string; subjectId?: string }

export interface ReferenceData {
  classes: ClassItem[]
  subjectsByClass: Record<string, SubjectItem[]>
  chaptersBySubject: Record<string, ChapterItem[]>
  subSubjectsBySubject: Record<string, SubSubjectItem[]>
  loadingClasses: boolean
  loadClassSubjects: (classId: string) => Promise<void>
  loadSubjectChapters: (subjectId: string) => Promise<void>
  loadSubjectSubSubjects: (subjectId: string) => Promise<void>
}

export function useReferenceData(): ReferenceData {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, SubjectItem[]>>({})
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<string, ChapterItem[]>>({})
  const [subSubjectsBySubject, setSubSubjectsBySubject] = useState<Record<string, SubSubjectItem[]>>({})
  const [loadingClasses, setLoadingClasses] = useState(true)

  useEffect(() => {
    api.get('/classes').then((r) => {
      const list = r.data?.data?.classes ?? []
      setClasses(Array.isArray(list) ? list : [])
    }).catch(() => setClasses([])).finally(() => setLoadingClasses(false))
  }, [])

  const loadClassSubjects = async (classId: string) => {
    if (subjectsByClass[classId]) return
    try {
      const r = await api.get(`/subjects?class_id=${classId}`)
      const list = r.data?.data?.subjects ?? []
      setSubjectsByClass((prev) => ({ ...prev, [classId]: Array.isArray(list) ? list : [] }))
    } catch { /* ignore */ }
  }

  const loadSubjectChapters = async (subjectId: string) => {
    if (chaptersBySubject[subjectId]) return
    try {
      const r = await api.get(`/chapters?subject_id=${subjectId}`)
      const list: ChapterItem[] = r.data?.data?.chapters ?? []
      setChaptersBySubject((prev) => ({ ...prev, [subjectId]: Array.isArray(list) ? list : [] }))
    } catch { /* ignore */ }
  }

  const loadSubjectSubSubjects = async (subjectId: string) => {
    if (subSubjectsBySubject[subjectId]) return
    try {
      const r = await api.get(`/sub-subjects?subject_id=${subjectId}`)
      const list: SubSubjectItem[] = r.data?.data?.subSubjects ?? []
      setSubSubjectsBySubject((prev) => ({ ...prev, [subjectId]: Array.isArray(list) ? list : [] }))
    } catch { /* ignore */ }
  }

  return { classes, subjectsByClass, chaptersBySubject, subSubjectsBySubject, loadingClasses, loadClassSubjects, loadSubjectChapters, loadSubjectSubSubjects }
}

/**
 * Return the number of questions available in the chosen scope for the given
 * type + sub-type. Used by the wizard to show live "X available" counters
 * per section and go red when the ask exceeds availability.
 *
 * `subType` is ignored when type=MCQ. When type=SUBJECTIVE and subType is
 * given, returns the count restricted to that sub-type only.
 *
 * Supports all four scope shapes (class / subSubject / subject / chapter).
 * Priority mirrors the backend sampler: chapters > subSubject > subjects > class.
 */
export type ScopeSelector =
  | { mode: 'chapters'; ids: string[] }
  | { mode: 'subjects'; ids: string[] }
  | { mode: 'subSubject'; id: string }
  | { mode: 'class'; id: string };

export async function fetchScopeCount(
  scope: ScopeSelector,
  type: 'MCQ' | 'SUBJECTIVE',
  subType?: 'FILL_BLANK' | 'ONE_WORD' | 'SHORT_ANSWER' | 'LONG_ANSWER',
): Promise<number | undefined> {
  const params = new URLSearchParams()
  if (scope.mode === 'chapters') {
    if (scope.ids.length === 0) return undefined
    params.set('chapterIds', scope.ids.join(','))
  } else if (scope.mode === 'subjects') {
    if (scope.ids.length === 0) return undefined
    params.set('subjectIds', scope.ids.join(','))
  } else if (scope.mode === 'subSubject') {
    if (!scope.id) return undefined
    params.set('subSubjectId', scope.id)
  } else if (scope.mode === 'class') {
    if (!scope.id) return undefined
    params.set('classId', scope.id)
  }
  try {
    const r = await api.get(`/generate-paper/scope-stats?${params.toString()}`)
    const d = r.data?.data ?? {}
    if (type === 'MCQ') return d.mcq
    if (subType) return d[subType]     // FILL_BLANK / ONE_WORD / etc
    return d.subjective                 // any subjective
  } catch { return undefined }
}
