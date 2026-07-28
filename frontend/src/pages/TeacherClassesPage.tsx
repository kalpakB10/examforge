import { useState, useEffect, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';

interface ClassItem {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  _count?: { subjects: number };
}

const COLORS = [
  'from-indigo-500 to-indigo-600',
  'from-violet-500 to-violet-600',
  'from-blue-500 to-blue-600',
  'from-teal-500 to-teal-600',
  'from-green-500 to-green-600',
  'from-orange-500 to-orange-600',
];

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // create
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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

  const fetchClasses = async () => {
    try {
      setLoading(true); setError('');
      const res = await api.get('/classes');
      const list: ClassItem[] = res.data?.data?.classes ?? [];
      setClasses(Array.isArray(list) ? list : []);
    } catch { setError('Failed to load classes.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchClasses(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setSaveError('Class name is required.'); return; }
    setSaveError(''); setSaving(true);
    try {
      await api.post('/classes', { name: name.trim(), description: description.trim() });
      showToast('Class created!');
      setName(''); setDescription(''); setShowForm(false);
      await fetchClasses();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setSaveError(msg ?? 'Failed to create class.');
    } finally { setSaving(false); }
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) { setEditError('Name is required.'); return; }
    setEditSaving(true); setEditError('');
    try {
      await api.put(`/classes/${id}`, { name: editName.trim(), description: editDesc.trim() });
      showToast('Class updated!');
      setEditingId(null);
      await fetchClasses();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setEditError(msg ?? 'Failed to update class.');
    } finally { setEditSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.delete(`/classes/${id}`);
      showToast('Class deleted.');
      setConfirmDeleteId(null);
      setClasses(prev => prev.filter(c => c.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      showToast(msg ?? 'Failed to delete class.');
      setConfirmDeleteId(null);
    } finally { setDeletingId(null); }
  };

  return (
    <TeacherShell
      title="Classes"
      subtitle="Manage your classes — each class has its own subjects and chapters"
      action={
        <button onClick={() => { setShowForm(v => !v); setSaveError(''); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${showForm ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}>
          {showForm ? 'Cancel' : '+ Add Class'}
        </button>
      }
    >
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
          {toast}
        </div>
      )}

      <div className="max-w-4xl space-y-6">
        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
              <h2 className="text-sm font-semibold text-indigo-800">New Class</h2>
              <p className="text-indigo-500 text-xs mt-0.5">e.g. "NMMS 2025", "Class 10", "Class 8"</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {saveError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  {saveError}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Class Name <span className="text-red-500">*</span></label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} autoFocus
                  placeholder="e.g. NMMS 2025 or Class 10"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. State scholarship exam batch 2025" rows={2}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none transition-all" />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all shadow-sm">
                  {saving ? 'Creating...' : 'Create Class'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setSaveError(''); }}
                  className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-200 transition-all">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="text-center">
              <div className="w-9 h-9 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-400 text-sm">Loading classes...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">{error}</div>
        ) : classes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-16 text-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
              </svg>
            </div>
            <p className="text-gray-600 font-semibold mb-1">No classes yet</p>
            <p className="text-gray-400 text-sm mb-5">Create your first class to start organising subjects and chapters.</p>
            <button onClick={() => setShowForm(true)}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all">
              + Create First Class
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {classes.map((cls, idx) => (
              <div key={cls.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden group">
                {editingId === cls.id ? (
                  /* ── Inline edit ── */
                  <div className="p-5 bg-indigo-50 border-l-4 border-indigo-400">
                    {editError && (
                      <div className="mb-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                        {editError}
                      </div>
                    )}
                    <div className="space-y-2 mb-3">
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                      <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                        placeholder="Description (optional)"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveEdit(cls.id)} disabled={editSaving}
                        className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-all">
                        {editSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : confirmDeleteId === cls.id ? (
                  /* ── Delete confirm ── */
                  <div className="p-5 bg-red-50 border-l-4 border-red-400">
                    <p className="text-sm font-semibold text-red-800 mb-0.5">Delete "{cls.name}"?</p>
                    <p className="text-xs text-red-600 mb-3">This cannot be undone. Class must have no subjects.</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleDelete(cls.id)} disabled={deletingId === cls.id}
                        className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 disabled:opacity-60 transition-all">
                        {deletingId === cls.id ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="px-4 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-all">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Normal card ── */
                  <>
                    <div className={`h-1.5 bg-gradient-to-r ${COLORS[idx % COLORS.length]}`} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${COLORS[idx % COLORS.length]} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                            {cls.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{cls.name}</p>
                            {cls.description && (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{cls.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingId(cls.id); setEditName(cls.name); setEditDesc(cls.description ?? ''); setEditError(''); setConfirmDeleteId(null); }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                          </button>
                          <button onClick={() => { setConfirmDeleteId(cls.id); setEditingId(null); }}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-medium">
                          {cls._count?.subjects ?? 0} subject{(cls._count?.subjects ?? 0) !== 1 ? 's' : ''}
                        </span>
                        <Link to={`/teacher/classes/${cls.id}`}
                          className="text-xs text-gray-400 hover:text-indigo-600 font-medium transition-colors group-hover:text-indigo-600 flex items-center gap-1">
                          Open →
                        </Link>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </TeacherShell>
  );
}
