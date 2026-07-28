import { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import api from '../api';

interface ResultData {
  student: { name: string; rollNumber: string };
  exam: { title: string; totalMarks: number; totalQuestions: number; examCode: string | null };
  result: {
    correctCount: number;
    wrongCount: number;
    skippedCount: number;
    rawScore: number;
    negativeDeduction: number;
    finalScore: number;
    percentage: number;
    rank: number | null;
  };
  answerKeyUrl: string | null;
  isAutoSubmitted: boolean;
  submittedAt: string | null;
  calculatedAt: string;
}

function grade(pct: number) {
  if (pct >= 80) return { label: 'Excellent!', color: 'text-green-600', bg: 'bg-green-50 border-green-200', emoji: '🏆' };
  if (pct >= 60) return { label: 'Good', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', emoji: '👍' };
  if (pct >= 40) return { label: 'Average', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', emoji: '📚' };
  return { label: 'Keep Practising', color: 'text-red-600', bg: 'bg-red-50 border-red-200', emoji: '💪' };
}

export default function ExamResultPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const sessionToken = (location.state as any)?.sessionToken ?? localStorage.getItem('exam_session_token') ?? '';

  const [result, setResult] = useState<ResultData | null>(null);
  const [status, setStatus] = useState<'loading' | 'processing' | 'done' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [pollCount, setPollCount] = useState(0);

  const headers = sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};

  async function fetchResult() {
    try {
      const res = await api.get(`/results/session/${sessionId}`, { headers });
      if (res.status === 202 || res.data?.data?.status === 'PROCESSING') {
        setStatus('processing');
        return false;
      }
      setResult(res.data.data);
      setStatus('done');
      return true;
    } catch (err: any) {
      if (err?.response?.status === 202) {
        setStatus('processing');
        return false;
      }
      setErrorMsg(err?.response?.data?.error?.message ?? 'Could not load result.');
      setStatus('error');
      return true;
    }
  }

  useEffect(() => {
    fetchResult();
  }, []);

  // Poll while processing
  useEffect(() => {
    if (status !== 'processing') return;
    const interval = setInterval(async () => {
      const done = await fetchResult();
      if (done) clearInterval(interval);
      setPollCount(c => c + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading your result...</p>
        </div>
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚙️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Calculating Result...</h2>
          <p className="text-gray-500 text-sm mb-6">Your exam has been submitted. Results will appear in a moment.</p>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>
          <p className="text-xs text-gray-400">Checking every 3 seconds... ({pollCount + 1})</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Couldn't Load Result</h2>
          <p className="text-gray-500 text-sm mb-4">{errorMsg}</p>
          <button onClick={fetchResult} className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const g = grade(result.result.percentage);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-indigo-800 text-white px-4 py-6">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-indigo-300 text-sm mb-1">{result.exam.title}</p>
          <h1 className="text-2xl font-extrabold">Your Result</h1>
          <p className="text-indigo-200 text-sm mt-1">
            {result.student.name} · Roll: {result.student.rollNumber}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Score card */}
        <div className={`rounded-2xl border-2 p-6 text-center ${g.bg}`}>
          <div className="text-5xl mb-2">{g.emoji}</div>
          <p className={`text-5xl font-extrabold ${g.color} mb-1`}>{result.result.percentage.toFixed(1)}%</p>
          <p className={`text-lg font-bold ${g.color}`}>{g.label}</p>
          {result.isAutoSubmitted && (
            <p className="text-xs text-gray-500 mt-2">⏰ Auto-submitted when time expired</p>
          )}
        </div>

        {/* Score breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-gray-800 mb-4">Score Breakdown</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-gray-50 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-gray-800">{result.result.finalScore}</p>
              <p className="text-xs text-gray-400 mt-0.5">Final Score / {result.exam.totalMarks}</p>
            </div>
            {result.result.rank && (
              <div className="text-center bg-indigo-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-indigo-700">#{result.result.rank}</p>
                <p className="text-xs text-gray-400 mt-0.5">Rank</p>
              </div>
            )}
            <div className="text-center bg-green-50 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-green-600">{result.result.correctCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Correct</p>
            </div>
            <div className="text-center bg-red-50 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-red-500">{result.result.wrongCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Wrong</p>
            </div>
            <div className="text-center bg-gray-50 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-gray-500">{result.result.skippedCount}</p>
              <p className="text-xs text-gray-400 mt-0.5">Skipped</p>
            </div>
            {result.result.negativeDeduction > 0 && (
              <div className="text-center bg-orange-50 rounded-xl p-4">
                <p className="text-2xl font-extrabold text-orange-600">-{result.result.negativeDeduction}</p>
                <p className="text-xs text-gray-400 mt-0.5">Negative Marks</p>
              </div>
            )}
          </div>

          {result.result.negativeDeduction > 0 && (
            <div className="mt-4 bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-sm text-gray-600">
                Raw score <strong>{result.result.rawScore}</strong> − Negative deduction <strong>{result.result.negativeDeduction}</strong> = Final <strong>{result.result.finalScore}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Answer key download */}
        {result.answerKeyUrl && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">Detailed Answer Key</p>
              <p className="text-xs text-gray-400">PDF with all questions, your answers and correct answers</p>
            </div>
            <a
              href={result.answerKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 whitespace-nowrap"
            >
              Download PDF
            </a>
          </div>
        )}

        {/* Meta */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-800 mb-3">Exam Details</h2>
          <div className="space-y-1.5 text-sm text-gray-600">
            <div className="flex justify-between"><span className="text-gray-400">Exam</span><span className="font-medium">{result.exam.title}</span></div>
            {result.exam.examCode && <div className="flex justify-between"><span className="text-gray-400">Code</span><span className="font-mono font-bold">{result.exam.examCode}</span></div>}
            <div className="flex justify-between"><span className="text-gray-400">Total Questions</span><span>{result.exam.totalQuestions}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Total Marks</span><span>{result.exam.totalMarks}</span></div>
            {result.submittedAt && (
              <div className="flex justify-between"><span className="text-gray-400">Submitted</span><span>{new Date(result.submittedAt).toLocaleString()}</span></div>
            )}
          </div>
        </div>

        <div className="text-center pt-2">
          <Link to="/exam" className="text-indigo-600 text-sm hover:underline">
            Take Another Exam
          </Link>
        </div>
      </div>
    </div>
  );
}
