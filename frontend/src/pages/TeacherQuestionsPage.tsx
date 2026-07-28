import { useState, useEffect, useCallback, useRef } from 'react';
import TeacherShell from '../components/TeacherShell';
import api from '../api';
import { useToast } from '../components/ui/Toast';

interface ClassItem { id: string; name: string; }
interface SubjectItem { id: string; name: string; }
interface ChapterItem { id: string; name: string; }

interface Question {
  id: string;
  text: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctOption: 'A' | 'B' | 'C' | 'D';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marksWeight: number;
  yearTag: string | null;
  tags: string[];
  isActive: boolean;
  questionImageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  optionCImageUrl: string | null;
  optionDImageUrl: string | null;
  subject?: { id: string; name: string };
  chapter?: { id: string; name: string };
  createdAt: string;
}

interface EditDraft {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  marksWeight: string;
  yearTag: string;
  tags: string;
}

type DiffFilter = '' | 'EASY' | 'MEDIUM' | 'HARD';

const DIFF_COLORS: Record<string, string> = {
  EASY: 'bg-green-50 text-green-700 border-green-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  HARD: 'bg-red-50 text-red-700 border-red-200',
};

const OPT_LABELS = ['A', 'B', 'C', 'D'] as const;

function integrityIssues(q: Question): string[] {
  const issues: string[] = [];
  if (!q.text?.trim()) issues.push('Missing question text');
  if (!q.optionA?.trim() && !q.optionAImageUrl) issues.push('Option A is empty');
  if (!q.optionB?.trim() && !q.optionBImageUrl) issues.push('Option B is empty');
  if (!q.optionC?.trim() && !q.optionCImageUrl) issues.push('Option C is empty');
  if (!q.optionD?.trim() && !q.optionDImageUrl) issues.push('Option D is empty');
  if (!q.correctOption) issues.push('No correct answer set');
  return issues;
}

function toDraft(q: Question): EditDraft {
  return {
    text: q.text ?? '',
    optionA: q.optionA ?? '',
    optionB: q.optionB ?? '',
    optionC: q.optionC ?? '',
    optionD: q.optionD ?? '',
    correctOption: q.correctOption ?? 'A',
    difficulty: q.difficulty ?? 'EASY',
    marksWeight: String(q.marksWeight ?? 1),
    yearTag: q.yearTag ?? '',
    tags: (q.tags ?? []).join('; '),
  };
}

// ── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({
  q, index, onUpdated, onDeactivated,
}: {
  q: Question;
  index: number;
  onUpdated: (updated: Question) => void;
  onDeactivated: (id: string) => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft>(toDraft(q));
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const issues = integrityIssues(q);
  const isClean = issues.length === 0;

  const optionMap = {
    A: { text: q.optionA, img: q.optionAImageUrl },
    B: { text: q.optionB, img: q.optionBImageUrl },
    C: { text: q.optionC, img: q.optionCImageUrl },
    D: { text: q.optionD, img: q.optionDImageUrl },
  };

  function startEdit() {
    setDraft(toDraft(q));
    setSaveErr('');
    setEditing(true);
    setExpanded(true);
    setConfirmDel(false);
  }

  async function handleSave() {
    if (!draft.text.trim()) { setSaveErr('Question text is required.'); return; }
    if (!draft.optionA.trim()) { setSaveErr('Option A is required.'); return; }
    if (!draft.optionB.trim()) { setSaveErr('Option B is required.'); return; }
    if (!draft.optionC.trim()) { setSaveErr('Option C is required.'); return; }
    if (!draft.optionD.trim()) { setSaveErr('Option D is required.'); return; }
    setSaveErr(''); setSaving(true);
    try {
      const res = await api.put(`/questions/${q.id}`, {
        text: draft.text.trim(),
        optionA: draft.optionA.trim(),
        optionB: draft.optionB.trim(),
        optionC: draft.optionC.trim(),
        optionD: draft.optionD.trim(),
        correctOption: draft.correctOption,
        difficulty: draft.difficulty,
        marksWeight: Number(draft.marksWeight) || 1,
        yearTag: draft.yearTag.trim() || null,
        tags: draft.tags.split(';').map(t => t.trim()).filter(Boolean),
      });
      onUpdated(res.data?.data ?? { ...q, ...draft });
      setEditing(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setSaveErr(msg ?? 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  }

  async function handleDeactivate() {
    setDeleting(true);
    try {
      await api.delete(`/questions/${q.id}`);
      onDeactivated(q.id);
    } catch {
      toast.error('Failed to deactivate question.');
      setConfirmDel(false);
    } finally { setDeleting(false); }
  }

  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all bg-white';

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isClean ? 'border-gray-100' : 'border-red-200'}`}>

      {/* ── Header row (always visible) ── */}
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Index */}
        <span className="text-xs text-gray-300 font-mono mt-1 shrink-0 w-7 text-right select-none">#{index + 1}</span>

        {/* Summary — click to expand/collapse */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !editing && setExpanded(e => !e)}>
          <p className={`text-sm text-gray-800 leading-snug ${editing ? '' : 'line-clamp-2'}`}>{q.text}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {q.chapter && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{q.chapter.name}</span>}
            {q.subject && <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full">{q.subject.name}</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFF_COLORS[q.difficulty]}`}>{q.difficulty}</span>
            <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{q.marksWeight}M</span>
            {q.yearTag && <span className="text-xs bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full">{q.yearTag}</span>}
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Correct answer badge */}
          <span className="w-6 h-6 rounded-full bg-green-500 text-white text-xs font-bold flex items-center justify-center">
            {q.correctOption}
          </span>
          {/* Integrity */}
          {isClean
            ? <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            : <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><title>{issues.join(', ')}</title><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          }
          {/* Edit button */}
          {!editing && (
            <button onClick={startEdit}
              className="px-2.5 py-1 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium flex items-center gap-1 border border-transparent hover:border-indigo-100">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
              Edit
            </button>
          )}
          {/* Delete button */}
          {!editing && !confirmDel && (
            <button onClick={() => setConfirmDel(true)}
              className="px-2.5 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all border border-transparent hover:border-red-100">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          )}
          {/* Expand chevron (view mode) */}
          {!editing && (
            <button onClick={() => setExpanded(e => !e)}
              className="text-gray-300 hover:text-gray-500 transition-colors p-0.5">
              <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Delete confirm ── */}
      {confirmDel && (
        <div className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700 font-medium">Deactivate this question? It will be hidden from all tests.</p>
          <div className="flex gap-2 shrink-0">
            <button onClick={handleDeactivate} disabled={deleting}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-60 transition-all">
              {deleting ? 'Removing…' : 'Yes, Remove'}
            </button>
            <button onClick={() => setConfirmDel(false)}
              className="px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Edit form ── */}
      {editing && (
        <div className="border-t border-indigo-100 bg-indigo-50/40 px-4 py-4 space-y-3">
          {saveErr && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
              {saveErr}
            </div>
          )}

          {/* Question text */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Question Text <span className="text-red-500">*</span></label>
            <textarea value={draft.text} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
              rows={3} className={`${inputCls} resize-none`} />
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {OPT_LABELS.map(l => {
              const field = `option${l}` as keyof EditDraft;
              const isCorrect = draft.correctOption === l;
              return (
                <div key={l} className={`rounded-lg border p-2.5 transition-all ${isCorrect ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <button type="button"
                      onClick={() => setDraft(d => ({ ...d, correctOption: l }))}
                      className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition-all shrink-0 ${
                        isCorrect ? 'bg-green-500 text-white ring-2 ring-green-300' : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
                      }`}>
                      {l}
                    </button>
                    <span className="text-xs font-semibold text-gray-600">Option {l} {isCorrect && <span className="text-green-600">(Correct)</span>}</span>
                  </div>
                  <input type="text"
                    value={draft[field] as string}
                    onChange={e => setDraft(d => ({ ...d, [field]: e.target.value }))}
                    placeholder={`Option ${l} text`}
                    className={`w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-all ${
                      isCorrect ? 'border-green-200 focus:ring-green-300 bg-white' : 'border-gray-200 focus:ring-indigo-300 bg-white'
                    }`} />
                </div>
              );
            })}
          </div>

          {/* Meta row */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Difficulty</label>
              <select value={draft.difficulty} onChange={e => setDraft(d => ({ ...d, difficulty: e.target.value as Question['difficulty'] }))}
                className={inputCls}>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Marks</label>
              <input type="number" min="1" value={draft.marksWeight}
                onChange={e => setDraft(d => ({ ...d, marksWeight: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Year Tag</label>
              <input type="text" value={draft.yearTag} placeholder="e.g. 2023"
                onChange={e => setDraft(d => ({ ...d, yearTag: e.target.value }))}
                className={inputCls} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tags <span className="text-gray-400 font-normal">(semicolon-separated)</span></label>
            <input type="text" value={draft.tags} placeholder="e.g. motion; force; newton"
              onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))}
              className={inputCls} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all flex items-center gap-2">
              {saving
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                : <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                    Save Changes
                  </>
              }
            </button>
            <button onClick={() => { setEditing(false); setSaveErr(''); }}
              className="px-4 py-2 bg-white text-gray-600 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── View mode expanded ── */}
      {expanded && !editing && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-2">
          {/* Integrity warnings */}
          {!isClean && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs font-semibold text-red-700 mb-0.5">Issues found:</p>
              <ul className="text-xs text-red-600 space-y-0.5">
                {issues.map(i => <li key={i}>• {i}</li>)}
              </ul>
            </div>
          )}
          {q.questionImageUrl && (
            <img src={q.questionImageUrl} alt="Question" className="max-h-40 rounded-lg object-contain border border-gray-100" />
          )}
          <p className="text-sm text-gray-800 leading-relaxed">{q.text}</p>
          <div className="space-y-1.5">
            {OPT_LABELS.map(l => {
              const opt = optionMap[l];
              const isCorrect = q.correctOption === l;
              return (
                <div key={l} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-sm ${
                  isCorrect ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-100'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                    isCorrect ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>{l}</span>
                  <div className="flex-1 min-w-0">
                    {opt.text && <p className={`leading-snug ${isCorrect ? 'font-semibold text-green-800' : 'text-gray-700'}`}>{opt.text}</p>}
                    {opt.img && <img src={opt.img} alt={`Option ${l}`} className="mt-1 max-h-20 rounded object-contain" />}
                    {!opt.text && !opt.img && <p className="text-gray-300 italic text-xs">Empty</p>}
                  </div>
                  {isCorrect && <svg className="w-4 h-4 text-green-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>}
                </div>
              );
            })}
          </div>
          {q.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {q.tags.map(t => <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── BulkAnswerPanel ───────────────────────────────────────────────────────────

function BulkAnswerPanel({ questions, onBulkSaved }: {
  questions: Question[];
  onBulkSaved: (updated: Question[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: number } | null>(null);

  useEffect(() => {
    const init: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
    questions.forEach(q => { init[q.id] = q.correctOption; });
    setAnswers(init);
    setResult(null);
  }, [questions]);

  const changed = questions.filter(q => answers[q.id] && answers[q.id] !== q.correctOption);

  async function handleSaveAll() {
    if (changed.length === 0) return;
    setSaving(true); setResult(null);
    let saved = 0, failed = 0;
    await Promise.all(
      changed.map(async q => {
        try {
          await api.put(`/questions/${q.id}`, { correctOption: answers[q.id] });
          saved++;
        } catch { failed++; }
      })
    );
    setSaving(false);
    setResult({ saved, failed });
    if (saved > 0) {
      const updatedMap = new Map(changed.map(q => [q.id, { ...q, correctOption: answers[q.id] }]));
      onBulkSaved(questions.map(q => updatedMap.get(q.id) ?? q));
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-800">Bulk Answer Key Editor</p>
            <p className="text-xs text-gray-400">Change correct answers for multiple questions at once</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {changed.length > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{changed.length} changed</span>
          )}
          <svg className={`w-4 h-4 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {result && (
            <div className={`px-5 py-3 text-sm font-medium flex items-center gap-2 ${result.failed > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              {result.saved} answer{result.saved !== 1 ? 's' : ''} updated{result.failed > 0 ? `, ${result.failed} failed` : ' successfully'}.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 text-left w-10">#</th>
                  <th className="px-4 py-2.5 text-left">Question</th>
                  <th className="px-4 py-2.5 text-center w-32">Correct Answer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {questions.map((q, i) => {
                  const curr = answers[q.id] ?? q.correctOption;
                  const dirty = curr !== q.correctOption;
                  return (
                    <tr key={q.id} className={dirty ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                        <p className="line-clamp-1">{q.text}</p>
                        {dirty && (
                          <p className="text-xs text-amber-600 mt-0.5">
                            Was: <strong>{q.correctOption}</strong> → Now: <strong>{curr}</strong>
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {OPT_LABELS.map(l => (
                            <button key={l} type="button"
                              onClick={() => setAnswers(prev => ({ ...prev, [q.id]: l }))}
                              className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${
                                curr === l
                                  ? 'bg-green-500 text-white ring-2 ring-green-300 scale-110'
                                  : 'bg-gray-100 text-gray-500 hover:bg-green-100 hover:text-green-700'
                              }`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {changed.length === 0 ? 'No changes yet — click a letter to change an answer.' : `${changed.length} answer${changed.length !== 1 ? 's' : ''} will be updated.`}
            </p>
            <button onClick={handleSaveAll} disabled={saving || changed.length === 0}
              className="px-5 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2">
              {saving
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Saving…</>
                : `Save ${changed.length > 0 ? changed.length : ''} Change${changed.length !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherQuestionsPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);

  const [selClass, setSelClass] = useState('');
  const [selSubject, setSelSubject] = useState('');
  const [selChapter, setSelChapter] = useState('');
  const [selDiff, setSelDiff] = useState<DiffFilter>('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 50;

  useEffect(() => {
    api.get('/classes').then(r => setClasses(r.data?.data?.classes ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setSelSubject(''); setSelChapter(''); setSubjects([]); setChapters([]);
    if (!selClass) return;
    api.get(`/subjects?class_id=${selClass}`).then(r => setSubjects(r.data?.data?.subjects ?? [])).catch(() => {});
  }, [selClass]);

  useEffect(() => {
    setSelChapter(''); setChapters([]);
    if (!selSubject) return;
    api.get(`/chapters?subject_id=${selSubject}`).then(r => setChapters(r.data?.data?.chapters ?? [])).catch(() => {});
  }, [selSubject]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const fetchQuestions = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams();
      p.set('limit', String(LIMIT)); p.set('page', String(page));
      if (selChapter) p.set('chapter_id', selChapter);
      else if (selSubject) p.set('subject_id', selSubject);
      else if (selClass) p.set('class_id', selClass);
      if (selDiff) p.set('difficulty', selDiff);
      if (search) p.set('search', search);
      const res = await api.get(`/questions?${p}`);
      setQuestions(res.data?.data?.questions ?? []);
      setTotal(res.data?.data?.total ?? 0);
    } catch { setError('Failed to load questions.'); }
    finally { setLoading(false); }
  }, [selClass, selSubject, selChapter, selDiff, search, page]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);
  useEffect(() => { setPage(1); }, [selClass, selSubject, selChapter, selDiff, search]);

  function handleUpdated(updated: Question) {
    setQuestions(qs => qs.map(q => q.id === updated.id ? updated : q));
  }
  function handleDeactivated(id: string) {
    setQuestions(qs => qs.filter(q => q.id !== id));
    setTotal(t => t - 1);
  }
  function handleBulkSaved(updated: Question[]) {
    const map = new Map(updated.map(q => [q.id, q]));
    setQuestions(qs => qs.map(q => map.get(q.id) ?? q));
  }

  const totalPages = Math.ceil(total / LIMIT);
  const byDiff = questions.reduce((acc, q) => { acc[q.difficulty] = (acc[q.difficulty] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  const issueCount = questions.filter(q => integrityIssues(q).length > 0).length;

  const selectCls = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all';

  return (
    <TeacherShell title="Question Bank" subtitle="Browse, edit and verify all uploaded questions">
      <div className="max-w-5xl space-y-4">

        {/* ── Filters ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Class</label>
              <select value={selClass} onChange={e => setSelClass(e.target.value)} className={selectCls}>
                <option value="">All Classes</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Subject</label>
              <select value={selSubject} onChange={e => setSelSubject(e.target.value)} disabled={!selClass} className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}>
                <option value="">All Subjects</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Chapter</label>
              <select value={selChapter} onChange={e => setSelChapter(e.target.value)} disabled={!selSubject} className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}>
                <option value="">All Chapters</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Difficulty</label>
              <select value={selDiff} onChange={e => setSelDiff(e.target.value as DiffFilter)} className={selectCls}>
                <option value="">All Levels</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
          </div>
          <div className="relative">
            <svg className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            <input type="text" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search question text…"
              className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all" />
            {searchInput && (
              <button onClick={() => setSearchInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Stats bar ── */}
        {!loading && questions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-sm font-semibold text-gray-700">{total.toLocaleString()} question{total !== 1 ? 's' : ''}</span>
            <span className="text-gray-200">|</span>
            {(['EASY', 'MEDIUM', 'HARD'] as const).map(d => byDiff[d] ? (
              <span key={d} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${DIFF_COLORS[d]}`}>
                {byDiff[d]} {d.charAt(0) + d.slice(1).toLowerCase()}
              </span>
            ) : null)}
            <span className="text-gray-200">|</span>
            {issueCount > 0
              ? <span className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">{issueCount} with issues</span>
              : <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-600 border border-green-200 font-medium">All clean</span>
            }
          </div>
        )}

        {/* ── Bulk Answer Key Editor ── */}
        {!loading && questions.length > 0 && (
          <BulkAnswerPanel questions={questions} onBulkSaved={handleBulkSaved} />
        )}

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="text-center">
              <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading questions...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : questions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </div>
            <p className="text-gray-500 font-medium mb-1">No questions found</p>
            <p className="text-gray-400 text-sm">
              {selClass || selSubject || selChapter || selDiff || search ? 'Try adjusting your filters.' : 'Upload questions via the Upload Questions page.'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  index={(page - 1) * LIMIT + i}
                  onUpdated={handleUpdated}
                  onDeactivated={handleDeactivated}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">
                  Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    ← Prev
                  </button>
                  <span className="px-3 py-1.5 text-sm text-gray-600 font-medium">{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TeacherShell>
  );
}
