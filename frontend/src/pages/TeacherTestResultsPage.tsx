import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';

interface AttemptRow {
  id: string; studentName: string; score: number; totalQ: number;
  correct: number; wrong: number; skipped: number;
  timeTaken: number | null; startedAt: string; submittedAt: string;
}
interface TestDetail {
  id: string; code: string; title: string;
  timeMinutes: number; totalMarks: number; attempts: AttemptRow[];
}

function fmtTime(sec: number | null) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function grade(pct: number) {
  if (pct >= 80) return { label: 'Excellent', color: 'text-green-600 bg-green-50' };
  if (pct >= 60) return { label: 'Good', color: 'text-blue-600 bg-blue-50' };
  if (pct >= 40) return { label: 'Average', color: 'text-amber-600 bg-amber-50' };
  return { label: 'Needs Work', color: 'text-red-600 bg-red-50' };
}

type SortCol = 'name' | 'score' | 'time';

export default function TeacherTestResultsPage() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortCol>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!testId) return;
    api.get(`/quick-tests/${testId}/results`)
      .then(res => setTest(res.data?.data))
      .catch(() => setError('Failed to load results.'))
      .finally(() => setLoading(false));
  }, [testId]);

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  const sorted = [...(test?.attempts ?? [])].sort((a, b) => {
    if (sortBy === 'name') return sortDir === 'asc' ? a.studentName.localeCompare(b.studentName) : b.studentName.localeCompare(a.studentName);
    const av = sortBy === 'score' ? (a.score ?? 0) : (a.timeTaken ?? Infinity);
    const bv = sortBy === 'score' ? (b.score ?? 0) : (b.timeTaken ?? Infinity);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const avgScore = test?.attempts.length
    ? Math.round(test.attempts.reduce((s, a) => s + (a.score ?? 0), 0) / test.attempts.length) : 0;
  const avgPct = test?.attempts.length && test.totalMarks
    ? Math.round((avgScore / test.totalMarks) * 100) : 0;
  const topStudent = [...(test?.attempts ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  const SortTh = ({ col, label, align = 'left' }: { col: SortCol; label: string; align?: string }) => (
    <th onClick={() => toggleSort(col)}
      className={`px-4 py-3 text-${align} cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap`}>
      <span className="flex items-center gap-1 justify-start">
        {label}
        <span className={`text-xs ${sortBy === col ? 'text-indigo-500' : 'text-gray-300'}`}>
          {sortBy === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );

  return (
    <TeacherShell
      title={test?.title ?? 'Test Results'}
      subtitle={test ? `${test.timeMinutes} min · ${test.totalMarks} marks` : ''}
      action={<Link to="/teacher/tests" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">← Back to Tests</Link>}
    >
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="text-center">
            <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-400 text-sm">Loading results...</p>
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
      ) : test && (
        <div className="max-w-5xl space-y-5">
          {test.code && (
            <span className="bg-indigo-100 text-indigo-700 text-xs font-mono font-bold px-3 py-1 rounded-lg inline-block">{test.code}</span>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Attempts', value: test.attempts.length, color: 'text-indigo-700' },
              { label: `Avg Score / ${test.totalMarks}`, value: avgScore, color: 'text-indigo-700' },
              { label: 'Avg Percentage', value: `${avgPct}%`, color: 'text-indigo-700' },
              { label: 'Top Student', value: topStudent?.studentName ?? '—', color: 'text-green-700', small: true },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
                <p className={`font-extrabold ${s.color} ${s.small ? 'text-base truncate' : 'text-3xl'}`}>{s.value}</p>
                <p className="text-gray-400 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {test.attempts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
              <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <p className="text-gray-500 font-medium mb-1">No attempts yet</p>
              <p className="text-gray-400 text-sm">Share code <span className="font-mono font-semibold text-gray-600">{test.code}</span> with your students.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-800">{test.attempts.length} attempt{test.attempts.length !== 1 ? 's' : ''}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs font-semibold uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left">#</th>
                      <SortTh col="name" label="Student" />
                      <SortTh col="score" label="Score" />
                      <th className="px-4 py-3 text-center">%</th>
                      <th className="px-4 py-3 text-center">✓ Correct</th>
                      <th className="px-4 py-3 text-center">✗ Wrong</th>
                      <th className="px-4 py-3 text-center">Skipped</th>
                      <SortTh col="time" label="Time" />
                      <th className="px-4 py-3 text-center">Grade</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.map((a, idx) => {
                      const pct = a.totalQ ? Math.round(((a.correct ?? 0) / a.totalQ) * 100) : 0;
                      const g = grade(pct);
                      const pctColor = pct >= 60 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500';
                      return (
                        <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-300 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold shrink-0">
                                {(a.studentName ?? '?').charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-800">{a.studentName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-bold text-gray-800">
                            {a.score ?? 0}<span className="text-gray-300 font-normal">/{test.totalMarks}</span>
                          </td>
                          <td className={`px-4 py-3 text-center font-bold ${pctColor}`}>{pct}%</td>
                          <td className="px-4 py-3 text-center text-green-600 font-semibold">{a.correct ?? 0}</td>
                          <td className="px-4 py-3 text-center text-red-500 font-semibold">{a.wrong ?? 0}</td>
                          <td className="px-4 py-3 text-center text-gray-400">{a.skipped ?? 0}</td>
                          <td className="px-4 py-3 text-center text-gray-400">{fmtTime(a.timeTaken)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${g.color}`}>{g.label}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">
                            {new Date(a.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </TeacherShell>
  );
}
