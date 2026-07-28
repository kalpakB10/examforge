import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import TeacherShell from '../components/TeacherShell';
import api from '../api';
import { useToast } from '../components/ui/Toast';

interface ClassItem { id: string; name: string; }
interface SubjectItem { id: string; name: string; }
interface SubSubjectItem { id: string; name: string; }
interface ChapterItem { id: string; name: string; sub_subject_id?: string | null; subSubjectId?: string | null; }

interface UploadResult {
  inserted?: number; failed?: number; errors?: string[]; message?: string;
}

export default function TeacherUploadPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const preselectedChapterId = searchParams.get('chapter_id') ?? '';

  // cascade state
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subSubjects, setSubSubjects] = useState<SubSubjectItem[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSubSubject, setSelectedSubSubject] = useState(''); // '' means "no sub-subject filter / direct"
  const [selectedChapter, setSelectedChapter] = useState('');

  const [classesLoading, setClassesLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subSubjectsLoading, setSubSubjectsLoading] = useState(false);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  // upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');

  // single question state
  const [qText, setQText] = useState('');
  const [qA, setQA] = useState('');
  const [qB, setQB] = useState('');
  const [qC, setQC] = useState('');
  const [qD, setQD] = useState('');
  const [qAnswer, setQAnswer] = useState('A');
  const [qMarks, setQMarks] = useState('1');
  const [singleSaving, setSingleSaving] = useState(false);
  const [singleError, setSingleError] = useState('');
  const [singleSuccess, setSingleSuccess] = useState('');

  // Step 1: load classes; if preselected chapter, resolve its chain
  useEffect(() => {
    const init = async () => {
      setClassesLoading(true);
      try {
        const clsRes = await api.get('/classes');
        const cls: ClassItem[] = clsRes.data?.data?.classes ?? [];
        setClasses(Array.isArray(cls) ? cls : []);

        if (preselectedChapterId) {
          // One request resolves the whole chain — /chapters/:id includes subject.classId + subSubject
          const chRes = await api.get(`/chapters/${preselectedChapterId}`);
          const ch = chRes.data?.data;
          if (ch) {
            const subjId = ch.subjectId ?? ch.subject?.id;
            const classId = ch.subject?.classId ?? '';
            const ssId = ch.subSubjectId ?? ch.subSubject?.id ?? '';
            if (classId) setSelectedClass(classId);
            if (subjId) setSelectedSubject(subjId);
            if (ssId) setSelectedSubSubject(ssId);
            setSelectedChapter(preselectedChapterId);
          }
        }
      } catch { /* non-fatal */ }
      finally { setClassesLoading(false); }
    };
    init();
  }, []);

  // Step 2: load subjects when class changes
  useEffect(() => {
    if (!selectedClass) { setSubjects([]); setSelectedSubject(''); return; }
    setSubjectsLoading(true);
    api.get(`/subjects?class_id=${selectedClass}`).then(res => {
      const list: SubjectItem[] = res.data?.data?.subjects ?? [];
      setSubjects(Array.isArray(list) ? list : []);
    }).catch(() => setSubjects([])).finally(() => setSubjectsLoading(false));
  }, [selectedClass]);

  // Step 3: load sub-subjects + check if subject has any when subject changes
  useEffect(() => {
    if (!selectedSubject) {
      setSubSubjects([]); setSelectedSubSubject(''); setChapters([]); setSelectedChapter(''); return;
    }
    setSubSubjectsLoading(true);
    api.get(`/sub-subjects?subject_id=${selectedSubject}`).then(res => {
      const list: SubSubjectItem[] = res.data?.data?.subSubjects ?? [];
      setSubSubjects(Array.isArray(list) ? list : []);
      setSelectedSubSubject('');
      setChapters([]); setSelectedChapter('');
    }).catch(() => setSubSubjects([])).finally(() => setSubSubjectsLoading(false));
  }, [selectedSubject]);

  // Step 4: load chapters when sub-subject selection or subject selection settles
  useEffect(() => {
    if (!selectedSubject) { setChapters([]); setSelectedChapter(''); return; }
    // if subject has sub-subjects and none selected yet, wait
    if (subSubjects.length > 0 && selectedSubSubject === '') { setChapters([]); setSelectedChapter(''); return; }

    setChaptersLoading(true);
    const url = selectedSubSubject
      ? `/chapters?sub_subject_id=${selectedSubSubject}`
      : `/chapters?subject_id=${selectedSubject}`;

    api.get(url).then(res => {
      const list: ChapterItem[] = res.data?.data?.chapters ?? [];
      const arr = Array.isArray(list) ? list : [];
      // for direct chapters (no sub-subject selected), filter to only those without sub_subject
      const filtered = selectedSubSubject
        ? arr
        : arr.filter(c => !c.sub_subject_id && !c.subSubjectId);
      setChapters(filtered);
      if (preselectedChapterId && filtered.some(c => c.id === preselectedChapterId)) {
        setSelectedChapter(preselectedChapterId);
      } else {
        setSelectedChapter('');
      }
    }).catch(() => setChapters([])).finally(() => setChaptersLoading(false));
  }, [selectedSubject, selectedSubSubject, subSubjects.length]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null);
      setUploadError('');
    }
  };

  const handleBulkUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedChapter) { setUploadError('Please select a chapter.'); return; }
    if (!file) { setUploadError('Please select an Excel file.'); return; }
    setUploadError(''); setUploadResult(null); setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subject_id', selectedSubject);
      formData.append('chapter_id', selectedChapter);
      if (selectedSubSubject) formData.append('sub_subject_id', selectedSubSubject);
      const res = await api.post('/questions/excel-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadResult(res.data?.data ?? res.data ?? {});
      setFile(null);
      const fi = document.getElementById('excel-file') as HTMLInputElement;
      if (fi) fi.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setUploadError(msg ?? 'Upload failed. Please check your file format and try again.');
    } finally { setUploading(false); }
  };

  // Detect type from current form state
  const isMCQ = !!(qA.trim() || qB.trim() || qC.trim() || qD.trim());

  const handleSingleQuestion = async (e: FormEvent) => {
    e.preventDefault();
    setSingleError(''); setSingleSuccess('');
    if (!selectedChapter) { setSingleError('Please select a chapter first.'); return; }
    if (!qText.trim()) { setSingleError('Question text is required.'); return; }
    if (isMCQ && (!qA.trim() || !qB.trim() || !qC.trim() || !qD.trim())) {
      setSingleError('For MCQ, all 4 options are required. To add a subjective question, leave all options empty.');
      return;
    }
    setSingleSaving(true);
    try {
      const formData = new FormData();
      formData.append('subject_id', selectedSubject);
      formData.append('chapter_id', selectedChapter);
      if (selectedSubSubject) formData.append('sub_subject_id', selectedSubSubject);
      formData.append('text', qText.trim());
      if (isMCQ) {
        formData.append('option_a', qA.trim());
        formData.append('option_b', qB.trim());
        formData.append('option_c', qC.trim());
        formData.append('option_d', qD.trim());
        formData.append('correct_option', qAnswer);
      }
      formData.append('difficulty', 'MEDIUM');
      formData.append('marks_weight', qMarks);
      await api.post('/questions', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSingleSuccess(isMCQ ? 'MCQ question added!' : 'Subjective question added!');
      setQText(''); setQA(''); setQB(''); setQC(''); setQD(''); setQAnswer('A'); setQMarks('1');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setSingleError(msg ?? 'Failed to add question.');
    } finally { setSingleSaving(false); }
  };

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all";
  const selectCls = `${inputCls} bg-white`;
  const disabledSelectCls = `${selectCls} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;

  const hasSubSubjects = subSubjects.length > 0;
  const canSelectChapter = selectedSubject && (!hasSubSubjects || selectedSubSubject !== '');

  return (
    <TeacherShell title="Upload Questions" subtitle="Add questions via Excel bulk upload or manual entry">
      <div className="max-w-4xl space-y-5">

        {/* Step 1: Target selection — Class → Subject → Sub-subject? → Chapter */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center gap-3">
            <span className="w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">1</span>
            <div>
              <h2 className="text-sm font-semibold text-indigo-800">Select Target</h2>
              <p className="text-indigo-500 text-xs mt-0.5">Class → Subject → Sub-subject (if any) → Chapter</p>
            </div>
          </div>
          <div className="p-6">
            {classesLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                Loading...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Class */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Class <span className="text-red-500">*</span></label>
                  <select value={selectedClass} onChange={e => { setSelectedClass(e.target.value); setSelectedSubject(''); setSelectedSubSubject(''); setSelectedChapter(''); }}
                    className={selectCls}>
                    <option value="">— Select Class —</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {classes.length === 0 && <p className="text-xs text-amber-600 mt-1">No classes yet.</p>}
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subject <span className="text-red-500">*</span></label>
                  <select value={selectedSubject} onChange={e => { setSelectedSubject(e.target.value); setSelectedSubSubject(''); setSelectedChapter(''); }}
                    disabled={!selectedClass || subjectsLoading}
                    className={disabledSelectCls}>
                    <option value="">
                      {!selectedClass ? '— Select class first —' : subjectsLoading ? 'Loading...' : '— Select Subject —'}
                    </option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {/* Sub-subject — only shown if subject has sub-subjects */}
                {selectedSubject && (subSubjectsLoading || hasSubSubjects) && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                      Sub-subject <span className="text-red-500">*</span>
                    </label>
                    <select value={selectedSubSubject} onChange={e => { setSelectedSubSubject(e.target.value); setSelectedChapter(''); }}
                      disabled={subSubjectsLoading}
                      className={disabledSelectCls}>
                      <option value="">
                        {subSubjectsLoading ? 'Loading...' : '— Select Sub-subject —'}
                      </option>
                      {subSubjects.map(ss => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Chapter */}
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Chapter <span className="text-red-500">*</span></label>
                  <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)}
                    disabled={!canSelectChapter || chaptersLoading}
                    className={disabledSelectCls}>
                    <option value="">
                      {!selectedSubject
                        ? '— Select subject first —'
                        : hasSubSubjects && !selectedSubSubject
                          ? '— Select sub-subject first —'
                          : chaptersLoading ? 'Loading...'
                          : chapters.length === 0 ? 'No chapters found'
                          : '— Select Chapter —'}
                    </option>
                    {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {canSelectChapter && !chaptersLoading && chapters.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">No chapters in this selection. Create chapters first.</p>
                  )}
                </div>
              </div>
            )}

            {/* Progress indicator */}
            {selectedChapter && (
              <div className="mt-4 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
                <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                <p className="text-xs text-indigo-700 font-medium">
                  Target selected — scroll down to upload questions.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Bulk Upload */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">2</span>
              <div>
                <h2 className="text-sm font-semibold text-blue-800">Bulk Upload via Excel</h2>
                <p className="text-blue-500 text-xs mt-0.5">Upload an .xlsx file with all your questions at once</p>
              </div>
            </div>
            <button type="button" onClick={async () => {
              try {
                const resp = await api.get('/questions/excel-template', { responseType: 'blob' });
                const url = URL.createObjectURL(resp.data);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'question_upload_template.xlsx';
                a.click();
                URL.revokeObjectURL(url);
              } catch {
                toast.error('Could not download template. Please try again.');
              }
            }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all shrink-0">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download Template
            </button>
          </div>

          {/* Column format reference */}
          <div className="px-6 pt-5 pb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Excel Columns</p>
            <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <strong>Auto-detection:</strong> If a row has options + correct_option → saved as <strong>MCQ</strong>. If option columns are empty → saved as <strong>Subjective</strong> (no answer key generated).
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Column</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">MCQ</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Subjective</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-600">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[
                    { col: 'text', mcq: 'Required', subj: 'Required', ex: 'Explain Newton\'s law...' },
                    { col: 'option_a', mcq: 'Required', subj: 'Empty', ex: 'Earth' },
                    { col: 'option_b', mcq: 'Required', subj: 'Empty', ex: 'Mars' },
                    { col: 'option_c', mcq: 'Required', subj: 'Empty', ex: 'Jupiter' },
                    { col: 'option_d', mcq: 'Required', subj: 'Empty', ex: 'Saturn' },
                    { col: 'correct_option', mcq: 'A/B/C/D', subj: 'Empty', ex: 'B' },
                    { col: 'difficulty', mcq: 'Optional', subj: 'Optional', ex: 'MEDIUM' },
                    { col: 'marks_weight', mcq: 'Optional', subj: 'Optional', ex: '5' },
                    { col: 'tags', mcq: 'Optional', subj: 'Optional', ex: 'physics;laws' },
                    { col: 'year_tag', mcq: 'Optional', subj: 'Optional', ex: '2020-21' },
                  ].map(row => (
                    <tr key={row.col} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2 font-mono text-indigo-700 font-medium">{row.col}</td>
                      <td className={`px-3 py-2 ${row.mcq === 'Empty' ? 'text-gray-400' : row.mcq === 'Optional' ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>{row.mcq}</td>
                      <td className={`px-3 py-2 ${row.subj === 'Empty' ? 'text-gray-400' : row.subj === 'Optional' ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>{row.subj}</td>
                      <td className="px-3 py-2 text-gray-400 font-mono">{row.ex}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <form onSubmit={handleBulkUpload} className="p-6 pt-4">
            {uploadError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                {uploadError}
              </div>
            )}
            {uploadResult && (
              <div className={`border rounded-xl px-5 py-4 mb-4 ${uploadResult.failed ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <p className={`font-semibold text-sm mb-2 ${uploadResult.failed ? 'text-amber-800' : 'text-green-800'}`}>Upload Complete!</p>
                <p className="text-sm text-gray-700">Inserted: <strong>{uploadResult.inserted ?? 0}</strong> questions</p>
                {(uploadResult.failed ?? 0) > 0 && <p className="text-sm text-red-600 mt-1">Failed: <strong>{uploadResult.failed}</strong> rows</p>}
                {uploadResult.message && <p className="text-sm text-gray-500 mt-1">{uploadResult.message}</p>}
                {uploadResult.errors && uploadResult.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer">Show errors ({uploadResult.errors.length})</summary>
                    <ul className="mt-1 text-xs text-red-600 space-y-0.5 ml-3">
                      {uploadResult.errors.map((err, i) => <li key={i}>• {err}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <label htmlFor="excel-file"
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${file ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}>
              <input id="excel-file" type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
              </div>
              {file ? (
                <><p className="text-sm font-semibold text-indigo-700">{file.name}</p><p className="text-xs text-indigo-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p></>
              ) : (
                <><p className="text-sm font-semibold text-gray-600">Click to select Excel file</p><p className="text-xs text-gray-400 mt-1">Supported: .xlsx, .xls</p></>
              )}
            </label>
            {file && <button type="button" onClick={() => setFile(null)} className="text-xs text-red-500 hover:text-red-700 mb-4 block">Remove file</button>}

            <button type="submit" disabled={uploading || !file || !selectedChapter}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
              {uploading
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading...</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Upload Excel File</>
              }
            </button>
            {!selectedChapter && <p className="text-center text-xs text-gray-400 mt-2">Select a chapter above to enable upload</p>}
          </form>
        </div>

        {/* Step 3: Manual Question */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex items-center gap-3">
            <span className="w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">3</span>
            <div>
              <h2 className="text-sm font-semibold text-green-800">Add Single Question Manually</h2>
              <p className="text-green-600 text-xs mt-0.5">
                Fill options for MCQ, or leave options empty for a subjective question.
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${isMCQ ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isMCQ ? 'Will save as: MCQ' : 'Will save as: Subjective'}
                </span>
              </p>
            </div>
          </div>
          <form onSubmit={handleSingleQuestion} className="p-6 space-y-4">
            {singleError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                {singleError}
              </div>
            )}
            {singleSuccess && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
                {singleSuccess}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question Text <span className="text-red-500">*</span></label>
              <textarea value={qText} onChange={e => setQText(e.target.value)}
                placeholder="Enter the MCQ question here..." rows={3}
                className={`${inputCls} resize-none`} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Option A', value: qA, setter: setQA },
                { label: 'Option B', value: qB, setter: setQB },
                { label: 'Option C', value: qC, setter: setQC },
                { label: 'Option D', value: qD, setter: setQD },
              ].map(opt => (
                <div key={opt.label}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    {opt.label} <span className="text-gray-400 font-normal text-xs">(leave empty for subjective)</span>
                  </label>
                  <input type="text" value={opt.value} onChange={e => opt.setter(e.target.value)}
                    placeholder={`Enter ${opt.label}...`} className={inputCls} />
                </div>
              ))}
            </div>

            <div className={`grid grid-cols-2 gap-4 transition-opacity ${isMCQ ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Correct Answer {isMCQ && <span className="text-red-500">*</span>}</label>
                <select value={qAnswer} onChange={e => setQAnswer(e.target.value)} disabled={!isMCQ} className={selectCls}>
                  {['A', 'B', 'C', 'D'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Marks</label>
                <input type="number" value={qMarks} onChange={e => setQMarks(e.target.value)} min="1" className={inputCls} />
              </div>
            </div>

            <button type="submit" disabled={singleSaving || !selectedChapter}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2">
              {singleSaving
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Adding Question...</>
                : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>Add Question</>
              }
            </button>
            {!selectedChapter && <p className="text-center text-xs text-gray-400 mt-1">Select a chapter above to enable</p>}
          </form>
        </div>
      </div>
    </TeacherShell>
  );
}
