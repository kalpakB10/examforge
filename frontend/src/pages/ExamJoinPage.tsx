import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../contexts/AuthContext';

interface ExamInfo {
  examId: string;
  examCode: string;
  title: string;
  subject: string | null;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  timerMode: string;
  negativeMarking: boolean;
  negativeMarksValue: number;
}

type Phase = 'code' | 'details' | 'joining' | 'error';

export default function ExamJoinPage() {
  const { examCode: paramCode } = useParams<{ examCode?: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const [phase, setPhase] = useState<Phase>(paramCode ? 'details' : 'code');
  const [code, setCode] = useState(paramCode?.toUpperCase() ?? '');
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  // Prefill name for logged-in students — one less thing to type. They can
  // still edit it (e.g. if they want to use their formal school name).
  const [studentName, setStudentName] = useState(user?.name ?? '');
  const [rollNumber, setRollNumber] = useState('');
  const [loadingExam, setLoadingExam] = useState(!!paramCode);
  const [error, setError] = useState('');

  useEffect(() => {
    if (paramCode) fetchExam(paramCode.toUpperCase());
  }, [paramCode]);

  async function fetchExam(examCode: string) {
    setLoadingExam(true);
    setError('');
    try {
      const res = await api.get(`/exams/join/${examCode}`);
      setExamInfo(res.data.data);
      setPhase('details');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Exam not found.';
      setError(msg);
      setPhase('error');
    } finally {
      setLoadingExam(false);
    }
  }

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    await fetchExam(trimmed);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!studentName.trim() || !rollNumber.trim()) {
      setError('Please enter your name and roll number.');
      return;
    }
    setPhase('joining');
    setError('');
    try {
      const res = await api.post('/sessions/join', {
        examCode: examInfo!.examCode,
        studentName: studentName.trim(),
        rollNumber: rollNumber.trim(),
      });
      const data = res.data.data;
      // Store session token separately from teacher JWT
      localStorage.setItem('exam_session_token', data.sessionToken);
      localStorage.setItem('exam_session_id', data.sessionId);
      navigate(`/exam/take/${data.sessionId}`, {
        state: {
          sessionToken: data.sessionToken,
          sessionId: data.sessionId,
          student: data.student,
          exam: data.exam,
          questions: data.questions,
          alreadyAnswered: data.alreadyAnswered ?? {},
          timer: data.timer,
          resumed: data.resumed,
        },
        replace: true,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? 'Failed to join exam. Please try again.';
      setError(msg);
      setPhase('details');
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-700 via-indigo-600 to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📝</div>
          <h1 className="text-3xl font-extrabold text-white">Join Exam</h1>
          <p className="text-indigo-200 mt-1">Enter your exam code to get started</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Phase: Enter code */}
          {phase === 'code' && (
            <form onSubmit={handleCodeSubmit} className="p-8">
              <h2 className="text-xl font-bold text-gray-800 mb-6">Enter Exam Code</h2>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
              )}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Exam Code</label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. PHY2024"
                  maxLength={20}
                  className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-xl font-mono font-bold tracking-widest text-center uppercase focus:outline-none focus:border-indigo-500 transition-colors"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loadingExam || !code.trim()}
                className="w-full bg-indigo-600 text-white py-3.5 rounded-xl font-bold text-base hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loadingExam ? 'Finding exam...' : 'Find Exam →'}
              </button>
            </form>
          )}

          {/* Phase: Loading */}
          {loadingExam && phase !== 'code' && (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading exam...</p>
            </div>
          )}

          {/* Phase: Error */}
          {phase === 'error' && !loadingExam && (
            <div className="p-8 text-center">
              <div className="text-5xl mb-4">❌</div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">Exam Not Found</h3>
              <p className="text-gray-500 text-sm mb-6">{error}</p>
              <button
                onClick={() => { setPhase('code'); setError(''); setCode(''); }}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-indigo-700"
              >
                Try Another Code
              </button>
            </div>
          )}

          {/* Phase: Enter details */}
          {phase === 'details' && examInfo && !loadingExam && (
            <form onSubmit={handleJoin} className="p-8">
              {/* Exam info card */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-indigo-600 text-white text-xs font-mono px-2 py-0.5 rounded font-bold">{examInfo.examCode}</span>
                  <span className="text-xs text-indigo-500">{examInfo.subject}</span>
                </div>
                <h3 className="font-bold text-gray-800 text-base mb-2">{examInfo.title}</h3>
                <div className="grid grid-cols-3 gap-2 text-center min-w-0">
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-lg font-bold text-indigo-700">{examInfo.totalQuestions}</p>
                    <p className="text-xs text-gray-400">Questions</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-lg font-bold text-indigo-700">{examInfo.totalMarks}</p>
                    <p className="text-xs text-gray-400">Marks</p>
                  </div>
                  <div className="bg-white rounded-lg p-2">
                    <p className="text-lg font-bold text-indigo-700">{examInfo.durationMinutes}</p>
                    <p className="text-xs text-gray-400">Minutes</p>
                  </div>
                </div>
                {examInfo.negativeMarking && (
                  <p className="text-xs text-red-500 mt-2 text-center">
                    ⚠️ Negative marking: -{examInfo.negativeMarksValue} per wrong answer
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
              )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800">Your Details</h2>
                {isAuthenticated && user?.role === 'STUDENT' && (
                  <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full px-3 py-1 font-medium">
                    Signed in as {user.name} — results save to your account
                  </span>
                )}
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={rollNumber}
                    onChange={e => setRollNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. CS2024-047"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">Your roll number uniquely identifies you in this exam</p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-6">
                <p className="text-xs text-yellow-700">
                  <strong>Important:</strong> Once you start, the timer begins and cannot be paused.
                  If you close the browser, your progress is saved and you can resume.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setPhase('code'); setExamInfo(null); setError(''); }}
                  className="flex-1 border border-gray-300 text-gray-600 py-3 rounded-xl font-medium hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={!studentName.trim() || !rollNumber.trim()}
                  className="flex-2 flex-grow bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  Start Exam →
                </button>
              </div>
            </form>
          )}

          {/* Phase: Joining */}
          {phase === 'joining' && (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-700 font-medium">Starting your exam...</p>
              <p className="text-gray-400 text-sm mt-1">Please wait</p>
            </div>
          )}
        </div>

        <p className="text-center text-indigo-200 text-xs mt-4">
          No account needed — just your name and roll number
        </p>
      </div>
    </div>
  );
}
