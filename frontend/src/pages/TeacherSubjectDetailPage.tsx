import { useState, useEffect, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';

interface SubSubject {
  id: string;
  name: string;
  description?: string;
  order: number;
  _count?: { chapters: number };
}

interface Chapter {
  id: string;
  name: string;
  description?: string;
  order: number;
  _count?: { questions: number };
}

interface SubjectDetail {
  id: string;
  name: string;
  description?: string;
  class?: { id: string; name: string };
}

const COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-teal-500', 'bg-green-500', 'bg-orange-500'];
const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all';

export default function TeacherSubjectDetailPage() {
  const { classId, subjectId } = useParams<{ classId?: string; subjectId: string }>();

  const [subject, setSubject] = useState<SubjectDetail | null>(null);
  const [subSubjects, setSubSubjects] = useState<SubSubject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]); // direct chapters (no sub-subject)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // which tab: 'sub-subjects' | 'chapters'
  const [tab, setTab] = useState<'sub-subjects' | 'chapters'>('sub-subjects');

  // create sub-subject
  const [showSSForm, setShowSSForm] = useState(false);
  const [ssForm, setSsForm] = useState({ name: '', description: '' });
  const [ssSaving, setSsSaving] = useState(false);
  const [ssSaveError, setSsSaveError] = useState('');

  // edit sub-subject
  const [editingSSId, setEditingSSId] = useState<string | null>(null);
  const [editSS, setEditSS] = useState({ name: '', description: '' });
  const [editSSSaving, setEditSSSaving] = useState(false);
  const [editSSError, setEditSSError] = useState('');

  // delete sub-subject
  const [confirmDeleteSSId, setConfirmDeleteSSId] = useState<string | null>(null);
  const [deletingSSId, setDeletingSSId] = useState<string | null>(null);

  // create direct chapter
  const [showChForm, setShowChForm] = useState(false);
  const [chForm, setChForm] = useState({ name: '', description: '' });
  const [chSaving, setChSaving] = useState(false);
  const [chSaveError, setChSaveError] = useState('');
  const [newlyCreatedChId, setNewlyCreatedChId] = useState<string | null>(null);

  // edit chapter
  const [editingChId, setEditingChId] = useState<string | null>(null);
  const [editCh, setEditCh] = useState({ name: '', description: '' });
  const [editChSaving, setEditChSaving] = useState(false);
  const [editChError, setEditChError] = useState('');
  const [confirmDeactivateChId, setConfirmDeactivateChId] = useState<string | null>(null);
  const [deactivatingChId, setDeactivatingChId] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchAll = async () => {
    if (!subjectId) return;
    try {
      setLoading(true); setError('');
      const [subRes, ssRes, chRes] = await Promise.all([
        api.get(`/subjects/${subjectId}`),
        api.get(`/sub-subjects?subject_id=${subjectId}`),
        api.get(`/chapters?subject_id=${subjectId}`),
      ]);

      setSubject(subRes.data?.data ?? null);
      const ssList: SubSubject[] = subRes.data?.data?.subSubjects ?? ssRes.data?.data?.subSubjects ?? [];
      setSubSubjects(Array.isArray(ssList) ? ssList : []);

      // Only show chapters that have NO sub-subject (direct chapters)
      const allChapters: Chapter[] = chRes.data?.data?.chapters ?? [];
      setChapters(allChapters.filter((c: Chapter & { sub_subject_id?: string | null; subSubjectId?: string | null }) =>
        !c.sub_subject_id && !c.subSubjectId
      ));
    } catch { setError('Failed to load subject.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [subjectId]);

  // ── Sub-subject CRUD ──

  const handleCreateSS = async (e: FormEvent) => {
    e.preventDefault();
    if (!ssForm.name.trim()) { setSsSaveError('Name is required.'); return; }
    setSsSaving(true); setSsSaveError('');
    try {
      await api.post('/sub-subjects', {
        subject_id: subjectId,
        name: ssForm.name.trim(),
        description: ssForm.description.trim(),
      });
      showToast('Sub-subject created!');
      setSsForm({ name: '', description: '' });
      setShowSSForm(false);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setSsSaveError(msg ?? 'Failed to create sub-subject.');
    } finally { setSsSaving(false); }
  };

  const handleSaveEditSS = async (id: string) => {
    if (!editSS.name.trim()) { setEditSSError('Name is required.'); return; }
    setEditSSSaving(true); setEditSSError('');
    try {
      await api.put(`/sub-subjects/${id}`, {
        name: editSS.name.trim(),
        description: editSS.description.trim(),
      });
      showToast('Updated!');
      setEditingSSId(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setEditSSError(msg ?? 'Failed to update.');
    } finally { setEditSSSaving(false); }
  };

  const handleDeleteSS = async (id: string) => {
    setDeletingSSId(id);
    try {
      await api.delete(`/sub-subjects/${id}`);
      showToast('Sub-subject deactivated.');
      setConfirmDeleteSSId(null);
      setSubSubjects(prev => prev.filter(s => s.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      showToast(msg ?? 'Failed to deactivate.');
      setConfirmDeleteSSId(null);
    } finally { setDeletingSSId(null); }
  };

  // ── Direct Chapter CRUD ──

  const handleCreateCh = async (e: FormEvent) => {
    e.preventDefault();
    if (!chForm.name.trim()) {
      setChSaveError('Name is required.'); return;
    }
    setChSaving(true); setChSaveError('');
    try {
      const res = await api.post('/chapters', {
        subject_id: subjectId,
        name: chForm.name.trim(),
        description: chForm.description.trim(),
      });
      const createdId = res.data?.data?.id;
      setNewlyCreatedChId(createdId ?? null);
      showToast('Chapter created!');
      setChForm({ name: '', description: '' });
      setShowChForm(false);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })
        ?.response?.data?.error?.message
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setChSaveError(msg ?? 'Failed to create chapter.');
    } finally { setChSaving(false); }
  };

  const handleSaveEditCh = async (id: string) => {
    if (!editCh.name.trim()) { setEditChError('Name is required.'); return; }
    setEditChSaving(true); setEditChError('');
    try {
      await api.put(`/chapters/${id}`, {
        name: editCh.name.trim(),
        description: editCh.description.trim(),
      });
      showToast('Chapter updated!');
      setEditingChId(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setEditChError(msg ?? 'Failed to update.');
    } finally { setEditChSaving(false); }
  };

  const handleDeactivateCh = async (id: string) => {
    setDeactivatingChId(id);
    try {
      await api.delete(`/chapters/${id}`);
      showToast('Chapter deactivated.');
      setConfirmDeactivateChId(null);
      setChapters(prev => prev.filter(c => c.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      showToast(msg ?? 'Failed to deactivate.');
      setConfirmDeactivateChId(null);
    } finally { setDeactivatingChId(null); }
  };

  const backPath = classId ? `/teacher/classes/${classId}` : '/teacher/subjects';
  const resolvedClassId = classId ?? subject?.class?.id;

  return (
    <TeacherShell
      title={subject?.name ?? 'Subject'}
      subtitle={subject?.class?.name ? `${subject.class.name} · Sub-subjects & Chapters` : 'Sub-subjects & Chapters'}
      action={
        <div className="flex items-center gap-2">
          <Link to={backPath} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
            ← Back
          </Link>
          {tab === 'sub-subjects' ? (
            <button onClick={() => { setShowSSForm(v => !v); setSsSaveError(''); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showSSForm ? 'bg-gray-100 text-gray-700' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
              {showSSForm ? 'Cancel' : '+ Add Sub-subject'}
            </button>
          ) : (
            <button onClick={() => { setShowChForm(v => !v); setChSaveError(''); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showChForm ? 'bg-gray-100 text-gray-700' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
              {showChForm ? 'Cancel' : '+ Add Chapter'}
            </button>
          )}
        </div>
      }
    >
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          {toast}
        </div>
      )}

      <div className="max-w-4xl space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
          <Link to="/teacher/classes" className="hover:text-indigo-600 transition-colors">Classes</Link>
          {subject?.class && (
            <>
              <span>/</span>
              <Link to={`/teacher/classes/${resolvedClassId}`} className="hover:text-indigo-600 transition-colors">{subject.class.name}</Link>
            </>
          )}
          <span>/</span>
          <span className="text-gray-700 font-medium">{subject?.name}</span>
        </div>

        {/* Info banner explaining the two flows */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3 text-sm text-indigo-700 flex gap-3 items-start">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          <div>
            <span className="font-semibold">Two flows supported:</span>
            {' '}<span className="font-medium">3-level</span> (Subject → Chapter) or <span className="font-medium">4-level</span> (Subject → Sub-subject → Chapter).
            Use <em>Sub-subjects</em> tab for SAT, MAT, etc. under a subject, or <em>Direct Chapters</em> to add chapters straight to this subject.
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          <button onClick={() => setTab('sub-subjects')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'sub-subjects' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Sub-subjects
            {subSubjects.length > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{subSubjects.length}</span>}
          </button>
          <button onClick={() => setTab('chapters')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'chapters' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            Direct Chapters
            {chapters.length > 0 && <span className="ml-1.5 bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{chapters.length}</span>}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="text-center">
              <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : tab === 'sub-subjects' ? (
          <>
            {/* Create sub-subject form */}
            {showSSForm && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
                  <h2 className="text-sm font-semibold text-indigo-800">New Sub-subject in {subject?.name}</h2>
                  <p className="text-indigo-500 text-xs mt-0.5">e.g. SAT, MAT, History, Science</p>
                </div>
                <form onSubmit={handleCreateSS} className="p-6 space-y-4">
                  {ssSaveError && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      {ssSaveError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name <span className="text-red-500">*</span></label>
                      <input type="text" value={ssForm.name} onChange={e => setSsForm(f => ({ ...f, name: e.target.value }))} autoFocus
                        placeholder="e.g. SAT, MAT, Science, History"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input type="text" value={ssForm.description} onChange={e => setSsForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Brief description"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button type="submit" disabled={ssSaving}
                      className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-sm">
                      {ssSaving ? 'Creating...' : 'Create Sub-subject'}
                    </button>
                    <button type="button" onClick={() => { setShowSSForm(false); setSsSaveError(''); }}
                      className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {subSubjects.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                </div>
                <p className="text-gray-600 font-semibold mb-1">No sub-subjects yet</p>
                <p className="text-gray-400 text-sm mb-5">For NMMS: add SAT, MAT. For Class 10: add History, Science, etc.</p>
                <button onClick={() => setShowSSForm(true)}
                  className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                  + Add First Sub-subject
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-400 font-medium">{subSubjects.length} sub-subject{subSubjects.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {subSubjects.map((ss, idx) => (
                    <div key={ss.id}>
                      {editingSSId === ss.id ? (
                        <div className="px-6 py-4 bg-indigo-50 border-l-4 border-indigo-400">
                          {editSSError && (
                            <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                              <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                              {editSSError}
                            </div>
                          )}
                          <div className="grid grid-cols-1 gap-3 mb-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                              <input type="text" value={editSS.name} onChange={e => setEditSS(s => ({ ...s, name: e.target.value }))} className={inputCls} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                              <input type="text" value={editSS.description} onChange={e => setEditSS(s => ({ ...s, description: e.target.value }))} placeholder="Optional" className={inputCls} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEditSS(ss.id)} disabled={editSSSaving}
                              className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all">
                              {editSSSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => setEditingSSId(null)}
                              className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : confirmDeleteSSId === ss.id ? (
                        <div className="px-6 py-4 bg-red-50 border-l-4 border-red-400 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-red-800">Deactivate "{ss.name}"?</p>
                            <p className="text-xs text-red-600 mt-0.5">Must have no active chapters first.</p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleDeleteSS(ss.id)} disabled={deletingSSId === ss.id}
                              className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-60 transition-all">
                              {deletingSSId === ss.id ? 'Deactivating...' : 'Yes, Deactivate'}
                            </button>
                            <button onClick={() => setConfirmDeleteSSId(null)}
                              className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${COLORS[idx % COLORS.length]}`}>
                            {ss.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{ss.name}</p>
                            {ss.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{ss.description}</p>}
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full mt-1 inline-block">
                              {ss._count?.chapters ?? 0} chapter{(ss._count?.chapters ?? 0) !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link
                              to={resolvedClassId
                                ? `/teacher/classes/${resolvedClassId}/subjects/${subjectId}/sub-subjects/${ss.id}`
                                : `/teacher/subjects/${subjectId}/sub-subjects/${ss.id}`}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium">
                              Chapters →
                            </Link>
                            <button onClick={() => { setEditingSSId(ss.id); setEditSS({ name: ss.name, description: ss.description ?? '' }); setEditSSError(''); setConfirmDeleteSSId(null); }}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                              Edit
                            </button>
                            <button onClick={() => { setConfirmDeleteSSId(ss.id); setEditingSSId(null); }}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all font-medium flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Direct chapters form */}
            {showChForm && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
                  <h2 className="text-sm font-semibold text-indigo-800">New Chapter directly in {subject?.name}</h2>
                </div>
                <form onSubmit={handleCreateCh} className="p-6">
                  {chSaveError && (
                    <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      {chSaveError}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Chapter Name <span className="text-red-500">*</span></label>
                      <input type="text" value={chForm.name} onChange={e => setChForm(f => ({ ...f, name: e.target.value }))} autoFocus
                        placeholder="e.g. Chapter 1: Motion"
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea value={chForm.description} onChange={e => setChForm(f => ({ ...f, description: e.target.value }))} rows={2}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none transition-all" />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-5">
                    <button type="submit" disabled={chSaving}
                      className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-sm">
                      {chSaving ? 'Creating...' : 'Create Chapter'}
                    </button>
                    <button type="button" onClick={() => { setShowChForm(false); setChSaveError(''); }}
                      className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {newlyCreatedChId && (
              <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-green-800">Chapter created!</p>
                  <p className="text-green-600 text-xs mt-0.5">Now add questions to it via bulk upload or manual entry.</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link to={`/teacher/upload?chapter_id=${newlyCreatedChId}`}
                    className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-all">
                    + Add Questions →
                  </Link>
                  <button onClick={() => setNewlyCreatedChId(null)} className="px-3 py-2 bg-white border border-gray-200 text-gray-500 rounded-xl text-sm hover:bg-gray-50 transition-all">Dismiss</button>
                </div>
              </div>
            )}

            {chapters.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
                <p className="text-gray-600 font-semibold mb-1">No direct chapters yet</p>
                <p className="text-gray-400 text-sm mb-5">Add chapters directly to this subject (without a sub-subject).</p>
                <button onClick={() => setShowChForm(true)}
                  className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
                  + Add First Chapter
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-400 font-medium">{chapters.length} chapter{chapters.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {chapters.map(ch => (
                    <div key={ch.id}>
                      {editingChId === ch.id ? (
                        <div className="px-6 py-4 bg-indigo-50 border-l-4 border-indigo-400">
                          {editChError && <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editChError}</div>}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Name</label><input type="text" value={editCh.name} onChange={e => setEditCh(s => ({ ...s, name: e.target.value }))} className={inputCls} /></div>
                            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Description</label><input type="text" value={editCh.description} onChange={e => setEditCh(s => ({ ...s, description: e.target.value }))} className={inputCls} /></div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleSaveEditCh(ch.id)} disabled={editChSaving} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all">{editChSaving ? 'Saving...' : 'Save'}</button>
                            <button onClick={() => setEditingChId(null)} className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">Cancel</button>
                          </div>
                        </div>
                      ) : confirmDeactivateChId === ch.id ? (
                        <div className="px-6 py-4 bg-red-50 border-l-4 border-red-400 flex items-center justify-between gap-4">
                          <div><p className="text-sm font-semibold text-red-800">Deactivate "{ch.name}"?</p><p className="text-xs text-red-600 mt-0.5">Questions are preserved.</p></div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleDeactivateCh(ch.id)} disabled={deactivatingChId === ch.id} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-60 transition-all">{deactivatingChId === ch.id ? 'Deactivating...' : 'Yes, Deactivate'}</button>
                            <button onClick={() => setConfirmDeactivateChId(null)} className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 text-xs font-bold shrink-0">{ch.order}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{ch.name}</p>
                            <div className="flex flex-wrap gap-3 mt-1">
                              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{ch._count?.questions ?? 0} questions</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Link to={`/teacher/upload?chapter_id=${ch.id}`}
                              className="px-3 py-1.5 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all font-medium">
                              + Questions
                            </Link>
                            <button onClick={() => { setEditingChId(ch.id); setEditCh({ name: ch.name, description: ch.description ?? '' }); setEditChError(''); setConfirmDeactivateChId(null); }}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                              Edit
                            </button>
                            <button onClick={() => { setConfirmDeactivateChId(ch.id); setEditingChId(null); }}
                              className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all font-medium flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                              Deactivate
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TeacherShell>
  );
}
