import { useState, useEffect } from 'react'
import type { Section, SectionType, ScopeMode, ClassItem, SubjectItem, ChapterItem, DifficultyMix } from './types'
import type { SubSubjectItem } from './useReferenceData'

interface Props {
  section: Section
  idx: number
  classes: ClassItem[]
  subjectsByClass: Record<string, SubjectItem[]>
  chaptersBySubject: Record<string, ChapterItem[]>
  subSubjectsBySubject: Record<string, SubSubjectItem[]>
  loadClassSubjects: (classId: string) => Promise<void>
  loadSubjectChapters: (subjectId: string) => Promise<void>
  loadSubjectSubSubjects: (subjectId: string) => Promise<void>
  onChange: (patch: Partial<Section>) => void
  onRemove: () => void
  onDuplicate: () => void
  defaultClassId?: string        // pre-selects the section's Class dropdown (usually from wizard's Step 1 class)
}

const SCOPE_LABELS: Record<ScopeMode, string> = {
  class: 'Whole Class',
  subSubject: 'Sub-Subject',
  subjects: 'Whole Subject(s)',
  chapters: 'Specific Chapters',
}
const SCOPE_HINTS: Record<ScopeMode, string> = {
  class: 'Pull from every subject in the class',
  subSubject: 'Pull from one sub-subject (e.g. SAT Math)',
  subjects: 'Pull from one or more full subjects',
  chapters: 'Pick individual chapters — finest control',
}

export default function SectionEditor({ section, idx, classes, subjectsByClass, chaptersBySubject, subSubjectsBySubject, loadClassSubjects, loadSubjectChapters, loadSubjectSubSubjects, onChange, onRemove, onDuplicate, defaultClassId }: Props) {
  const [selectedClass, setSelectedClass] = useState(defaultClassId ?? '')
  const [subSubjectSubjectId, setSubSubjectSubjectId] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // If defaultClassId changes after mount (e.g. user goes back to Step 1 and switches class), sync
  useEffect(() => {
    if (defaultClassId && !selectedClass) setSelectedClass(defaultClassId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultClassId])

  useEffect(() => {
    if (selectedClass) loadClassSubjects(selectedClass)
    // Keep section.classId in sync when scopeMode='class'
    if (section.scopeMode === 'class' && selectedClass && section.classId !== selectedClass) {
      onChange({ classId: selectedClass })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass, section.scopeMode])

  // Load sub-subjects for the subject picked in sub-subject mode
  useEffect(() => {
    if (section.scopeMode === 'subSubject' && subSubjectSubjectId) {
      loadSubjectSubSubjects(subSubjectSubjectId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.scopeMode, subSubjectSubjectId])

  const availableSubjects = selectedClass ? (subjectsByClass[selectedClass] ?? []) : []
  const scopeSubjects = section.scopeMode === 'chapters'
    ? availableSubjects.filter((s) => section.subjectIds.length === 0 || section.subjectIds.includes(s.id))
    : []
  const scopeChapters = scopeSubjects.flatMap((s) => chaptersBySubject[s.id] ?? [])

  useEffect(() => {
    if (section.scopeMode === 'chapters') {
      section.subjectIds.forEach((sid) => {
        if (!chaptersBySubject[sid]) loadSubjectChapters(sid)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.subjectIds, section.scopeMode])

  const sectionMarks = section.numQuestions * section.marksPerQuestion
  const enough = section.availableCount === undefined ? null : section.availableCount >= section.numQuestions

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
            {String.fromCharCode(65 + idx)}
          </div>
          <input type="text" value={section.title} onChange={(e) => onChange({ title: e.target.value })}
            className="flex-1 bg-transparent border-0 focus:outline-none text-sm font-semibold text-gray-800"
            placeholder="Section title" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${section.type === 'MCQ' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
            {section.type === 'MCQ' ? 'MCQ' : 'Subjective'}
          </span>
          <button onClick={onDuplicate} title="Duplicate section" className="text-xs text-gray-500 hover:text-indigo-600 px-2">Duplicate</button>
          <button onClick={onRemove} title="Remove section" className="text-xs text-gray-500 hover:text-red-600 px-2">Remove</button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Type</label>
            <select value={section.type} onChange={(e) => {
              const newType = e.target.value as SectionType;
              // When switching to SUBJECTIVE, materialize the subType shown in
              // the dropdown so the stored value matches what the teacher sees.
              // Previously, subType stayed undefined and the backend silently
              // fell back to SHORT_ANSWER, giving wrong answer-space layouts.
              onChange(newType === 'SUBJECTIVE' && !section.subType
                ? { type: newType, subType: 'SHORT_ANSWER' }
                : { type: newType });
            }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="MCQ">MCQ</option>
              <option value="SUBJECTIVE">Subjective</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Questions</label>
            <input type="number" min={1} value={section.numQuestions}
              onChange={(e) => onChange({ numQuestions: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Marks/Question</label>
            <input type="number" min={1} value={section.marksPerQuestion}
              onChange={(e) => onChange({ marksPerQuestion: Math.max(1, Number(e.target.value) || 1) })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Section Total</label>
            <div className="px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-50 text-gray-700 font-semibold">
              {sectionMarks} marks
            </div>
          </div>
        </div>

        {section.type === 'SUBJECTIVE' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Sub-type
                <span className="ml-1 text-gray-400 font-normal normal-case">— controls how much answer space is left</span>
              </label>
              <select
                value={section.subType ?? 'SHORT_ANSWER'}
                onChange={(e) => onChange({ subType: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="FILL_BLANK">Fill in the Blanks</option>
                <option value="ONE_WORD">One-Word Answer</option>
                <option value="SHORT_ANSWER">Short Answer (2–3 marks)</option>
                <option value="LONG_ANSWER">Long Answer / Essay (5+ marks)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5" title="Override default line count; leave 0 for auto based on sub-type">
                Blank Lines <span className="text-gray-400 font-normal normal-case">(0 = auto)</span>
              </label>
              <input type="number" min={0} max={30} value={section.blankLines}
                onChange={(e) => onChange({ blankLines: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5" title="Board-style: sample N questions but tell students to attempt only M">
                Attempt Any <span className="text-gray-400 font-normal normal-case">(blank = all)</span>
              </label>
              <input type="number" min={0} max={section.numQuestions} value={section.attemptAny ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  if (!v) return onChange({ attemptAny: undefined });
                  const n = Math.max(0, Math.min(section.numQuestions, Number(v) || 0));
                  onChange({ attemptAny: n > 0 && n < section.numQuestions ? n : undefined });
                }}
                placeholder="all"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
        )}

        {section.type === 'SUBJECTIVE' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Instructions <span className="text-gray-400 font-normal normal-case">(optional — shows above questions in this section)</span>
            </label>
            <input type="text"
              value={section.instructions ?? ''}
              onChange={(e) => onChange({ instructions: e.target.value })}
              placeholder="e.g. Write in your own words. Diagrams are welcome."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        )}

        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Scope — Pull questions from</label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {(['class', 'subSubject', 'subjects', 'chapters'] as ScopeMode[]).map((m) => {
              const active = section.scopeMode === m
              return (
                <button key={m} type="button" onClick={() => onChange({
                  scopeMode: m,
                  chapterIds: [],
                  subjectIds: [],
                  subSubjectId: undefined,
                  classId: m === 'class' ? (selectedClass || undefined) : undefined,
                })}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all text-left ${active ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                  <div>{SCOPE_LABELS[m]}</div>
                  <div className={`text-[10px] font-normal mt-0.5 ${active ? 'text-indigo-100' : 'text-gray-400'}`}>{SCOPE_HINTS[m]}</div>
                </button>
              )
            })}
          </div>

          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Class</label>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">— Select class —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {section.scopeMode === 'class' && selectedClass && (
            <div className="text-xs text-gray-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
              Questions will be sampled from <span className="font-semibold">every subject</span> in this class.
              {availableSubjects.length > 0 && <> Includes: {availableSubjects.map((s) => s.name).join(', ')}.</>}
            </div>
          )}

          {section.scopeMode === 'subSubject' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Subject</label>
                <select value={subSubjectSubjectId}
                  onChange={(e) => { setSubSubjectSubjectId(e.target.value); onChange({ subSubjectId: undefined }) }}
                  disabled={!selectedClass}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">{selectedClass ? '— Select subject —' : 'Select class first'}</option>
                  {availableSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sub-Subject</label>
                <select value={section.subSubjectId ?? ''}
                  onChange={(e) => onChange({ subSubjectId: e.target.value || undefined })}
                  disabled={!subSubjectSubjectId}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">
                    {!subSubjectSubjectId ? 'Select subject first'
                      : (subSubjectsBySubject[subSubjectSubjectId]?.length ?? 0) === 0 ? 'No sub-subjects available'
                      : '— Select sub-subject —'}
                  </option>
                  {(subSubjectsBySubject[subSubjectSubjectId] ?? []).map((ss) => (
                    <option key={ss.id} value={ss.id}>{ss.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {(section.scopeMode === 'subjects' || section.scopeMode === 'chapters') && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {section.scopeMode === 'subjects' ? 'Subject(s) — pick one or more' : 'Subject(s) to load chapters from'}
              </label>
              <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                {!selectedClass ? (
                  <p className="text-xs text-gray-400 py-2">Select a class first</p>
                ) : availableSubjects.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">No subjects in this class</p>
                ) : availableSubjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer hover:bg-gray-50 rounded px-1">
                    <input type="checkbox" checked={section.subjectIds.includes(s.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...section.subjectIds, s.id]
                          : section.subjectIds.filter((id) => id !== s.id)
                        onChange({ subjectIds: next })
                      }} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {section.scopeMode === 'chapters' && section.subjectIds.length > 0 && (
            <div className="mt-3">
              <label className="block text-xs text-gray-500 mb-1">Chapters — pick one or more</label>
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-white">
                {scopeChapters.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Loading chapters…</p>
                ) : scopeChapters.map((ch) => (
                  <label key={ch.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer hover:bg-gray-50 rounded px-1">
                    <input type="checkbox" checked={section.chapterIds.includes(ch.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...section.chapterIds, ch.id]
                          : section.chapterIds.filter((id) => id !== ch.id)
                        onChange({ chapterIds: next })
                      }} />
                    <span>
                      {ch.subject?.name && (
                        <span className="text-gray-400">
                          {ch.subject.name}
                          {ch.subSubject?.name && <> <span className="text-gray-300">›</span> {ch.subSubject.name}</>}
                          {' › '}
                        </span>
                      )}
                      {ch.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {section.availableCount !== undefined && (
            <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${enough ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {section.loadingCount ? 'Checking availability…' :
                enough ? `✓ ${section.availableCount} ${section.type} questions available in scope — enough for ${section.numQuestions} requested`
                       : `✗ Only ${section.availableCount} ${section.type} questions available, but you asked for ${section.numQuestions}. Reduce count or widen scope.`}
            </div>
          )}
        </div>

        {/* Advanced sampling options */}
        <div className="border-t border-gray-100 pt-3">
          <button type="button" onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between text-left hover:bg-slate-50 rounded-lg px-2 py-1.5 -mx-1 transition-colors">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <svg className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
              Advanced sampling
              <span className="text-[10px] text-gray-400 font-normal">— difficulty mix, fair chapter distribution, shuffle</span>
            </span>
            {(section.useDifficultyMix || section.distributeAcrossChapters || !section.shuffle) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">ON</span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-4 bg-slate-50 rounded-xl p-4">
              {/* Fair distribution across chapters */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={section.distributeAcrossChapters}
                  onChange={(e) => onChange({ distributeAcrossChapters: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Fair distribution across chapters</p>
                  <p className="text-xs text-gray-500">Balance picks evenly across chapters in the scope (instead of pure random which can bias to one chapter).</p>
                </div>
              </label>

              {/* Difficulty mix */}
              <div>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={section.useDifficultyMix}
                    onChange={(e) => onChange({ useDifficultyMix: e.target.checked })}
                    className="mt-0.5 w-4 h-4 accent-indigo-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Custom difficulty mix</p>
                    <p className="text-xs text-gray-500">Set % Easy / Medium / Hard. Weights don't need to sum to 100 — they're normalised.</p>
                  </div>
                </label>

                {section.useDifficultyMix && (
                  <div className="mt-3 grid grid-cols-3 gap-2 pl-6">
                    {(['easy', 'medium', 'hard'] as const).map((k) => (
                      <div key={k}>
                        <label className="block text-xs text-gray-500 mb-1 uppercase tracking-wide">{k}</label>
                        <input type="number" min={0} max={100} value={section.difficultyMix[k]}
                          onChange={(e) => onChange({
                            difficultyMix: { ...section.difficultyMix, [k]: Math.max(0, Number(e.target.value) || 0) } as DifficultyMix
                          })}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Explicit shuffle toggle (was implicit before) */}
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={section.shuffle}
                  onChange={(e) => onChange({ shuffle: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Shuffle question order</p>
                  <p className="text-xs text-gray-500">Turn off to keep questions in the order they were sampled.</p>
                </div>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
