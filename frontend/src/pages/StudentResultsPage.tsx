import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import StudentShell from '../components/StudentShell';

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

export default function StudentResultsPage() {
  const navigate = useNavigate();
  const [results, setResults] = useState<RecentResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/results/mine');
      setResults(res.data?.data ?? []);
    } catch (err: any) {
      setResults([]);
      setError(err?.response?.data?.error?.message ?? "Couldn't load your results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  return (
    <StudentShell title="My Results" subtitle="All exams you've taken while logged in.">
      <div className="max-w-4xl">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error && (!results || results.length === 0) ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex items-start gap-4">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Couldn't load your results</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
            </div>
            <button onClick={fetch}
              className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100">
              Retry
            </button>
          </div>
        ) : !results || results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-gray-600 font-semibold mb-1">No exams taken yet</p>
            <p className="text-gray-400 text-sm mb-6">Enter an exam code from your dashboard to get started.</p>
            <button onClick={() => navigate('/student')}
              className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
              Go to dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {results.map((r) => {
              const pct = Math.round(r.percentage);
              const tone = pct >= 75 ? 'green' : pct >= 50 ? 'amber' : 'red';
              const toneClasses: Record<string, string> = {
                green: 'bg-green-50 text-green-700 border-green-200',
                amber: 'bg-amber-50 text-amber-700 border-amber-200',
                red: 'bg-red-50 text-red-700 border-red-200',
              };
              return (
                <button key={r.sessionId} onClick={() => navigate(`/exam/result/${r.sessionId}`)}
                  className="w-full bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between hover:border-indigo-300 hover:shadow-sm transition-all text-left">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{r.exam.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {r.exam.examCode && <span className="font-mono text-indigo-600 font-semibold">{r.exam.examCode}</span>}
                      {r.exam.examCode && ' · '}
                      <strong>{r.correctCount}</strong>/{r.exam.totalQuestions} correct
                      {' · '}
                      {r.wrongCount} wrong
                      {' · '}
                      {r.skippedCount} skipped
                      {r.rank && ` · rank #${r.rank}`}
                    </p>
                    {r.submittedAt && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Submitted {new Date(r.submittedAt).toLocaleString()}
                        {r.isAutoSubmitted && ' · auto-submitted (time expired)'}
                      </p>
                    )}
                  </div>
                  <div className={`shrink-0 ml-4 px-4 py-2 rounded-xl border font-bold text-lg ${toneClasses[tone]}`}>
                    {pct}%
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
