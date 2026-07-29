import { useState, useEffect, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';
import type { Subject } from '../types';

interface ClassDetail {
  id: string;
  name: string;
  description?: string;
  subjects: (Subject & { _count?: { chapters: number; questions: number } })[];
}

const COLORS = ['bg-indigo-500', 'bg-violet-500', 'bg-blue-500', 'bg-teal-500', 'bg-green-500', 'bg-orange-500'];

export default function TeacherClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // create subject
  const [showForm, setShowForm] = useState(false);
  const [subName, setSubName] = useState('');
  const [subDesc, setSubDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // delete
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchClass = async () => {
    try {
      setLoading(true); setError('');
      const res = await api.get(`/classes/${classId}`);
      setCls(res.data?.data);
    } catch { setError('Failed to load class.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (classId) fetchClass(); }, [classId]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!subName.trim()) { setSaveError('Subject name is required.'); return; }
    setSaveError(''); setSaving(true);
    try {
      await api.post('/subjects', { name: subName.trim(), description: subDesc.trim(), class_id: classId });
      showToast('Subject created!');
      setSubName(''); setSubDesc(''); setShowForm(false);
      await fetchClass();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string }; message?: string } } })
        ?.response?.data?.error?.message
        ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSaveError(msg ?? 'Failed to create subject.');
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/subjects/${id}`, { name: editName.trim(), description: editDesc.trim() });
      showToast('Subject updated!');
      setEditingId(null);
      await fetchClass();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setEditError(msg ?? 'Failed to update subject.');
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/subjects/${id}`);
      showToast('Subject deleted.');
      setConfirmDeleteId(null);
      setCls(prev => prev ? { ...prev, subjects: prev.subjects.filter(s => s.id !== id) } : prev);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      showToast(msg ?? 'Failed to delete subject.');
      setConfirmDeleteId(null);
    } finally { setDeletingId(null); }
  };

  const subjects = cls?.subjects ?? [];

  return (
    <TeacherShell
      title={cls?.name ?? 'Class'}
      subtitle={cls?.description ?? 'Subjects in this class'}
      action={
        <div className="flex items-center gap-2">
          <Link to="/teacher/classes"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
            ← All Classes
          </Link>
          <button onClick={() => { setShowForm(v => !v); setSaveError(''); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showForm ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
            {showForm ? 'Cancel' : '+ Add Subject'}
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
        {/* Add subject form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
              <h2 className="text-sm font-semibold text-indigo-800">New Subject in {cls?.name}</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {saveError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Subject Name <span className="text-red-500">*</span></label>
                  <input type="text" value={subName} onChange={e => setSubName(e.target.value)} autoFocus
                    placeholder="e.g. Science, Mathematics"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={subDesc} onChange={e => setSubDesc(e.target.value)}
                    placeholder="Brief description"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-sm">
                  {saving ? 'Creating...' : 'Create Subject'}
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
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : subjects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
            </div>
            <p className="text-gray-500 font-medium mb-1">No subjects yet</p>
            <p className="text-gray-400 text-sm mb-5">Add subjects to organise your chapters and questions for {cls?.name}.</p>
            <button onClick={() => setShowForm(true)}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
              + Add First Subject
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-400 font-medium">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {subjects.map((subject, idx) => (
                <div key={subject.id}>
                  {editingId === subject.id ? (
                    <div className="px-6 py-4 bg-indigo-50 border-l-4 border-indigo-400">
                      {editError && (
                        <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                          {editError}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                          <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                            placeholder="Optional"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveEdit(subject.id)} disabled={editSaving}
                          className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all">
                          {editSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : confirmDeleteId === subject.id ? (
                    <div className="px-6 py-4 bg-red-50 border-l-4 border-red-400 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-red-800">Delete "{subject.name}"?</p>
                        <p className="text-xs text-red-600 mt-0.5">Subject must have no active chapters to delete.</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => handleDelete(subject.id)} disabled={deletingId === subject.id}
                          className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-60 transition-all">
                          {deletingId === subject.id ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${COLORS[idx % COLORS.length]}`}>
                        {subject.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{subject.name}</p>
                        {subject.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{subject.description}</p>
                        )}
                        <div className="flex gap-3 mt-1">
                          <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {subject._count?.chapters ?? 0} chapter{(subject._count?.chapters ?? 0) !== 1 ? 's' : ''}
                          </span>
                          <span className="text-xs text-gray-400">
                            {subject._count?.questions ?? 0} questions
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link to={`/teacher/classes/${classId}/subjects/${subject.id}`}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium">
                          Manage →
                        </Link>
                        <button onClick={() => { setEditingId(subject.id); setEditName(subject.name); setEditDesc(subject.description ?? ''); setEditError(''); setConfirmDeleteId(null); }}
                          className="px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all font-medium flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          Edit
                        </button>
                        <button onClick={() => { setConfirmDeleteId(subject.id); setEditingId(null); }}
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
      </div>
    </TeacherShell>
  );
}
