import { useState, useEffect, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';

interface Chapter {
  id: string;
  name: string;
  description?: string;
  order: number;
  _count?: { questions: number };
}

interface SubSubjectDetail {
  id: string;
  name: string;
  description?: string;
  subject: {
    id: string;
    name: string;
    class?: { id: string; name: string } | null;
  };
  chapters: Chapter[];
}

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all';

export default function TeacherSubSubjectDetailPage() {
  const { classId, subjectId, subSubjectId } = useParams<{
    classId?: string;
    subjectId: string;
    subSubjectId: string;
  }>();

  const [detail, setDetail] = useState<SubSubjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // create
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [newlyCreatedChId, setNewlyCreatedChId] = useState<string | null>(null);

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState({ name: '', description: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // deactivate
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchAll = async () => {
    if (!subSubjectId) return;
    try {
      setLoading(true); setError('');
      const res = await api.get(`/sub-subjects/${subSubjectId}`);
      const data = res.data?.data;
      if (!data) throw new Error('Not found');
      setDetail(data);
    } catch { setError('Failed to load sub-subject.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, [subSubjectId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setSaveError('Name is required.'); return;
    }
    setSaving(true); setSaveError('');
    try {
      const res = await api.post('/chapters', {
        subject_id: subjectId,
        sub_subject_id: subSubjectId,
        name: form.name.trim(),
        description: form.description.trim(),
      });
      const createdId = res.data?.data?.id;
      setNewlyCreatedChId(createdId ?? null);
      showToast('Chapter created!');
      setForm({ name: '', description: '' });
      setShowForm(false);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })
        ?.response?.data?.error?.message
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSaveError(msg ?? 'Failed to create chapter.');
    } finally { setSaving(false); }
  };

  const startEdit = (ch: Chapter) => {
    setEditingId(ch.id);
    setEditState({ name: ch.name, description: ch.description ?? '' });
    setEditError('');
    setConfirmDeactivateId(null);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editState.name.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/chapters/${id}`, {
        name: editState.name.trim(),
        description: editState.description.trim(),
      });
      showToast('Chapter updated!');
      setEditingId(null);
      fetchAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setEditError(msg ?? 'Failed to update.');
    } finally { setEditSaving(false); }
  };

  const handleDeactivate = async (id: string) => {
    setDeactivatingId(id);
    try {
      await api.delete(`/chapters/${id}`);
      showToast('Chapter deactivated.');
      setConfirmDeactivateId(null);
      setDetail(prev => prev ? { ...prev, chapters: prev.chapters.filter(c => c.id !== id) } : prev);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      showToast(msg ?? 'Failed to deactivate.');
      setConfirmDeactivateId(null);
    } finally { setDeactivatingId(null); }
  };

  const resolvedClassId = classId ?? detail?.subject?.class?.id;
  const backPath = resolvedClassId
    ? `/teacher/classes/${resolvedClassId}/subjects/${subjectId}`
    : `/teacher/subjects/${subjectId}`;

  const chapters = detail?.chapters ?? [];

  return (
    <TeacherShell
      title={detail?.name ?? 'Sub-subject'}
      subtitle={[detail?.subject?.class?.name, detail?.subject?.name].filter(Boolean).join(' · ') + ' · Chapters'}
      action={
        <div className="flex items-center gap-2">
          <Link to={backPath} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
            ← Back
          </Link>
          <button onClick={() => { setShowForm(v => !v); setSaveError(''); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showForm ? 'bg-gray-100 text-gray-700' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
            {showForm ? 'Cancel' : '+ Add Chapter'}
          </button>
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
          {detail?.subject?.class && (
            <>
              <span>/</span>
              <Link to={`/teacher/classes/${resolvedClassId}`} className="hover:text-indigo-600 transition-colors">{detail.subject.class.name}</Link>
            </>
          )}
          {detail?.subject && (
            <>
              <span>/</span>
              <Link to={backPath} className="hover:text-indigo-600 transition-colors">{detail.subject.name}</Link>
            </>
          )}
          <span>/</span>
          <span className="text-gray-700 font-medium">{detail?.name}</span>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
              <h2 className="text-sm font-semibold text-indigo-800">New Chapter in {detail?.name}</h2>
              <p className="text-indigo-500 text-xs mt-0.5">e.g. Ancient History, Medieval Period, Chapter 1</p>
            </div>
            <form onSubmit={handleCreate} className="p-6">
              {saveError && (
                <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Chapter Name <span className="text-red-500">*</span></label>
                  <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus
                    placeholder="e.g. Ancient History, Chapter 1: Motion"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none transition-all" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-sm">
                  {saving ? 'Creating...' : 'Create Chapter'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setSaveError(''); }}
                  className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="text-center">
              <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading chapters...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : (
          <>
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
          </>
        )}
        {!loading && !error && chapters.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <p className="text-gray-600 font-semibold mb-1">No chapters yet</p>
            <p className="text-gray-400 text-sm mb-5">Add chapters to {detail?.name} to organise questions.</p>
            <button onClick={() => setShowForm(true)}
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
                  {editingId === ch.id ? (
                    <div className="px-6 py-4 bg-indigo-50 border-l-4 border-indigo-400">
                      {editError && <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</div>}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Name</label><input type="text" value={editState.name} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} className={inputCls} /></div>
                        <div><label className="block text-xs font-semibold text-gray-600 mb-1">Description</label><input type="text" value={editState.description} onChange={e => setEditState(s => ({ ...s, description: e.target.value }))} className={inputCls} /></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveEdit(ch.id)} disabled={editSaving} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60">{editSaving ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  ) : confirmDeactivateId === ch.id ? (
                    <div className="px-6 py-4 bg-red-50 border-l-4 border-red-400 flex items-center justify-between gap-4">
                      <div><p className="text-sm font-semibold text-red-800">Deactivate "{ch.name}"?</p><p className="text-xs text-red-600 mt-0.5">Questions are preserved.</p></div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleDeactivate(ch.id)} disabled={deactivatingId === ch.id} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-60">{deactivatingId === ch.id ? 'Deactivating...' : 'Yes, Deactivate'}</button>
                        <button onClick={() => setConfirmDeactivateId(null)} className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Cancel</button>
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
                        {ch.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{ch.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/teacher/upload?chapter_id=${ch.id}`}
                          className="px-3 py-1.5 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-all font-medium">
                          + Questions
                        </Link>
                        <button onClick={() => startEdit(ch)}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          Edit
                        </button>
                        <button onClick={() => { setConfirmDeactivateId(ch.id); setEditingId(null); }}
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
      </div>
    </TeacherShell>
  );
}
