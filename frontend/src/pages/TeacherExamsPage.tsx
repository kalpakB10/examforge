import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import TeacherShell from '../components/TeacherShell'
import Spinner from '../components/Spinner'
import api from '../api'
import SectionEditor from '../components/composition/SectionEditor'
import { useReferenceData, fetchScopeCount } from '../components/composition/useReferenceData'
import { newSection, type Section } from '../components/composition/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exam {
  id: string
  title: string
  examCode: string | null
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED'
  totalQuestions: number
  totalMarks: number
  durationMinutes: number
  timerMode: string
  negativeMarking: boolean
  createdAt: string
  expiresAt: string | null
  deliverInteractive: boolean
  deliverPdf: boolean
  pdfStatus: 'NOT_REQUESTED' | 'PENDING' | 'READY' | 'FAILED'
  subject: { id: string; name: string } | null
  _count?: { examSessions: number; results: number }
}

interface PaperTemplate {
  id: string
  name: string
  description: string | null
  isPreset: boolean
  layout: any
}

interface OrgSettings {
  orgName: string
  address: string
  logoText: string
  examTitle: string
}

const LS_ORG_KEY = 'examforge_org_settings'
const LS_ORG_LEGACY = 'nmms_org_settings'
function loadOrgSettings(): OrgSettings {
  const empty: OrgSettings = { orgName: '', address: '', logoText: '', examTitle: '' }
  try {
    const s = localStorage.getItem(LS_ORG_KEY) ?? localStorage.getItem(LS_ORG_LEGACY)
    return s ? JSON.parse(s) : empty
  } catch { return empty }
}
function saveOrgSettings(s: OrgSettings) {
  localStorage.setItem(LS_ORG_KEY, JSON.stringify(s))
  localStorage.removeItem(LS_ORG_LEGACY)
}

const LS_TEMPLATE_KEY = 'examforge_last_template_id'

// Format ISO for input type=datetime-local (yyyy-MM-ddTHH:mm)
function toLocalInput(iso: string | Date | null): string {
  if (!iso) return ''
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Default expiry: 24h from now
function defaultExpiry(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return toLocalInput(d)
}

const STATUS_STYLE = {
  DRAFT: 'bg-amber-50 text-amber-700 border border-amber-200',
  ACTIVE: 'bg-green-50 text-green-700 border border-green-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border border-slate-200',
}

type View = 'list' | 'create' | 'detail'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherExamsPage() {
  const [view, setView] = useState<View>('list')
  const [exams, setExams] = useState<Exam[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [detailExamId, setDetailExamId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const fetchExams = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const res = await api.get('/exams')
      const raw = res.data?.data ?? []
      setExams(Array.isArray(raw) ? raw : [])
    } catch (err: any) {
      // Distinguish "no exams" from "network is down" — showing an empty
      // state when the server is unreachable is a lie.
      setExams([])
      setListError(err?.response?.data?.error?.message ?? "Couldn't load exams. Check your connection and try again.")
    }
    finally { setListLoading(false) }
  }, [])

  useEffect(() => { fetchExams() }, [fetchExams])

  return (
    <TeacherShell
      title="Exams"
      subtitle="Create exams that are both auto-graded online AND printable as PDF papers"
      action={
        view === 'list' ? (
          <button onClick={() => setView('create')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 shadow-sm transition-all">
            + Create Exam
          </button>
        ) : (
          <button onClick={() => { setView('list'); setDetailExamId(null); fetchExams() }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
            ← Back
          </button>
        )
      }
    >
      {toast && <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium">{toast}</div>}

      {view === 'list' && (
        <ExamList
          exams={exams}
          loading={listLoading}
          error={listError}
          onRetry={fetchExams}
          onOpen={(id) => { setDetailExamId(id); setView('detail') }}
          onDeleted={fetchExams}
          showToast={showToast}
        />
      )}
      {view === 'create' && (
        <CreateExamWizard
          onCreated={(id) => { setDetailExamId(id); setView('detail'); fetchExams() }}
          onCancel={() => setView('list')}
          showToast={showToast}
        />
      )}
      {view === 'detail' && detailExamId && (
        <ExamDetail
          examId={detailExamId}
          onBack={() => { setView('list'); setDetailExamId(null); fetchExams() }}
          showToast={showToast}
        />
      )}
    </TeacherShell>
  )
}

// ─── Exam list ────────────────────────────────────────────────────────────────

function ExamList({ exams, loading, error, onRetry, onOpen, onDeleted, showToast }: {
  exams: Exam[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpen: (id: string) => void
  onDeleted: () => void
  showToast: (m: string) => void
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const isExpired = (e: Exam) => e.expiresAt && new Date(e.expiresAt).getTime() <= Date.now()

  async function del(id: string) {
    try { await api.delete(`/exams/${id}`); showToast('Exam moved to trash.'); onDeleted() }
    catch (err: any) { showToast(err?.response?.data?.error?.message ?? 'Delete failed.') }
    finally { setConfirmDeleteId(null) }
  }

  if (loading) return <Spinner label="Loading exams..." />
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex items-start gap-4">
        <div className="text-2xl">⚠️</div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-800">Couldn't load exams</p>
          <p className="text-sm text-red-700 mt-0.5">{error}</p>
        </div>
        <button onClick={onRetry}
          className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100">
          Retry
        </button>
      </div>
    )
  }
  if (exams.length === 0) {
    return (
      <div className="max-w-4xl bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
        <p className="text-gray-600 font-semibold mb-1">No exams yet</p>
        <p className="text-gray-400 text-sm mb-5">Create your first exam — you'll get both an online test code and downloadable PDF paper.</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-3">
      {exams.map((e) => {
        const expired = isExpired(e)
        return (
          <div key={e.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-all">
            {confirmDeleteId === e.id ? (
              <div>
                <p className="text-sm font-semibold text-red-800 mb-3">Move "{e.title}" to trash? Student sessions and results stay linked and you can restore for 30 days before it's permanently deleted.</p>
                <div className="flex gap-2">
                  <button onClick={() => del(e.id)} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Move to trash</button>
                  <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base font-bold text-gray-900 truncate">{e.title}</h3>
                    {/* If expired, hide the ACTIVE/COMPLETED status badge — EXPIRED is the effective state */}
                    {expired
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">EXPIRED</span>
                      : <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[e.status]}`}>{e.status}</span>
                    }
                    {e.deliverInteractive && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Online</span>}
                    {e.deliverPdf && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${e.pdfStatus === 'READY' ? 'bg-green-50 text-green-700 border-green-200' : e.pdfStatus === 'FAILED' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        PDF {e.pdfStatus === 'READY' ? '✓' : e.pdfStatus === 'PENDING' ? '⏳' : e.pdfStatus === 'FAILED' ? '✗' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {e.subject?.name} · {e.totalQuestions} Qs · {e.totalMarks} marks · {e.durationMinutes} min
                    {e.examCode && <> · <span className="font-mono font-semibold text-indigo-600">{e.examCode}</span></>}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {e.expiresAt ? <>Expires {new Date(e.expiresAt).toLocaleString()}</> : 'No expiry'}
                    {e._count && <> · {e._count.examSessions} attempts</>}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => onOpen(e.id)} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100">Open</button>
                  <button onClick={() => setConfirmDeleteId(e.id)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg font-medium">Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Create wizard ────────────────────────────────────────────────────────────

interface ExamClassSummary {
  id: string
  name: string
  defaultTemplateId?: string | null
  defaultOrgSnapshot?: {
    orgName?: string; address?: string; logoText?: string; examTitle?: string; footerText?: string;
  } | null
}

function CreateExamWizard({ onCreated, onCancel, showToast }: {
  onCreated: (id: string) => void
  onCancel: () => void
  showToast: (m: string) => void
}) {
  const refData = useReferenceData()
  const [step, setStep] = useState(1)

  // Templates + selection
  const [templates, setTemplates] = useState<PaperTemplate[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  // Class + auto-loaded defaults
  const [classId, setClassId] = useState('')
  const [loadedClass, setLoadedClass] = useState<ExamClassSummary | null>(null)
  const [loadingClassDefaults, setLoadingClassDefaults] = useState(false)

  // Basics
  const [title, setTitle] = useState('')
  const [examCode, setExamCode] = useState('')
  const [expiresAt, setExpiresAt] = useState(defaultExpiry())
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [negativeMarking, setNegativeMarking] = useState(false)
  const [negativeMarksValue, setNegativeMarksValue] = useState('0.5')

  // Org (auto-loaded from class default; falls back to browser-cached org)
  const [org, setOrg] = useState<OrgSettings>(loadOrgSettings)
  const [footerText, setFooterText] = useState('')
  const [showOrgOverride, setShowOrgOverride] = useState(false)

  // Composition
  const [sections, setSections] = useState<Section[]>([newSection()])

  // Delivery
  const [deliverInteractive, setDeliverInteractive] = useState(true)
  const [deliverPdf, setDeliverPdf] = useState(true)

  // Submit
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Load templates on mount
  useEffect(() => {
    api.get('/paper-templates').then((r) => {
      const list: PaperTemplate[] = r.data?.data?.templates ?? []
      setTemplates(Array.isArray(list) ? list : [])
    }).catch(() => setTemplates([]))
  }, [])

  // When user picks a class, fetch its defaults and auto-fill
  useEffect(() => {
    if (!classId) { setLoadedClass(null); return }
    setLoadingClassDefaults(true)
    api.get(`/classes/${classId}`).then((r) => {
      const cls = r.data?.data as ExamClassSummary
      setLoadedClass(cls)
      // Class default template ALWAYS wins over the fallback selection
      if (cls?.defaultTemplateId) setTemplateId(cls.defaultTemplateId)
      if (cls?.defaultOrgSnapshot) {
        const d = cls.defaultOrgSnapshot
        setOrg({
          orgName: d.orgName ?? '',
          address: d.address ?? '',
          logoText: d.logoText ?? '',
          examTitle: d.examTitle ?? '',
        })
        setFooterText(d.footerText ?? '')
      }
    }).catch(() => setLoadedClass(null))
      .finally(() => setLoadingClassDefaults(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  // Fallback template selection if no class default + none picked
  useEffect(() => {
    if (!templateId && templates.length > 0) {
      const preferred = templates.find((t) => t.name === 'Classic Indian School') || templates[0]
      setTemplateId(preferred.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates])

  // Refresh section availability whenever a section changes
  useEffect(() => {
    const stale = sections.filter((s) => s.availableCount === undefined
      && ((s.scopeMode === 'chapters' && s.chapterIds.length > 0)
       || (s.scopeMode === 'subjects' && s.subjectIds.length > 0)))
    stale.forEach(async (sec) => {
      setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, loadingCount: true } : s))
      const ids = sec.scopeMode === 'chapters' ? sec.chapterIds : sec.subjectIds
      const count = await fetchScopeCount(sec.scopeMode === 'chapters' ? 'chapters' : 'subjects', ids, sec.type)
      setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, availableCount: count ?? 0, loadingCount: false } : s))
    })
  }, [sections])

  const totalQuestions = sections.reduce((a, s) => a + s.numQuestions, 0)
  const totalMarks = sections.reduce((a, s) => a + s.numQuestions * s.marksPerQuestion, 0)
  const hasAnyMcq = sections.some((s) => s.type === 'MCQ')
  const allSectionsValid = sections.length > 0 && sections.every((s) =>
    ((s.scopeMode === 'chapters' && s.chapterIds.length > 0) || (s.scopeMode === 'subjects' && s.subjectIds.length > 0))
    && (s.availableCount === undefined || s.availableCount >= s.numQuestions)
  )

  useEffect(() => {
    if (!hasAnyMcq && deliverInteractive) setDeliverInteractive(false)
  }, [hasAnyMcq, deliverInteractive])

  const stepBasicsDone = !!title.trim() && !!classId && !!org.orgName.trim() && !!templateId
  const stepSectionsDone = allSectionsValid
  const stepReviewValid = stepBasicsDone && stepSectionsDone && (deliverInteractive || deliverPdf)

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white'
  const selectedTemplate = templates.find((t) => t.id === templateId)

  function updateSection(id: string, patch: Partial<Section>) {
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, ...patch, availableCount: undefined } : s))
  }
  function removeSection(id: string) { setSections((prev) => prev.filter((s) => s.id !== id)) }
  function duplicateSection(id: string) {
    const src = sections.find((s) => s.id === id); if (!src) return
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      const copy = newSection({ ...src, title: `${src.title} (copy)` })
      const next = [...prev]; next.splice(idx + 1, 0, copy); return next
    })
  }
  function addSection() { setSections((prev) => [...prev, newSection()]) }

  async function saveAsClassDefault() {
    if (!classId) return
    try {
      await api.patch(`/classes/${classId}/defaults`, {
        defaultTemplateId: templateId,
        defaultOrgSnapshot: { ...org, footerText },
      })
      showToast('Saved as default for this class.')
    } catch { showToast('Could not save class default.') }
  }

  async function handleCreate() {
    setCreateError(''); setCreating(true)
    saveOrgSettings(org)
    try {
      const payload = {
        title: title.trim(),
        examCode: examCode.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        durationMinutes: Number(durationMinutes) || 60,
        negativeMarking, negativeMarksValue: negativeMarking ? Number(negativeMarksValue) : 0,
        composition: sections.map((s) => ({
          title: s.title, type: s.type,
          marksPerQuestion: s.marksPerQuestion, numQuestions: s.numQuestions,
          blankLines: s.type === 'SUBJECTIVE' ? s.blankLines : undefined,
          scope: s.scopeMode === 'chapters' ? { chapterIds: s.chapterIds } : { subjectIds: s.subjectIds },
          shuffle: s.shuffle,
          distributeAcrossChapters: s.distributeAcrossChapters,
          difficulty: s.useDifficultyMix ? s.difficultyMix : undefined,
        })),
        templateId,
        paperTitle: title.trim(),
        org,
        footerText: footerText.trim() || undefined,
        deliverInteractive, deliverPdf,
      }
      const res = await api.post('/exams', payload)
      showToast('Exam created!')
      onCreated(res.data?.data?.exam?.id)
    } catch (err: any) {
      setCreateError(err?.response?.data?.error?.message ?? 'Failed to create exam.')
    } finally { setCreating(false) }
  }

  const hasClassDefaults = !!loadedClass?.defaultTemplateId && !!loadedClass?.defaultOrgSnapshot?.orgName

  return (
    <div className="max-w-4xl">
      {/* Compact stepper — 3 steps only */}
      <div className="flex items-center gap-1 py-2">
        {[
          { n: 1, done: stepBasicsDone, label: 'Basics' },
          { n: 2, done: stepSectionsDone, label: 'Sections' },
          { n: 3, done: false, label: 'Review' },
        ].map((s, i, arr) => (
          <div key={s.n} className="flex items-center flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${s.done ? 'bg-green-600 text-white' : step === s.n ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {s.done ? '✓' : s.n}
            </div>
            {i < arr.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${s.done ? 'bg-green-600' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs text-center -mt-4 mb-5 text-gray-500">
        <div>Basics</div><div>Sections</div><div>Review & Create</div>
      </div>

      {/* ───────────────────────── Step 1: Basics ───────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Exam Basics</h2>
            <p className="text-xs text-gray-400 mb-5">Just the fields that change every time. Template + org auto-load from the class.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Class <span className="text-red-500">*</span></label>
                <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}>
                  <option value="">— Select class —</option>
                  {refData.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {refData.classes.length === 0 && !refData.loadingClasses && (
                  <p className="text-xs text-amber-600 mt-1">No classes yet. <Link to="/teacher/classes" className="underline">Create one</Link> first.</p>
                )}
                {classId && loadingClassDefaults && <p className="text-xs text-gray-400 mt-1">Loading class defaults…</p>}
                {classId && !loadingClassDefaults && hasClassDefaults && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 mt-2">
                    ✓ Template + org auto-loaded from class defaults
                  </p>
                )}
                {classId && !loadingClassDefaults && !hasClassDefaults && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 mt-2">
                    ⚠ This class has no defaults set. Fill in below — you can save them as class defaults on the Review step.
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Exam Title <span className="text-red-500">*</span></label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Physics Unit Test — Chapter 3" className={inputCls} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Custom Code <span className="text-gray-400 font-normal text-xs">(auto if blank)</span></label>
                <input type="text" value={examCode} onChange={(e) => setExamCode(e.target.value.toUpperCase())} placeholder="e.g. PHY10A" maxLength={20} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Expires At <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Duration (minutes)</label>
                <input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mt-6">
                  <input type="checkbox" checked={negativeMarking} onChange={(e) => setNegativeMarking(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                  Negative marking
                </label>
                {negativeMarking && (
                  <input type="number" step="0.25" value={negativeMarksValue} onChange={(e) => setNegativeMarksValue(e.target.value)} className={`${inputCls} mt-2`} placeholder="Marks deducted per wrong answer" />
                )}
              </div>
            </div>
          </div>

          {/* Advanced: Template + Org override (collapsed by default) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">Template & Header/Footer</p>
                <p className="text-xs text-gray-500 truncate">
                  Using <strong>{selectedTemplate?.name ?? '—'}</strong>
                  {org.orgName && <> with <strong>{org.orgName}</strong> header</>}
                  {footerText && <> · footer "<em>{footerText}</em>"</>}
                </p>
              </div>
              <button type="button" onClick={() => { setShowTemplatePicker((v) => !v); setShowOrgOverride(true) }}
                className="text-xs text-indigo-600 hover:underline font-semibold shrink-0">
                {showTemplatePicker || showOrgOverride ? 'Hide' : 'Override for this exam'}
              </button>
            </div>

            {(showTemplatePicker || showOrgOverride) && (
              <div className="p-6 space-y-6">
                {/* Template grid */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Layout Template</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {templates.map((t) => {
                      const selected = t.id === templateId
                      const accent = t.layout?.accentColor || '#4b5563'
                      return (
                        <button key={t.id} type="button" onClick={() => setTemplateId(t.id)}
                          className={`text-left border-2 rounded-xl p-2 transition-all ${selected ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                          <div className="rounded border border-gray-100 bg-white p-1 h-7 flex items-center justify-center text-[8px] font-bold" style={{ color: accent, borderColor: accent }}>
                            {t.name.toUpperCase()}
                          </div>
                          <p className="text-xs font-semibold text-gray-800 truncate mt-1">{t.name}</p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Org override fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">School / Organisation Name <span className="text-red-500">*</span></label>
                    <input type="text" value={org.orgName} onChange={(e) => setOrg({ ...org, orgName: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logo Text</label>
                    <input type="text" value={org.logoText} onChange={(e) => setOrg({ ...org, logoText: e.target.value })} maxLength={5} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Exam Sub-heading</label>
                    <input type="text" value={org.examTitle} onChange={(e) => setOrg({ ...org, examTitle: e.target.value })} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Address</label>
                    <textarea value={org.address} onChange={(e) => setOrg({ ...org, address: e.target.value })} rows={2} className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Footer Text <span className="text-gray-400 font-normal normal-case">(optional — shown at bottom of every page)</span>
                    </label>
                    <input type="text" value={footerText} onChange={(e) => setFooterText(e.target.value)}
                      placeholder="e.g. Best of Luck!" className={inputCls} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-2">
            <button onClick={onCancel} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">Cancel</button>
            <button onClick={() => setStep(2)} disabled={!stepBasicsDone}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
              Next: Compose Sections →
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────── Step 2: Sections ───────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-900">Compose Sections</h2>
              <p className="text-xs text-gray-400 mt-0.5">Add MCQ or subjective sections. Interactive delivery uses only MCQ.</p>
            </div>
            <div className="text-xs text-gray-600 flex gap-4">
              <span><strong>{totalQuestions}</strong> Qs</span>
              <span><strong>{totalMarks}</strong> marks</span>
            </div>
          </div>

          {refData.loadingClasses ? <Spinner size="sm" /> : refData.classes.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
              No classes yet. <Link to="/teacher/classes" className="underline">Create one</Link> and upload questions first.
            </div>
          ) : (
            <>
              {sections.map((s, idx) => (
                <SectionEditor key={s.id} section={s} idx={idx}
                  classes={refData.classes} subjectsByClass={refData.subjectsByClass} chaptersBySubject={refData.chaptersBySubject}
                  loadClassSubjects={refData.loadClassSubjects} loadSubjectChapters={refData.loadSubjectChapters}
                  onChange={(patch) => updateSection(s.id, patch)}
                  onRemove={() => removeSection(s.id)}
                  onDuplicate={() => duplicateSection(s.id)}
                  defaultClassId={classId} />
              ))}
              <button onClick={addSection}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-2xl text-sm text-gray-500 font-medium hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                + Add another section
              </button>
            </>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">← Back</button>
            <button onClick={() => setStep(3)} disabled={!stepSectionsDone}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40">
              Next: Review →
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────── Step 3: Review + Delivery + Create ─────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Delivery */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Delivery</h2>
            <p className="text-xs text-gray-400 mb-4">One exam, one or both delivery modes.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={`block border-2 rounded-xl p-3 cursor-pointer transition-all ${deliverInteractive ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'} ${!hasAnyMcq ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={deliverInteractive} disabled={!hasAnyMcq}
                    onChange={(e) => setDeliverInteractive(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">Online Interactive</p>
                    <p className="text-xs text-gray-500">Shareable code · auto-graded MCQ · live results</p>
                    {!hasAnyMcq && <p className="text-xs text-red-600 mt-1">Needs at least one MCQ section.</p>}
                  </div>
                </div>
              </label>
              <label className={`block border-2 rounded-xl p-3 cursor-pointer transition-all ${deliverPdf ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={deliverPdf} onChange={(e) => setDeliverPdf(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">Printable PDFs</p>
                    <p className="text-xs text-gray-500">Question paper + answer key · rendered in background</p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-1">Review & Create</h2>
            <p className="text-xs text-gray-400 mb-4">Everything looks right?</p>
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
              <Row label="Title" value={title} />
              <Row label="Class" value={loadedClass?.name ?? '—'} />
              <Row label="Template" value={selectedTemplate?.name ?? '—'} />
              <Row label="Sections" value={`${sections.length} (${totalQuestions} Qs · ${totalMarks} marks)`} />
              <Row label="Duration" value={`${durationMinutes} min`} />
              <Row label="Expires" value={expiresAt ? new Date(expiresAt).toLocaleString() : '—'} />
              <Row label="Delivery" value={[deliverInteractive && 'Online', deliverPdf && 'PDF'].filter(Boolean).join(' + ') || 'None'} />
              {footerText && <Row label="Footer" value={footerText} />}
            </div>

            {/* Offer to save these values as this class's defaults */}
            {!hasClassDefaults && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-blue-900">Save as default for {loadedClass?.name ?? 'this class'}?</p>
                  <p className="text-xs text-blue-700">Next time you create an exam under this class, we'll auto-load these values.</p>
                </div>
                <button onClick={saveAsClassDefault} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shrink-0">
                  Save default
                </button>
              </div>
            )}

            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mt-4 text-sm">{createError}</div>
            )}

            <div className="mt-5 flex justify-between">
              <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">← Back</button>
              <button onClick={handleCreate} disabled={creating || !stepReviewValid}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 shadow-sm">
                {creating ? 'Creating…' : 'Create Exam'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-gray-500">{label}</span><span className="font-semibold">{value}</span></div>
}

// ─── Exam detail with PDF polling ─────────────────────────────────────────────

interface ExamDetailData extends Exam {
  paperUrl?: string | null
  answerKeyUrl?: string | null
}

interface PdfStatus {
  status: 'NOT_REQUESTED' | 'PENDING' | 'READY' | 'FAILED'
  error?: string | null
  paperReady: boolean
  answerKeyReady: boolean
  paperUrl?: string | null
  answerKeyUrl?: string | null
}

function ExamDetail({ examId, onBack, showToast }: { examId: string; onBack: () => void; showToast: (m: string) => void }) {
  const [exam, setExam] = useState<ExamDetailData | null>(null)
  const [pdfStatus, setPdfStatus] = useState<PdfStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    try {
      const [er, sr] = await Promise.all([
        api.get(`/exams/${examId}?role=TEACHER`),
        api.get(`/exams/${examId}/pdf-status`).catch(() => null),
      ])
      setExam(er.data?.data ?? null)
      if (sr) setPdfStatus(sr.data?.data ?? null)
    } catch { showToast('Could not load exam.') }
    finally { setLoading(false) }
  }, [examId, showToast])

  useEffect(() => { load() }, [load])

  // Poll pdf-status every 3s while PENDING
  useEffect(() => {
    if (!exam?.deliverPdf) return
    if (pdfStatus?.status !== 'PENDING') return
    const t = setInterval(async () => {
      try {
        const sr = await api.get(`/exams/${examId}/pdf-status`)
        setPdfStatus(sr.data?.data ?? null)
      } catch { /* ignore */ }
    }, 3000)
    return () => clearInterval(t)
  }, [exam?.deliverPdf, pdfStatus?.status, examId])

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/exam/${code}`
    navigator.clipboard.writeText(url)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  async function downloadPdf(url: string, filename: string) {
    try {
      const resp = await api.get(url, { responseType: 'blob' })
      const blobUrl = URL.createObjectURL(resp.data)
      const a = document.createElement('a'); a.href = blobUrl; a.download = filename; a.click()
      URL.revokeObjectURL(blobUrl)
    } catch { showToast('Download failed.') }
  }

  async function regenerate() {
    try {
      await api.post(`/exams/${examId}/regenerate-pdf`)
      setPdfStatus((prev) => prev ? { ...prev, status: 'PENDING', paperReady: false, answerKeyReady: false } : prev)
      showToast('Regeneration started.')
    } catch (err: any) { showToast(err?.response?.data?.error?.message ?? 'Regenerate failed.') }
  }

  if (loading) return <Spinner label="Loading exam..." />
  if (!exam) return <p className="text-sm text-gray-500">Not found.</p>

  const isExpired = exam.expiresAt && new Date(exam.expiresAt).getTime() <= Date.now()

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h2 className="text-xl font-bold text-gray-900">{exam.title}</h2>
              {isExpired
                ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">EXPIRED</span>
                : <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[exam.status]}`}>{exam.status}</span>
              }
            </div>
            <p className="text-sm text-gray-500">
              {exam.subject?.name} · {exam.totalQuestions} Qs · {exam.totalMarks} marks · {exam.durationMinutes} min
            </p>
            {exam.expiresAt && (
              <p className="text-xs text-gray-400 mt-1">Expires {new Date(exam.expiresAt).toLocaleString()}</p>
            )}
          </div>
          <button onClick={onBack} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">← All exams</button>
        </div>
      </div>

      {/* Interactive delivery panel */}
      {exam.deliverInteractive && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <h3 className="text-sm font-bold text-gray-900">Online Interactive Exam</h3>
          </div>
          {exam.examCode ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">Share this code with students:</p>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-2xl font-black font-mono text-blue-700 tracking-widest">{exam.examCode}</p>
                <button onClick={() => copyLink(exam.examCode!)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <Link to={`/exam/${exam.examCode}`} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-50">
                  Preview →
                </Link>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                {exam._count?.examSessions ?? 0} attempts so far
                <Link to={`/teacher/exams/${exam.id}/results`} className="ml-2 text-blue-600 hover:underline">View results →</Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No code — exam is not active.</p>
          )}
        </div>
      )}

      {/* PDF delivery panel */}
      {exam.deliverPdf && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <h3 className="text-sm font-bold text-gray-900">Printable PDF Paper</h3>
            </div>
            <button onClick={regenerate} className="text-xs text-gray-500 hover:text-indigo-600 font-medium">Regenerate</button>
          </div>

          {!pdfStatus || pdfStatus.status === 'PENDING' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-800">Rendering paper…</p>
                <p className="text-xs text-amber-600 mt-0.5">This usually takes 5–15 seconds. The page auto-refreshes.</p>
              </div>
            </div>
          ) : pdfStatus.status === 'FAILED' ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-800 mb-1">Render failed</p>
              <p className="text-xs text-red-600 mb-3">{pdfStatus.error ?? 'Unknown error'}</p>
              <button onClick={regenerate} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Try again</button>
            </div>
          ) : pdfStatus.status === 'READY' ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-wrap gap-3">
              {pdfStatus.paperUrl && (
                <button onClick={() => downloadPdf(pdfStatus.paperUrl!, `${exam.title.replace(/\s+/g, '_')}.pdf`)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Download Question Paper
                </button>
              )}
              {pdfStatus.answerKeyUrl && (
                <button onClick={() => downloadPdf(pdfStatus.answerKeyUrl!, `${exam.title.replace(/\s+/g, '_')}_AnswerKey.pdf`)}
                  className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-50 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  Download Answer Key
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">PDF not requested for this exam.</p>
          )}
        </div>
      )}
    </div>
  )
}
