import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import api from '../api';
import { useToast } from '../components/ui/Toast';

interface Question {
  order: number;
  id: string;
  text: string;
  questionImageUrl: string | null;
  optionA: string | null;
  optionAImageUrl: string | null;
  optionB: string | null;
  optionBImageUrl: string | null;
  optionC: string | null;
  optionCImageUrl: string | null;
  optionD: string | null;
  optionDImageUrl: string | null;
}

interface ExamState {
  sessionToken: string;
  sessionId: string;
  student: { id: string; name: string; rollNumber: string };
  exam: { title: string; totalQuestions: number; durationMinutes: number; timerMode: string; negativeMarking: boolean };
  questions: Question[];
  alreadyAnswered: Record<string, string>;
  timer: { timeRemainingSeconds: number };
  resumed: boolean;
}

const OPTIONS: Array<{ key: 'A' | 'B' | 'C' | 'D'; label: string }> = [
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
  { key: 'C', label: 'C' },
  { key: 'D', label: 'D' },
];

const OPTION_CIRCLES = ['①', '②', '③', '④'];

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ExamTakePage() {
  const toast = useToast();
  const { sessionId: paramSessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as ExamState | null;

  const [examState, setExamState] = useState<ExamState | null>(state);
  const [answers, setAnswers] = useState<Record<string, string>>(state?.alreadyAnswered ?? {});
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(state?.timer?.timeRemainingSeconds ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [expired, setExpired] = useState(false);
  const [loadError, setLoadError] = useState('');

  const sessionToken = examState?.sessionToken ?? localStorage.getItem('exam_session_token') ?? '';
  const sessionId = paramSessionId ?? examState?.sessionId ?? '';

  // Auth header for session-protected requests
  const sessionHeaders = { Authorization: `Bearer ${sessionToken}` };

  // If navigated directly (no state), try to load progress from API
  useEffect(() => {
    if (!state && sessionId) {
      api.get(`/sessions/${sessionId}/progress`, { headers: sessionHeaders })
        .then(res => {
          const d = res.data.data;
          setAnswers(d.answers ?? {});
          setTimeLeft(d.timeRemainingSeconds ?? 0);
          if (d.status !== 'IN_PROGRESS') {
            navigate(`/exam/result/${sessionId}`, { replace: true });
          }
        })
        .catch(() => setLoadError('Could not load exam session. Please rejoin.'));
    }
  }, []);

  // Timer countdown
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timeLeft <= 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [examState]);

  // Auto-submit when expired
  useEffect(() => {
    if (expired && !submitting) handleSubmit(true);
  }, [expired]);

  // Sync timer from server every 30s to prevent drift
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/sessions/${sessionId}/timer`, { headers: sessionHeaders });
        const { timeRemainingSeconds, expired: exp } = res.data.data;
        if (exp) { setExpired(true); return; }
        setTimeLeft(timeRemainingSeconds);
      } catch { /* ignore */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const saveAnswer = useCallback(async (questionOrder: number, option: string | null) => {
    try {
      await api.put(`/sessions/${sessionId}/answer`, {
        questionOrder,
        selectedOption: option,
      }, { headers: sessionHeaders });
    } catch { /* silently ignore auto-save errors */ }
  }, [sessionId, sessionToken]);

  function handleOptionSelect(questionOrder: number, option: 'A' | 'B' | 'C' | 'D') {
    const key = String(questionOrder);
    const existing = answers[key];
    const newOption = existing === option ? null : option; // toggle off if same
    const newAnswers = { ...answers };
    if (newOption === null) delete newAnswers[key];
    else newAnswers[key] = newOption;
    setAnswers(newAnswers);
    saveAnswer(questionOrder, newOption);
  }

  async function handleSubmit(auto = false) {
    if (submitting) return;
    setSubmitting(true);
    setShowSubmitModal(false);
    try {
      await api.post(`/sessions/${sessionId}/submit`, {}, { headers: sessionHeaders });
      navigate(`/exam/result/${sessionId}`, { replace: true, state: { sessionToken } });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Submission failed.';
      if (!auto) toast.error(msg);
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-gray-700 font-medium mb-4">{loadError}</p>
          <a href="/exam" className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium">
            Rejoin Exam
          </a>
        </div>
      </div>
    );
  }

  if (!examState && !state) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading exam...</p>
        </div>
      </div>
    );
  }

  const questions = examState?.questions ?? state?.questions ?? [];
  const exam = examState?.exam ?? state?.exam;
  const student = examState?.student ?? state?.student;
  const q = questions[currentQ];
  const answeredCount = Object.keys(answers).length;
  const totalQ = questions.length;

  // Timer color
  const timerColor = timeLeft <= 60 ? 'text-red-600 animate-pulse' : timeLeft <= 300 ? 'text-yellow-600' : 'text-green-700';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Timer Bar */}
      <div className="bg-indigo-800 text-white px-4 py-3 sticky top-0 z-30 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-bold text-sm truncate">{exam?.title}</p>
            <p className="text-indigo-300 text-xs truncate">{student?.name} · {student?.rollNumber}</p>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-center">
              <p className="text-xs text-indigo-300">Answered</p>
              <p className="font-bold">{answeredCount}/{totalQ}</p>
            </div>
            <div className={`text-center bg-indigo-900 rounded-xl px-4 py-1.5 ${timerColor}`}>
              <p className="text-xs text-indigo-300">Time Left</p>
              <p className="font-mono font-bold text-xl">{fmtTime(timeLeft)}</p>
            </div>
            <button
              onClick={() => setShowSubmitModal(true)}
              disabled={submitting}
              className="bg-green-500 hover:bg-green-400 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-60"
            >
              Submit
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-4 flex gap-4 flex-1">
        {/* Question Navigator */}
        <aside className="hidden md:block w-52 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sticky top-24">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Questions</p>
            <div className="grid grid-cols-5 gap-1.5">
              {questions.map((q, idx) => {
                const answered = !!answers[String(q.order)];
                const isCurrent = idx === currentQ;
                return (
                  <button
                    key={q.order}
                    onClick={() => setCurrentQ(idx)}
                    className={`w-8 h-8 text-xs font-bold rounded-lg transition-all ${
                      isCurrent
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : answered
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {q.order}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 space-y-1 text-xs text-gray-400">
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-green-100 rounded inline-block"></span> Answered</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-100 rounded inline-block"></span> Not answered</div>
              <div className="flex items-center gap-1"><span className="w-3 h-3 bg-indigo-600 rounded inline-block"></span> Current</div>
            </div>
          </div>
        </aside>

        {/* Question Card */}
        <main className="flex-1 min-w-0">
          {q && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center justify-between">
                <span className="text-sm font-bold text-indigo-700">Question {q.order} of {totalQ}</span>
                <span className="text-xs text-indigo-400">{answeredCount} answered</span>
              </div>

              <div className="p-6">
                <p className="text-gray-800 text-base font-medium leading-relaxed mb-4">{q.text}</p>
                {q.questionImageUrl && (
                  <img src={q.questionImageUrl} alt="Question" className="max-w-full max-h-64 rounded-xl mb-4 border border-gray-200 object-contain" />
                )}

                <div className="space-y-3 mt-4">
                  {OPTIONS.map(({ key }, i) => {
                    const text = q[`option${key}` as keyof Question] as string | null;
                    const imgUrl = q[`option${key}ImageUrl` as keyof Question] as string | null;
                    const selected = answers[String(q.order)] === key;
                    if (!text && !imgUrl) return null;

                    return (
                      <button
                        key={key}
                        onClick={() => handleOptionSelect(q.order, key)}
                        className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-all flex items-start gap-3 ${
                          selected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                            : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-700'
                        }`}
                      >
                        <span className={`text-lg flex-shrink-0 mt-0.5 ${selected ? 'text-indigo-600' : 'text-gray-400'}`}>
                          {OPTION_CIRCLES[i]}
                        </span>
                        <span className="flex-1 text-sm leading-relaxed">
                          {text}
                          {imgUrl && <img src={imgUrl} alt={`Option ${key}`} className="max-h-32 mt-2 rounded-lg object-contain" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  onClick={() => setCurrentQ(i => Math.max(0, i - 1))}
                  disabled={currentQ === 0}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Previous
                </button>

                {/* Mobile navigator dots */}
                <div className="md:hidden flex gap-1 overflow-x-auto max-w-40">
                  {questions.slice(Math.max(0, currentQ - 2), currentQ + 3).map((qq, i) => (
                    <button
                      key={qq.order}
                      onClick={() => setCurrentQ(questions.indexOf(qq))}
                      className={`w-7 h-7 text-xs font-bold rounded-lg flex-shrink-0 ${
                        qq.order === q.order ? 'bg-indigo-600 text-white' : answers[String(qq.order)] ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {qq.order}
                    </button>
                  ))}
                </div>

                {currentQ < totalQ - 1 ? (
                  <button
                    onClick={() => setCurrentQ(i => i + 1)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700"
                  >
                    Submit Exam
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="text-4xl text-center mb-3">📋</div>
            <h3 className="text-lg font-bold text-gray-800 text-center mb-2">Submit Exam?</h3>
            <div className="grid grid-cols-3 gap-3 my-4 text-center">
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xl font-bold text-green-600">{answeredCount}</p>
                <p className="text-xs text-gray-400">Answered</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xl font-bold text-red-500">{totalQ - answeredCount}</p>
                <p className="text-xs text-gray-400">Unanswered</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xl font-bold text-blue-600">{fmtTime(timeLeft)}</p>
                <p className="text-xs text-gray-400">Left</p>
              </div>
            </div>
            {totalQ - answeredCount > 0 && (
              <p className="text-yellow-600 text-sm text-center mb-4">
                ⚠️ {totalQ - answeredCount} question{totalQ - answeredCount !== 1 ? 's' : ''} still unanswered.
              </p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50"
              >
                Continue
              </button>
              <button
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold hover:bg-green-700 disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-submit overlay */}
      {expired && submitting && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center max-w-sm mx-4">
            <div className="text-4xl mb-4">⏰</div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Time's Up!</h3>
            <p className="text-gray-500 text-sm mb-4">Your exam is being submitted automatically...</p>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
        </div>
      )}
    </div>
  );
}
