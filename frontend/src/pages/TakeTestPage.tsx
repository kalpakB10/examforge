import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string
  text: string
  optionA: string | null
  optionB: string | null
  optionC: string | null
  optionD: string | null
  questionImageUrl: string | null
  marksWeight: number
  yearTag: string | null
}

interface TestMeta {
  testId: string
  code: string
  title: string
  timeMinutes: number
  totalMarks: number
  totalQuestions: number
  questions: Question[]
}

interface ResultData {
  attempt: {
    studentName: string
    score: number
    totalQ: number
    correct: number
    wrong: number
    skipped: number
    timeTaken: number | null
  }
  test: { title: string; totalMarks: number }
  review: Array<{
    id: string
    text: string
    optionA: string | null
    optionB: string | null
    optionC: string | null
    optionD: string | null
    correctOption: string
    givenAnswer: string | null
    isCorrect: boolean
  }>
  percentage: number
}

const OPT_LABELS = ['A', 'B', 'C', 'D'] as const
const OPT_SYMS: Record<string, string> = { A: '①', B: '②', C: '③', D: '④' }

// ─── Phase: Enter Code ────────────────────────────────────────────────────────

function EnterCodePhase({ onCode }: { onCode: (code: string) => void }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length < 4) { setErr('Enter the test code given by your teacher'); return }
    onCode(c)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">📚</div>
          <h1 className="text-3xl font-black text-white">Quick Test</h1>
          <p className="text-indigo-200 mt-1">Enter the code from your teacher</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-2xl p-7">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Test Code</label>
          <input
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setErr('') }}
            placeholder="e.g.  A B C D 1 2"
            maxLength={8}
            autoFocus
            className="w-full text-center text-3xl font-black tracking-widest px-4 py-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500 uppercase"
          />
          {err && <p className="text-red-600 text-sm mt-2 text-center">{err}</p>}
          <button
            type="submit"
            className="mt-5 w-full bg-indigo-600 text-white font-bold py-3.5 rounded-xl text-lg hover:bg-indigo-700 transition-colors"
          >
            Find My Test →
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Phase: Enter Name ────────────────────────────────────────────────────────

function EnterNamePhase({ test, onStart }: { test: TestMeta; onStart: (name: string) => void }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) { setErr('Please enter your full name'); return }
    setStarting(true)
    onStart(name.trim())
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Test preview card */}
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">📝</div>
            <h2 className="text-xl font-black text-gray-900">{test.title}</h2>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { icon: '❓', val: test.totalQuestions, lbl: 'Questions' },
              { icon: '🎯', val: test.totalMarks, lbl: 'Marks' },
              { icon: '⏱️', val: `${test.timeMinutes} min`, lbl: 'Time' },
            ].map(s => (
              <div key={s.lbl} className="bg-indigo-50 rounded-xl p-3 text-center">
                <div className="text-xl">{s.icon}</div>
                <div className="font-black text-lg text-indigo-800">{s.val}</div>
                <div className="text-xs text-gray-500">{s.lbl}</div>
              </div>
            ))}
          </div>

          <form onSubmit={handleStart}>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your Full Name</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErr('') }}
              placeholder="Type your name here..."
              autoFocus
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-indigo-500 text-base"
            />
            {err && <p className="text-red-600 text-sm mt-1.5">{err}</p>}

            <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5 text-xs text-yellow-800">
              ⚠️ Once you start, the timer begins. Make sure you have <strong>{test.timeMinutes} minutes</strong> available.
            </div>

            <button
              type="submit"
              disabled={starting}
              className="mt-4 w-full bg-green-600 text-white font-black py-4 rounded-xl text-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {starting ? 'Starting...' : '🚀 Start Test'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Phase: Take Test ─────────────────────────────────────────────────────────

function TakeTestPhase({
  test, attemptId, onSubmit
}: {
  test: TestMeta
  attemptId: string
  onSubmit: (answers: Record<string, string>, timeTaken: number) => void
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState(0)
  const [timeLeft, setTimeLeft] = useState(test.timeMinutes * 60)
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const startTime = useRef(Date.now())

  const totalQ = test.questions.length
  const answered = Object.keys(answers).length
  const q = test.questions[current]

  // ── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(t)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const timerColor = timeLeft < 60 ? 'text-red-600' : timeLeft < 300 ? 'text-yellow-600' : 'text-green-700'

  // ── Auto-save answer ──────────────────────────────────────────────────────
  const saveAnswer = useCallback(async (questionId: string, answer: string) => {
    try {
      await api.put(`/quick-tests/attempts/${attemptId}/answer`, { questionId, answer })
    } catch { /* ignore — final submit sends all answers */ }
  }, [attemptId])

  const selectAnswer = (opt: string) => {
    const newAnswers = { ...answers, [q.id]: opt }
    setAnswers(newAnswers)
    saveAnswer(q.id, opt)
    // Auto-advance after 400ms
    if (current < totalQ - 1) {
      setTimeout(() => setCurrent(c => c + 1), 400)
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (auto = false) => {
    if (submitting) return
    setSubmitting(true)
    const timeTaken = Math.round((Date.now() - startTime.current) / 1000)
    setAnswers(prev => {
      onSubmit(prev, timeTaken)
      return prev
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
        <div>
          <div className="text-xs text-gray-500 font-medium">{test.title}</div>
          <div className="text-sm font-bold text-gray-800">Q {current + 1} of {totalQ}</div>
        </div>
        <div className={`text-2xl font-black tabular-nums ${timerColor}`}>{fmt(timeLeft)}</div>
        <button
          onClick={() => setShowConfirm(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700"
        >
          Submit
        </button>
      </div>

      {/* Question navigator strip */}
      <div className="bg-white border-b border-gray-100 px-3 py-2 overflow-x-auto">
        <div className="flex gap-1.5 min-w-max">
          {test.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrent(i)}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors flex-shrink-0
                ${i === current ? 'bg-indigo-600 text-white' : answers[q.id] ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-5">
          <div className="flex items-start gap-3">
            <span className="bg-indigo-600 text-white rounded-lg px-2.5 py-1 text-sm font-black flex-shrink-0">{current + 1}</span>
            <div>
              <p className="text-base font-medium text-gray-900 leading-relaxed">{q.text}</p>
              {q.yearTag && <span className="text-xs text-gray-400 italic mt-1 inline-block">[{q.yearTag}]</span>}
            </div>
          </div>
          {q.questionImageUrl && (
            <img src={q.questionImageUrl} alt="question" className="mt-3 rounded-lg max-h-48 object-contain" />
          )}
        </div>

        <div className="space-y-3">
          {OPT_LABELS.map(opt => {
            const text = (q as any)[`option${opt}`] as string | null
            if (!text) return null
            const selected = answers[q.id] === opt
            return (
              <button
                key={opt}
                onClick={() => selectAnswer(opt)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all
                  ${selected
                    ? 'border-indigo-600 bg-indigo-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
                  }`}
              >
                <span className={`text-xl flex-shrink-0 ${selected ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {OPT_SYMS[opt]}
                </span>
                <span className={`font-medium ${selected ? 'text-indigo-800' : 'text-gray-700'}`}>{text}</span>
                {selected && <span className="ml-auto text-green-600 text-lg">✓</span>}
              </button>
            )
          })}
        </div>

        {/* Prev / Next */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setCurrent(c => Math.max(0, c - 1))}
            disabled={current === 0}
            className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30"
          >
            ← Previous
          </button>
          <div className="text-sm text-gray-400 self-center">{answered}/{totalQ} answered</div>
          {current < totalQ - 1 ? (
            <button
              onClick={() => setCurrent(c => c + 1)}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700"
            >
              Finish ✓
            </button>
          )}
        </div>
      </div>

      {/* Confirm submit modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-black text-gray-900 mb-1">Submit Test?</h3>
            <p className="text-sm text-gray-500 mb-4">
              You have answered <strong>{answered}</strong> of <strong>{totalQ}</strong> questions.
              {answered < totalQ && ` ${totalQ - answered} unanswered will be marked skipped.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100"
              >
                Keep Going
              </button>
              <button
                onClick={() => handleSubmit()}
                disabled={submitting}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Phase: Results ───────────────────────────────────────────────────────────

function ResultPhase({ result }: { result: ResultData }) {
  const [showReview, setShowReview] = useState(false)
  const pct = result.percentage
  const grade = pct >= 80 ? { label: 'Excellent!', color: 'text-green-600', bg: 'bg-green-50', emoji: '🏆' }
    : pct >= 60 ? { label: 'Good Job!', color: 'text-blue-600', bg: 'bg-blue-50', emoji: '👍' }
    : pct >= 40 ? { label: 'Keep Trying!', color: 'text-yellow-600', bg: 'bg-yellow-50', emoji: '💪' }
    : { label: 'Need Practice', color: 'text-red-600', bg: 'bg-red-50', emoji: '📖' }

  const fmt = (s: number | null) => {
    if (!s) return '—'
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        {/* Score card */}
        <div className={`${grade.bg} rounded-2xl p-7 text-center mb-5 shadow-sm`}>
          <div className="text-5xl mb-2">{grade.emoji}</div>
          <div className={`text-2xl font-black ${grade.color} mb-1`}>{grade.label}</div>
          <div className="text-gray-700 font-medium">{result.attempt.studentName}</div>
          <div className="text-6xl font-black text-gray-900 my-3">{pct}<span className="text-3xl">%</span></div>
          <div className="text-gray-600 text-sm">
            Score: <strong>{result.attempt.score}</strong> / {result.test.totalMarks}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Correct', val: result.attempt.correct, color: 'bg-green-100 text-green-800' },
            { label: 'Wrong', val: result.attempt.wrong, color: 'bg-red-100 text-red-800' },
            { label: 'Skipped', val: result.attempt.skipped, color: 'bg-gray-100 text-gray-700' },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-xl p-3 text-center`}>
              <div className="text-2xl font-black">{s.val}</div>
              <div className="text-xs font-semibold">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-600 mb-5 flex justify-between">
          <span>Time taken: <strong>{fmt(result.attempt.timeTaken)}</strong></span>
          <span>Total questions: <strong>{result.attempt.totalQ}</strong></span>
        </div>

        {/* Review answers toggle */}
        <button
          onClick={() => setShowReview(!showReview)}
          className="w-full py-3 border-2 border-indigo-300 text-indigo-700 rounded-xl font-bold text-sm hover:bg-indigo-50 mb-4"
        >
          {showReview ? 'Hide' : 'Review'} Answers {showReview ? '▲' : '▼'}
        </button>

        {showReview && (
          <div className="space-y-4 mb-6">
            {result.review.map((q, i) => (
              <div key={q.id} className={`bg-white rounded-xl border-2 p-4 ${q.isCorrect ? 'border-green-300' : q.givenAnswer ? 'border-red-300' : 'border-gray-200'}`}>
                <div className="flex items-start gap-2 mb-3">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0
                    ${q.isCorrect ? 'bg-green-600 text-white' : q.givenAnswer ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-700'}`}>
                    {i + 1}
                  </span>
                  <p className="text-sm font-medium text-gray-800 leading-relaxed">{q.text}</p>
                </div>
                <div className="grid grid-cols-1 gap-1.5 ml-9">
                  {OPT_LABELS.map(opt => {
                    const text = (q as any)[`option${opt}`] as string | null
                    if (!text) return null
                    const isCorrect = opt === q.correctOption
                    const isGiven = opt === q.givenAnswer
                    return (
                      <div key={opt} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
                        ${isCorrect ? 'bg-green-100 text-green-800 font-bold' : isGiven && !isCorrect ? 'bg-red-100 text-red-800 line-through' : 'text-gray-500'}`}>
                        <span>{OPT_SYMS[opt]}</span>
                        <span>{text}</span>
                        {isCorrect && <span className="ml-auto">✓ Correct</span>}
                        {isGiven && !isCorrect && <span className="ml-auto">✗ Your answer</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => window.location.href = '/test'}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
        >
          Take Another Test
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Phase = 'code' | 'name' | 'test' | 'result' | 'loading' | 'error'

export default function TakeTestPage() {
  const { code: urlCode } = useParams<{ code?: string }>()

  const [phase, setPhase] = useState<Phase>(urlCode ? 'loading' : 'code')
  const [errorMsg, setErrorMsg] = useState('')
  const [testMeta, setTestMeta] = useState<TestMeta | null>(null)
  const [attemptId, setAttemptId] = useState('')
  const [result, setResult] = useState<ResultData | null>(null)

  // If a code is in the URL, resolve it immediately
  useEffect(() => {
    if (urlCode) resolveCode(urlCode)
  }, [urlCode])

  const resolveCode = async (code: string) => {
    setPhase('loading')
    try {
      const r = await api.get(`/quick-tests/code/${code.toUpperCase()}`)
      setTestMeta(r.data?.data)
      setPhase('name')
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error?.message ?? 'Test not found')
      setPhase('error')
    }
  }

  const handleStart = async (name: string) => {
    if (!testMeta) return
    try {
      const r = await api.post('/quick-tests/attempts', { testId: testMeta.testId, studentName: name })
      setAttemptId(r.data?.data?.attemptId)
      setPhase('test')
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error?.message ?? 'Could not start test')
      setPhase('error')
    }
  }

  const handleSubmit = async (answers: Record<string, string>, timeTaken: number) => {
    try {
      await api.post(`/quick-tests/attempts/${attemptId}/submit`, { answers, timeTaken })
      const r2 = await api.get(`/quick-tests/attempts/${attemptId}/result`)
      setResult(r2.data?.data)
      setPhase('result')
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.error?.message ?? 'Submission failed')
      setPhase('error')
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg font-bold">Loading test...</p>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-7 max-w-sm w-full text-center">
          <div className="text-5xl mb-3">😕</div>
          <h2 className="text-xl font-black text-gray-900 mb-2">Oops!</h2>
          <p className="text-gray-600 mb-5">{errorMsg}</p>
          <button
            onClick={() => { setPhase('code'); setErrorMsg('') }}
            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'code') return <EnterCodePhase onCode={resolveCode} />
  if (phase === 'name' && testMeta) return <EnterNamePhase test={testMeta} onStart={handleStart} />
  if (phase === 'test' && testMeta) return <TakeTestPhase test={testMeta} attemptId={attemptId} onSubmit={handleSubmit} />
  if (phase === 'result' && result) return <ResultPhase result={result} />

  return null
}
