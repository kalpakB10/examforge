import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import TeacherShell from '../components/TeacherShell'
import Spinner from '../components/Spinner'
import api from '../api'
import NewExamWizard from '../components/composition/NewExamWizard'

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
        <NewExamWizard
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
                  </p>
                  {/* Inline stats bar — quick glance without a click-through */}
                  {e._count && (
                    <div className="flex flex-wrap items-center gap-3 mt-2.5">
                      <span className="inline-flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg font-semibold">
                        <span className="text-indigo-500">👥</span>
                        {e._count.examSessions} attempt{e._count.examSessions !== 1 ? 's' : ''}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-100 px-2.5 py-1 rounded-lg font-semibold">
                        <span className="text-green-500">✓</span>
                        {e._count.results} submitted
                      </span>
                      {e._count.examSessions > e._count.results && (
                        <span className="inline-flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-lg font-semibold">
                          <span className="text-amber-500">⏳</span>
                          {e._count.examSessions - e._count.results} in progress
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {/* Results button lives here for zero-click discovery — was previously
                      buried inside the detail view. Hidden for drafts (no data yet). */}
                  {e.status !== 'DRAFT' && (
                    <Link to={`/teacher/exams/${e.id}/results`}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 inline-flex items-center gap-1">
                      📊 Results
                    </Link>
                  )}
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
