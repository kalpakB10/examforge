import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import StudentShell from '../components/StudentShell';
import { useAuth } from '../contexts/AuthContext';

interface RecentResult {
  sessionId: string;
  exam: { id: string; title: string; examCode: string | null; totalMarks: number; totalQuestions: number };
  rank: number | null;
  finalScore: number;
  percentage: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  submittedAt: string | null;
  isAutoSubmitted: boolean;
  calculatedAt: string;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [examCode, setExamCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [results, setResults] = useState<RecentResult[] | null>(null);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsError, setResultsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecent = async () => {
      setResultsLoading(true);
      setResultsError(null);
      try {
        const res = await api.get('/results/mine');
        setResults(res.data?.data ?? []);
      } catch (err: any) {
        setResults([]);
        // Only show an error banner for real failures. On first login the list
        // will legitimately be empty — that's the "no results yet" empty state.
        setResultsError(err?.response?.data?.error?.message ?? "Couldn't load your results. Check your connection.");
      } finally {
        setResultsLoading(false);
      }
    };
    fetchRecent();
  }, []);

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    setJoinError('');
    const code = examCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError('Enter a valid exam code (at least 4 characters).'); return; }
    navigate(`/exam/${code}`);
  };

  const firstName = user?.name?.split(' ')[0] ?? 'Student';

  return (
    <StudentShell title={`Welcome, ${firstName}`} subtitle="Enter an exam code to start, or review your past results.">
      <div className="max-w-4xl space-y-6">
        {/* Big join-exam hero */}
        <section className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 rounded-2xl text-white p-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-1">Take an exam</h2>
          <p className="text-indigo-100 text-sm mb-6">Got a code from your teacher? Enter it below.</p>
          <form onSubmit={handleJoin} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={examCode}
              onChange={(e) => setExamCode(e.target.value.toUpperCase())}
              placeholder="EXAM CODE"
              maxLength={12}
              className="flex-1 px-5 py-3.5 rounded-xl bg-white text-gray-900 font-mono font-bold text-xl tracking-widest text-center focus:outline-none focus:ring-4 focus:ring-indigo-300 placeholder:text-gray-400 placeholder:font-normal placeholder:tracking-wide shadow-inner"
              autoFocus
            />
            <button type="submit"
              className="px-6 py-3.5 bg-white text-indigo-700 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-sm text-sm whitespace-nowrap">
              Start exam →
            </button>
          </form>
          {joinError && <p className="text-red-100 text-sm mt-3">{joinError}</p>}
        </section>

        {/* Recent results */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Recent results</h2>
            {results && results.length > 3 && (
              <button onClick={() => navigate('/student/results')}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold">
                View all →
              </button>
            )}
          </div>

          {resultsLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : resultsError && (!results || results.length === 0) ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex items-start gap-4">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Couldn't load your results</p>
                <p className="text-sm text-red-700 mt-0.5">{resultsError}</p>
              </div>
              <button onClick={() => window.location.reload()}
                className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100">
                Retry
              </button>
            </div>
          ) : !results || results.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-gray-600 font-semibold mb-1">No exams taken yet</p>
              <p className="text-gray-400 text-sm">Enter an exam code above to get started. Your results will show up here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.slice(0, 3).map((r) => <ResultCard key={r.sessionId} result={r} onOpen={() => navigate(`/exam/result/${r.sessionId}`)} />)}
            </div>
          )}
        </section>
      </div>
    </StudentShell>
  );
}

function ResultCard({ result, onOpen }: { result: RecentResult; onOpen: () => void }) {
  const pct = Math.round(result.percentage);
  // Color-code by percentage: green ≥75, amber 50–74, red <50.
  const tone = pct >= 75 ? 'green' : pct >= 50 ? 'amber' : 'red';
  const toneClasses: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <button onClick={onOpen}
      className="w-full bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between hover:border-indigo-300 hover:shadow-sm transition-all text-left">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{result.exam.title}</p>
        <p className="text-xs text-gray-500 mt-1">
          {result.exam.examCode && <span className="font-mono text-indigo-600 font-semibold">{result.exam.examCode}</span>}
          {result.exam.examCode && ' · '}
          {result.correctCount}/{result.exam.totalQuestions} correct
          {result.rank && ` · rank #${result.rank}`}
          {result.submittedAt && ` · ${new Date(result.submittedAt).toLocaleDateString()}`}
        </p>
      </div>
      <div className={`shrink-0 ml-4 px-4 py-2 rounded-xl border font-bold text-lg ${toneClasses[tone]}`}>
        {pct}%
      </div>
    </button>
  );
}
