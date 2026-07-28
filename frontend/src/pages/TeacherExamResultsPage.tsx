import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/Confirm';

interface ResultRow {
  rank: number; studentName: string; rollNumber: string;
  correctCount: number; wrongCount: number; skippedCount: number;
  rawScore: number; negativeDeduction: number; finalScore: number;
  percentage: number; isAutoSubmitted: boolean;
  submittedAt: string | null; answerKeyUrl: string | null;
}
interface Summary {
  totalStudents: number; submitted: number; inProgress: number;
  resultsCalculated: number; averageScore: number; highestScore: number; lowestScore: number;
}
interface ExamDetail {
  title: string; totalMarks: number; totalQuestions: number;
  examCode: string | null; status: string;
}

type SortKey = 'rank' | 'name' | 'score' | 'pct';

export default function TeacherExamResultsPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!examId) return;
    api.get(`/results/exam/${examId}`)
      .then(res => {
        const d = res.data.data;
        setExam(d.exam); setSummary(d.summary); setResults(d.results ?? []);
      })
      .catch(() => setError('Failed to load results.'))
      .finally(() => setLoading(false));
  }, [examId]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...results]
    .filter(r => !search || r.studentName?.toLowerCase().includes(search.toLowerCase()) || r.rollNumber?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortKey === 'name') return sortDir === 'asc' ? (a.studentName ?? '').localeCompare(b.studentName ?? '') : (b.studentName ?? '').localeCompare(a.studentName ?? '');
      const vals: Record<SortKey, [number, number]> = { rank: [a.rank, b.rank], score: [a.finalScore, b.finalScore], pct: [a.percentage, b.percentage], name: [0, 0] };
      const [av, bv] = vals[sortKey];
      return sortDir === 'asc' ? av - bv : bv - av;
    });

  async function handleFinalize() {
    const ok = await confirm({
      title: 'Assign final ranks?',
      message: 'This assigns rank numbers to all students based on their scores. You can re-run any time.',
      confirmLabel: 'Assign ranks',
    });
    if (!ok) return;
    setFinalizing(true);
    try {
      await api.post(`/results/exam/${examId}/finalize`);
      const res = await api.get(`/results/exam/${examId}`);
      setResults(res.data.data.results ?? []); setSummary(res.data.data.summary);
      toast.success('Ranks assigned successfully!');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(e?.response?.data?.error?.message ?? 'Finalize failed.');
    } finally { setFinalizing(false); }
  }

  async function handleRecalculate() {
    const ok = await confirm({
      title: 'Recalculate all results?',
      message: 'Re-queues result calculation for every submitted session. Existing rows will be updated.',
      confirmLabel: 'Recalculate',
    });
    if (!ok) return;
    try { await api.post(`/results/exam/${examId}/recalculate`); toast.info('Recalculation queued — refresh shortly.'); }
    catch { toast.error('Recalculate failed.'); }
  }

  const SortTh = ({ k, label }: { k: SortKey; label: string }) => (
    <th onClick={() => toggleSort(k)} className="px-4 py-3 text-left cursor-pointer select-none hover:text-indigo-600 transition-colors whitespace-nowrap">
      <span className="flex items-center gap-1">
        {label}
        <span className={`text-xs ${sortKey === k ? 'text-indigo-500' : 'text-gray-300'}`}>
          {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );

  const statusColor = exam?.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : exam?.status === 'COMPLETED' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700';

  return (
    <TeacherShell
      title={exam?.title ?? 'Exam Results'}
      subtitle={exam ? `${exam.totalQuestions} questions · ${exam.totalMarks} marks` : ''}
      action={<Link to="/teacher/exams" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">← Back to Exams</Link>}
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
      ) : summary && (
        <div className="max-w-6xl space-y-5">
          {/* Exam badge + status */}
          {exam && (
            <div className="flex items-center gap-3 flex-wrap">
              {exam.examCode && <span className="bg-indigo-100 text-indigo-700 text-xs font-mono font-bold px-3 py-1 rounded-lg">{exam.examCode}</span>}
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wide ${statusColor}`}>{exam.status}</span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total Students', value: summary.totalStudents, color: 'text-indigo-700', bg: 'bg-indigo-50' },
              { label: 'Submitted', value: summary.submitted, color: 'text-green-700', bg: 'bg-green-50' },
              { label: `Avg Score / ${exam?.totalMarks}`, value: summary.averageScore.toFixed(1), color: 'text-indigo-700', bg: 'bg-indigo-50' },
              { label: 'Highest Score', value: summary.highestScore, color: 'text-violet-700', bg: 'bg-violet-50' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
                <p className={`text-3xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-gray-400 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* In-progress indicator */}
          {summary.inProgress > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
              <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
              {summary.inProgress} student{summary.inProgress !== 1 ? 's' : ''} still in progress
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button onClick={handleFinalize} disabled={finalizing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 shadow-sm transition-all flex items-center gap-2">
              {finalizing
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Assigning ranks...</>
                : '🏆 Assign Final Ranks'
              }
            </button>
            <button onClick={handleRecalculate}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
              🔄 Recalculate All
            </button>
          </div>

          {/* Results table */}
          {results.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
              <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              </div>
              <p className="text-gray-500 font-medium mb-1">No results yet</p>
              <p className="text-gray-400 text-sm">Results appear after students submit their exam.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-4 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">{results.length} result{results.length !== 1 ? 's' : ''}</span>
                <div className="relative flex-1 max-w-xs">
                  <svg className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name or roll no..."
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-400 text-xs font-semibold uppercase tracking-wide">
                    <tr>
                      <SortTh k="rank" label="Rank" />
                      <SortTh k="name" label="Student" />
                      <th className="px-4 py-3 text-left whitespace-nowrap">Roll No</th>
                      <SortTh k="score" label="Score" />
                      <SortTh k="pct" label="%" />
                      <th className="px-4 py-3 text-center">✓ Correct</th>
                      <th className="px-4 py-3 text-center">✗ Wrong</th>
                      <th className="px-4 py-3 text-center">Skipped</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Submitted</th>
                      <th className="px-4 py-3 text-center">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sorted.map(r => {
                      const rankIcon = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : null;
                      const pctColor = r.percentage >= 60 ? 'text-green-600' : r.percentage >= 40 ? 'text-amber-600' : 'text-red-500';
                      return (
                        <tr key={r.rollNumber + r.studentName} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-center font-bold">
                            {rankIcon
                              ? <span className="text-lg">{rankIcon}</span>
                              : <span className="text-gray-400 text-xs">#{r.rank}</span>
                            }
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold shrink-0">
                                {(r.studentName ?? '?').charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-gray-800 text-sm">{r.studentName ?? '—'}</p>
                                {r.isAutoSubmitted && <p className="text-[10px] text-amber-500">⏰ auto-submitted</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-gray-400 text-xs">{r.rollNumber ?? '—'}</td>
                          <td className="px-4 py-3 text-center font-bold text-gray-800">{r.finalScore}<span className="text-gray-300 font-normal">/{exam?.totalMarks}</span></td>
                          <td className={`px-4 py-3 text-center font-bold ${pctColor}`}>{r.percentage.toFixed(1)}%</td>
                          <td className="px-4 py-3 text-center text-green-600 font-semibold">{r.correctCount}</td>
                          <td className="px-4 py-3 text-center text-red-500 font-semibold">{r.wrongCount}</td>
                          <td className="px-4 py-3 text-center text-gray-400">{r.skippedCount}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-400">
                            {r.submittedAt
                              ? new Date(r.submittedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {r.answerKeyUrl
                              ? <a href={r.answerKeyUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold underline underline-offset-2">PDF</a>
                              : <span className="text-gray-200">—</span>
                            }
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
