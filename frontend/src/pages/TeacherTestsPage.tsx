import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';
import { useConfirm } from '../components/ui/Confirm';

interface Subject { id: string; name: string; }
interface Chapter {
  id: string; name: string; subjectId: string;
  totalMarks: number; timeMinutes: number;
  questionCounts?: { mcq: number; subjective: number; total: number };
}
interface QuickTest {
  id: string; code: string; title: string; timeMinutes: number;
  totalMarks: number; shuffleQ: boolean; isActive: boolean;
  createdAt: string; expiresAt: string | null; chapterIds: string[];
  _count?: { attempts: number };
}

type View = 'list' | 'create';

export default function TeacherTestsPage() {
  const { confirm } = useConfirm();
  const [view, setView] = useState<View>('list');

  const [tests, setTests] = useState<QuickTest[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [timeOverride, setTimeOverride] = useState('');
  const [marksOverride, setMarksOverride] = useState('');
  const [shuffleQ, setShuffleQ] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdTest, setCreatedTest] = useState<QuickTest | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchTests = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await api.get('/quick-tests');
      setTests(res.data?.data?.tests ?? []);
    } catch (err: any) {
      // Don't silently show "no tests" on a network error — that lies to the user.
      setTests([]);
      setListError(err?.response?.data?.error?.message ?? "Couldn't load tests. Check your connection and try again.");
    }
    finally { setListLoading(false); }
  }, []);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  useEffect(() => {
    if (view !== 'create') return;
    api.get('/subjects').then(res => {
      const list = res.data?.data?.subjects ?? res.data?.subjects ?? res.data ?? [];
      setSubjects(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, [view]);

  useEffect(() => {
    if (!selectedSubject) { setChapters([]); return; }
    api.get(`/chapters?subject_id=${selectedSubject}`).then(res => {
      const raw = res.data?.data?.chapters ?? [];
      setChapters(Array.isArray(raw) ? raw : []);
      setSelectedChapterIds(new Set());
    }).catch(() => setChapters([]));
  }, [selectedSubject]);

  function toggleChapter(id: string) {
    setSelectedChapterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError('');
    if (!title.trim()) { setCreateError('Please enter a test title.'); return; }
    if (selectedChapterIds.size === 0) { setCreateError('Select at least one chapter.'); return; }
    setCreating(true);
    try {
      const res = await api.post('/quick-tests', {
        title: title.trim(),
        chapterIds: [...selectedChapterIds],
        timeMinutes: timeOverride ? Number(timeOverride) : undefined,
        totalMarks: marksOverride ? Number(marksOverride) : undefined,
        shuffleQ,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setCreatedTest(res.data?.data);
      await fetchTests();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setCreateError(e?.response?.data?.error?.message ?? 'Failed to create test.');
    } finally { setCreating(false); }
  }

  function resetCreate() {
    setTitle(''); setTimeOverride(''); setMarksOverride('');
    setShuffleQ(false); setExpiresAt(''); setSelectedSubject('');
    setSelectedChapterIds(new Set()); setCreatedTest(null); setCreateError('');
  }

  async function deactivateTest(id: string) {
    const ok = await confirm({
      title: 'Deactivate test?',
      message: 'Students will no longer be able to access it with the code.',
      confirmLabel: 'Deactivate',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/quick-tests/${id}`);
      setTests(prev => prev.map(t => t.id === id ? { ...t, isActive: false } : t));
      showToast('Test deactivated.');
    } catch { showToast('Failed to deactivate test.'); }
  }

  function copyCode(code: string) {
    const url = `${window.location.origin}/test/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  const testUrl = (code: string) => `${window.location.origin}/test/${code}`;

  return (
    <TeacherShell
      title="Quick Tests"
      subtitle="Create & share interactive tests with a simple code"
      action={
        <button
          onClick={() => { setView(v => v === 'create' ? 'list' : 'create'); resetCreate(); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${view === 'create' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
        >
          {view === 'create' ? '← My Tests' : '+ Create Test'}
        </button>
      }
    >
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium">{toast}</div>
      )}

      <div className="max-w-4xl space-y-5">
        {/* CREATE VIEW */}
        {view === 'create' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
              <h2 className="text-sm font-semibold text-indigo-800">New Quick Test</h2>
              <p className="text-indigo-600 text-xs mt-0.5">Students access via a 6-character code — no account needed</p>
            </div>

            {createdTest ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-1">Test Created!</h3>
                <p className="text-gray-500 text-sm mb-8">Share the code or link below with your students</p>

                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl px-10 py-6 inline-block mx-auto mb-6">
                  <p className="text-xs text-indigo-500 font-semibold uppercase tracking-widest mb-2">Test Code</p>
                  <p className="text-6xl font-extrabold text-indigo-700 tracking-widest font-mono">{createdTest.code}</p>
                </div>

                <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3 mb-6 max-w-md mx-auto">
                  <span className="text-gray-400 text-xs truncate flex-1">{testUrl(createdTest.code)}</span>
                  <button onClick={() => copyCode(createdTest.code)}
                    className="bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 whitespace-nowrap transition-colors">
                    {copiedCode === createdTest.code ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto mb-8">
                  {[
                    { label: 'Minutes', value: createdTest.timeMinutes },
                    { label: 'Marks', value: createdTest.totalMarks },
                    { label: 'Chapters', value: createdTest.chapterIds.length },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold text-gray-800">{s.value}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 justify-center">
                  <button onClick={() => { resetCreate(); setView('list'); }}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                    View All Tests
                  </button>
                  <button onClick={resetCreate}
                    className="bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-all">
                    Create Another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="p-6 space-y-5">
                {createError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                    {createError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Test Title <span className="text-red-500">*</span></label>
                  <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Geography Unit 1 — Quick Test"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Subject <span className="text-red-500">*</span></label>
                  <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all">
                    <option value="">— Choose a subject —</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {selectedSubject && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-semibold text-gray-700">Select Chapters <span className="text-red-500">*</span></label>
                      {chapters.filter(c => (c.questionCounts?.mcq ?? 0) > 0).length > 1 && (
                        <button type="button" onClick={() => setSelectedChapterIds(new Set(chapters.filter(c => (c.questionCounts?.mcq ?? 0) > 0).map(c => c.id)))}
                          className="text-indigo-600 text-xs hover:underline font-medium">Select All MCQ Chapters</button>
                      )}
                    </div>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                      Quick tests are auto-graded, so only <strong>MCQ questions</strong> can be included. Chapters with no MCQ questions are disabled.
                    </p>
                    {chapters.length === 0 ? (
                      <p className="text-gray-400 text-sm border border-gray-200 rounded-xl p-4 text-center">No chapters found for this subject.</p>
                    ) : (
                      <div className="border border-gray-200 rounded-xl divide-y divide-gray-50 max-h-56 overflow-y-auto">
                        {chapters.map(ch => {
                          const mcq = ch.questionCounts?.mcq ?? 0;
                          const subj = ch.questionCounts?.subjective ?? 0;
                          const disabled = mcq === 0;
                          return (
                            <label key={ch.id}
                              className={`flex items-center gap-3 px-4 py-3 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-indigo-50'}`}>
                              <input type="checkbox" disabled={disabled}
                                checked={!disabled && selectedChapterIds.has(ch.id)}
                                onChange={() => !disabled && toggleChapter(ch.id)}
                                className="accent-indigo-600 w-4 h-4 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{ch.name}</p>
                                <p className="text-xs text-gray-400">
                                  <span className={mcq > 0 ? 'text-blue-600 font-medium' : ''}>{mcq} MCQ</span>
                                  {subj > 0 && <span> · <span className="text-amber-600">{subj} subjective</span></span>}
                                  {disabled && <span className="ml-2 text-red-500">— no MCQ available</span>}
                                </p>
                              </div>
                              {!disabled && selectedChapterIds.has(ch.id) && (
                                <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {selectedChapterIds.size > 0 && (
                      <p className="text-indigo-600 text-xs mt-1.5 font-medium">{selectedChapterIds.size} chapter{selectedChapterIds.size !== 1 ? 's' : ''} selected</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Time (minutes) <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="number" min="1" value={timeOverride} onChange={e => setTimeOverride(e.target.value)}
                      placeholder="Auto from chapters"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Total Marks <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input type="number" min="1" value={marksOverride} onChange={e => setMarksOverride(e.target.value)}
                      placeholder="Auto from chapters"
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input type="checkbox" checked={shuffleQ} onChange={e => setShuffleQ(e.target.checked)} className="accent-indigo-600 w-4 h-4" />
                  <span className="text-sm text-gray-700">Shuffle questions for each student</span>
                </label>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Expiry Date & Time <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
                  <p className="text-gray-400 text-xs mt-1">Leave blank for no expiry</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="submit" disabled={creating}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-sm flex items-center gap-2">
                    {creating
                      ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Creating...</>
                      : 'Create Test & Get Code'
                    }
                  </button>
                  <button type="button" onClick={() => { setView('list'); resetCreate(); }}
                    className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* LIST VIEW */}
        {view === 'list' && (
          listLoading ? (
            <div className="flex justify-center py-24">
              <div className="text-center">
                <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-400 text-sm">Loading tests...</p>
              </div>
            </div>
          ) : listError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 flex items-start gap-4">
              <div className="text-2xl">⚠️</div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-800">Couldn't load tests</p>
                <p className="text-sm text-red-700 mt-0.5">{listError}</p>
              </div>
              <button onClick={fetchTests}
                className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-100">
                Retry
              </button>
            </div>
          ) : tests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              </div>
              <p className="text-gray-500 font-medium mb-1">No Quick Tests Yet</p>
              <p className="text-gray-400 text-sm mb-5">Create your first test and share the code with students — no account needed!</p>
              <button onClick={() => setView('create')}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                + Create Your First Test
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {tests.map(test => (
                <div key={test.id}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${test.isActive ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl px-5 py-3 text-center shrink-0 w-fit">
                      <p className="text-xs text-indigo-500 font-semibold uppercase tracking-widest">Code</p>
                      <p className="text-2xl font-extrabold text-indigo-700 tracking-widest font-mono">{test.code}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-gray-800">{test.title}</h3>
                        {!test.isActive && (
                          <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full font-medium">Deactivated</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                        <span>{test.timeMinutes} min</span>
                        <span>{test.totalMarks} marks</span>
                        <span>{test.chapterIds.length} chapter{test.chapterIds.length !== 1 ? 's' : ''}</span>
                        <span>{test._count?.attempts ?? 0} attempt{(test._count?.attempts ?? 0) !== 1 ? 's' : ''}</span>
                        {test.shuffleQ && <span className="text-indigo-400">Shuffled</span>}
                        {test.expiresAt && (
                          <span className={new Date(test.expiresAt) < new Date() ? 'text-red-400' : ''}>
                            Expires {new Date(test.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-300 mt-1">Created {new Date(test.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button onClick={() => copyCode(test.code)}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors">
                        {copiedCode === test.code ? 'Copied!' : 'Copy Link'}
                      </button>
                      {(test._count?.attempts ?? 0) > 0 && (
                        <Link to={`/teacher/tests/${test.id}/results`}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                          Results ({test._count?.attempts})
                        </Link>
                      )}
                      {test.isActive && (
                        <button onClick={() => deactivateTest(test.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>
                  {test.isActive && (
                    <div className="bg-gray-50 border-t border-gray-100 px-5 py-2.5 flex items-center gap-2">
                      <span className="text-xs text-gray-400">Student link:</span>
                      <a href={testUrl(test.code)} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-indigo-600 hover:underline truncate">{testUrl(test.code)}</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </TeacherShell>
  );
}
