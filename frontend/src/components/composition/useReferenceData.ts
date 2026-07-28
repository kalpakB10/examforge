import { useState, useEffect } from 'react'
import api from '../../api'
import type { ClassItem, SubjectItem, ChapterItem } from './types'

export interface ReferenceData {
  classes: ClassItem[]
  subjectsByClass: Record<string, SubjectItem[]>
  chaptersBySubject: Record<string, ChapterItem[]>
  loadingClasses: boolean
  loadClassSubjects: (classId: string) => Promise<void>
  loadSubjectChapters: (subjectId: string) => Promise<void>
}

export function useReferenceData(): ReferenceData {
  const [classes, setClasses] = useState<ClassItem[]>([])
  const [subjectsByClass, setSubjectsByClass] = useState<Record<string, SubjectItem[]>>({})
  const [chaptersBySubject, setChaptersBySubject] = useState<Record<string, ChapterItem[]>>({})
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

  return { classes, subjectsByClass, chaptersBySubject, loadingClasses, loadClassSubjects, loadSubjectChapters }
}

export async function fetchScopeCount(
  scopeMode: 'chapters' | 'subjects',
  ids: string[],
  type: 'MCQ' | 'SUBJECTIVE'
): Promise<number | undefined> {
  if (ids.length === 0) return undefined
  const params = new URLSearchParams()
  if (scopeMode === 'chapters') params.set('chapterIds', ids.join(','))
  else params.set('subjectIds', ids.join(','))
  try {
    const r = await api.get(`/generate-paper/scope-stats?${params.toString()}`)
    return type === 'MCQ' ? r.data?.data?.mcq : r.data?.data?.subjective
  } catch { return undefined }
}
