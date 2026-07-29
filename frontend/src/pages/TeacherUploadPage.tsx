/**
 * TeacherUploadPage — question upload with an intent-first design.
 *
 * Flow:
 *   Step 1: pick target (Class → Subject → Sub-subject? → Chapter)  [always visible]
 *   Step 2: pick intent — MCQ or Subjective                          [tabs]
 *   Step 3: choose mode — Bulk (Excel) or Manual (form)              [inside tab]
 *
 * The intent choice drives EVERYTHING that follows: the Excel template you
 * download, the form fields you see, the columns the parser expects. No
 * more silent "auto-detected as subjective because you left an option blank"
 * — teachers pick their intent explicitly.
 */
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
  inserted?: number; failed?: number; errors?: Array<string | { row: number; reason: string }>; message?: string;
}

type Intent = 'MCQ' | 'SUBJECTIVE';
type SubjectiveSubType = 'FILL_BLANK' | 'ONE_WORD' | 'SHORT_ANSWER' | 'LONG_ANSWER';

const SUBTYPE_META: Record<SubjectiveSubType, { label: string; hint: string; example: string; expectedAnswerLabel: string; expectedAnswerHint: string }> = {
  FILL_BLANK: {
    label: 'Fill in the Blanks',
    hint: 'Use ___ in the question text where the blank goes.',
    example: 'The chemical symbol for gold is ___.',
    expectedAnswerLabel: 'Correct answer',
    expectedAnswerHint: 'Recommended — printed in the answer key.',
  },
  ONE_WORD: {
    label: 'One-Word / One-Sentence',
    hint: 'Short factual question, single-word or one-sentence answer.',
    example: 'Name the largest planet in our solar system.',
    expectedAnswerLabel: 'Correct answer',
    expectedAnswerHint: 'Recommended — printed in the answer key.',
  },
  SHORT_ANSWER: {
    label: 'Short Answer (2–3 marks)',
    hint: 'Answer expected in ~30–50 words.',
    example: "Explain Newton's third law with an example.",
    expectedAnswerLabel: 'Model answer / marking scheme',
    expectedAnswerHint: 'OPTIONAL — leave blank if you\'ll grade manually.',
  },
  LONG_ANSWER: {
    label: 'Long Answer / Essay (5+ marks)',
    hint: 'Detailed answer, typically 100+ words.',
    example: 'Describe the process of photosynthesis in detail.',
    expectedAnswerLabel: 'Model answer / marking scheme',
    expectedAnswerHint: 'OPTIONAL — long essays are usually graded manually.',
  },
};

export default function TeacherUploadPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const preselectedChapterId = searchParams.get('chapter_id') ?? '';

  // ── Target selection cascade (unchanged from before) ──────────────────────
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subSubjects, setSubSubjects] = useState<SubSubjectItem[]>([]);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSubSubject, setSelectedSubSubject] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const [classesLoading, setClassesLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subSubjectsLoading, setSubSubjectsLoading] = useState(false);
  const [chaptersLoading, setChaptersLoading] = useState(false);

  // ── Intent tab ──────────────────────────────────────────────────────────────
  const [intent, setIntent] = useState<Intent>('MCQ');

  useEffect(() => {
    const init = async () => {
      setClassesLoading(true);
      try {
        const clsRes = await api.get('/classes');
        const cls: ClassItem[] = clsRes.data?.data?.classes ?? [];
        setClasses(Array.isArray(cls) ? cls : []);
        if (preselectedChapterId) {
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
  }, [preselectedChapterId]);

  useEffect(() => {
    if (!selectedClass) { setSubjects([]); setSelectedSubject(''); return; }
    setSubjectsLoading(true);
    api.get(`/subjects?class_id=${selectedClass}`).then(res => {
      const list: SubjectItem[] = res.data?.data?.subjects ?? [];
      setSubjects(Array.isArray(list) ? list : []);
    }).catch(() => setSubjects([])).finally(() => setSubjectsLoading(false));
  }, [selectedClass]);

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

  useEffect(() => {
    if (!selectedSubject) { setChapters([]); setSelectedChapter(''); return; }
    if (subSubjects.length > 0 && selectedSubSubject === '') { setChapters([]); setSelectedChapter(''); return; }
    setChaptersLoading(true);
    const url = selectedSubSubject
      ? `/chapters?sub_subject_id=${selectedSubSubject}`
      : `/chapters?subject_id=${selectedSubject}`;
    api.get(url).then(res => {
      const list: ChapterItem[] = res.data?.data?.chapters ?? [];
      const arr = Array.isArray(list) ? list : [];
      const filtered = selectedSubSubject ? arr : arr.filter(c => !c.sub_subject_id && !c.subSubjectId);
      setChapters(filtered);
      if (preselectedChapterId && filtered.some(c => c.id === preselectedChapterId)) {
        setSelectedChapter(preselectedChapterId);
      } else if (filtered.length === 1) {
        setSelectedChapter(filtered[0].id);
      } else {
        setSelectedChapter('');
      }
    }).catch(() => setChapters([])).finally(() => setChaptersLoading(false));
  }, [selectedSubject, selectedSubSubject, subSubjects.length, preselectedChapterId]);

  const hasSubSubjects = subSubjects.length > 0;
  const canSelectChapter = selectedSubject && (!hasSubSubjects || selectedSubSubject !== '');

  const inputCls = "w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all";
  const selectCls = `${inputCls} bg-white`;
  const disabledSelectCls = `${selectCls} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`;

  return (
    <TeacherShell title="Upload Questions" subtitle="Add questions to your bank — MCQ or subjective, bulk or one by one">
      <div className="max-w-5xl space-y-5">

        {/* Step 1: Target selection */}
        <TargetPicker
          classes={classes} subjects={subjects} subSubjects={subSubjects} chapters={chapters}
          selectedClass={selectedClass} selectedSubject={selectedSubject}
          selectedSubSubject={selectedSubSubject} selectedChapter={selectedChapter}
          setSelectedClass={setSelectedClass} setSelectedSubject={setSelectedSubject}
          setSelectedSubSubject={setSelectedSubSubject} setSelectedChapter={setSelectedChapter}
          classesLoading={classesLoading} subjectsLoading={subjectsLoading}
          subSubjectsLoading={subSubjectsLoading} chaptersLoading={chaptersLoading}
          hasSubSubjects={hasSubSubjects} canSelectChapter={!!canSelectChapter}
          selectCls={selectCls} disabledSelectCls={disabledSelectCls}
        />

        {/* Step 2: Intent tabs */}
        <IntentTabs intent={intent} setIntent={setIntent} />

        {/* Step 3: Content per intent */}
        {intent === 'MCQ' ? (
          <McqUploadPanel
            selectedChapter={selectedChapter} selectedSubject={selectedSubject}
            selectedSubSubject={selectedSubSubject}
            toast={toast} inputCls={inputCls} selectCls={selectCls}
          />
        ) : (
          <SubjectiveUploadPanel
            selectedChapter={selectedChapter} selectedSubject={selectedSubject}
            selectedSubSubject={selectedSubSubject}
            toast={toast} inputCls={inputCls} selectCls={selectCls}
          />
        )}
      </div>
    </TeacherShell>
  );
}

// ─── Target picker ──────────────────────────────────────────────────────────────

function TargetPicker(props: any) {
  const { classes, subjects, subSubjects, chapters,
          selectedClass, selectedSubject, selectedSubSubject, selectedChapter,
          setSelectedClass, setSelectedSubject, setSelectedSubSubject, setSelectedChapter,
          classesLoading, subjectsLoading, subSubjectsLoading, chaptersLoading,
          hasSubSubjects, canSelectChapter, selectCls, disabledSelectCls } = props;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex items-center gap-3">
        <span className="w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0">1</span>
        <div>
          <h2 className="text-sm font-semibold text-indigo-800">Where do these questions belong?</h2>
          <p className="text-indigo-500 text-xs mt-0.5">Class → Subject → Sub-subject (if any) → Chapter</p>
        </div>
      </div>
      <div className="p-6">
        {classesLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            Loading classes...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Class <span className="text-red-500">*</span></label>
              <select value={selectedClass}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setSelectedClass(e.target.value); setSelectedSubject(''); setSelectedSubSubject(''); setSelectedChapter('');
                }}
                className={selectCls}>
                <option value="">— Select Class —</option>
                {classes.map((c: ClassItem) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {classes.length === 0 && <p className="text-xs text-amber-600 mt-1">No classes yet.</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subject <span className="text-red-500">*</span></label>
              <select value={selectedSubject}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setSelectedSubject(e.target.value); setSelectedSubSubject(''); setSelectedChapter('');
                }}
                disabled={!selectedClass || subjectsLoading}
                className={disabledSelectCls}>
                <option value="">
                  {!selectedClass ? '— Select class first —' : subjectsLoading ? 'Loading...' : '— Select Subject —'}
                </option>
                {subjects.map((s: SubjectItem) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {selectedSubject && (subSubjectsLoading || hasSubSubjects) && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Sub-subject <span className="text-red-500">*</span>
                </label>
                <select value={selectedSubSubject}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setSelectedSubSubject(e.target.value); setSelectedChapter('');
                  }}
                  disabled={subSubjectsLoading}
                  className={disabledSelectCls}>
                  <option value="">{subSubjectsLoading ? 'Loading...' : '— Select Sub-subject —'}</option>
                  {subSubjects.map((ss: SubSubjectItem) => <option key={ss.id} value={ss.id}>{ss.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Chapter <span className="text-red-500">*</span></label>
              <select value={selectedChapter}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedChapter(e.target.value)}
                disabled={!canSelectChapter || chaptersLoading}
                className={disabledSelectCls}>
                <option value="">
                  {!selectedSubject ? '— Select subject first —'
                    : hasSubSubjects && !selectedSubSubject ? '— Select sub-subject first —'
                    : chaptersLoading ? 'Loading...'
                    : chapters.length === 0 ? 'No chapters found'
                    : '— Select Chapter —'}
                </option>
                {chapters.map((c: ChapterItem) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {canSelectChapter && !chaptersLoading && chapters.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No chapters in this selection. Create chapters first.</p>
              )}
            </div>
          </div>
        )}

        {selectedChapter && (
          <div className="mt-4 flex items-center gap-2 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5">
            <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg>
            <p className="text-xs text-indigo-700 font-medium">Target selected. Pick a question type below.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Intent tabs ──────────────────────────────────────────────────────────────

function IntentTabs({ intent, setIntent }: { intent: Intent; setIntent: (i: Intent) => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 flex gap-1">
      {(['MCQ', 'SUBJECTIVE'] as Intent[]).map((v) => {
        const active = intent === v;
        const label = v === 'MCQ' ? '📝 MCQ (with options + correct answer)' : '✍️ Subjective (fill / short / long / essay)';
        const sub = v === 'MCQ'
          ? 'Auto-graded. Students pick A/B/C/D.'
          : 'Manually evaluated. Fill-in-blanks, one-word, short answer, long answer.';
        return (
          <button key={v} onClick={() => setIntent(v)}
            className={`flex-1 rounded-xl p-4 text-left transition-all ${
              active
                ? (v === 'MCQ' ? 'bg-blue-50 border-2 border-blue-400' : 'bg-amber-50 border-2 border-amber-400')
                : 'border-2 border-transparent hover:bg-gray-50'}`}>
            <div className={`text-sm font-bold ${active ? (v === 'MCQ' ? 'text-blue-700' : 'text-amber-700') : 'text-gray-700'}`}>{label}</div>
            <div className={`text-xs mt-1 ${active ? (v === 'MCQ' ? 'text-blue-600' : 'text-amber-600') : 'text-gray-400'}`}>{sub}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── MCQ upload panel ─────────────────────────────────────────────────────────

function McqUploadPanel({ selectedChapter, selectedSubject, selectedSubSubject, toast, inputCls, selectCls }: any) {
  const [mode, setMode] = useState<'BULK' | 'MANUAL'>('BULK');
  return (
    <>
      <ModeSwitcher mode={mode} setMode={setMode} accent="blue" />
      {mode === 'BULK' ? (
        <BulkUploadCard
          intent="MCQ"
          selectedChapter={selectedChapter} selectedSubject={selectedSubject} selectedSubSubject={selectedSubSubject}
          toast={toast} accent="blue"
        />
      ) : (
        <ManualMcqForm
          selectedChapter={selectedChapter} selectedSubject={selectedSubject} selectedSubSubject={selectedSubSubject}
          toast={toast} inputCls={inputCls} selectCls={selectCls}
        />
      )}
    </>
  );
}

// ─── Subjective upload panel ──────────────────────────────────────────────────

function SubjectiveUploadPanel({ selectedChapter, selectedSubject, selectedSubSubject, toast, inputCls, selectCls }: any) {
  const [mode, setMode] = useState<'BULK' | 'MANUAL'>('MANUAL');
  return (
    <>
      <ModeSwitcher mode={mode} setMode={setMode} accent="amber" />
      {mode === 'BULK' ? (
        <BulkUploadCard
          intent="SUBJECTIVE"
          selectedChapter={selectedChapter} selectedSubject={selectedSubject} selectedSubSubject={selectedSubSubject}
          toast={toast} accent="amber"
        />
      ) : (
        <ManualSubjectiveForm
          selectedChapter={selectedChapter} selectedSubject={selectedSubject} selectedSubSubject={selectedSubSubject}
          toast={toast} inputCls={inputCls} selectCls={selectCls}
        />
      )}
    </>
  );
}

function ModeSwitcher({ mode, setMode, accent }: { mode: 'BULK' | 'MANUAL'; setMode: (m: 'BULK' | 'MANUAL') => void; accent: 'blue' | 'amber' }) {
  const activeCls = accent === 'blue' ? 'bg-blue-600 text-white' : 'bg-amber-600 text-white';
  return (
    <div className="flex gap-2">
      <button onClick={() => setMode('BULK')}
        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${mode === 'BULK' ? activeCls : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
        📄 Bulk upload (Excel)
      </button>
      <button onClick={() => setMode('MANUAL')}
        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${mode === 'MANUAL' ? activeCls : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
        ✏️ Add one manually
      </button>
    </div>
  );
}

// ─── Bulk upload card (works for both MCQ + Subjective intents) ─────────────

function BulkUploadCard({ intent, selectedChapter, selectedSubject, selectedSubSubject, toast, accent }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');

  const templateEndpoint = intent === 'MCQ'
    ? '/questions/excel-template?flavor=mcq'
    : '/questions/excel-template?flavor=subjective';
  const templateFilename = intent === 'MCQ'
    ? 'mcq_question_template.xlsx'
    : 'subjective_question_template.xlsx';

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setUploadResult(null); setUploadError('');
    }
  };

  const handleBulkUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedChapter) { setUploadError('Please select a chapter first.'); return; }
    if (!file) { setUploadError('Please pick an Excel file.'); return; }
    setUploadError(''); setUploadResult(null); setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subject_id', selectedSubject);
      formData.append('chapter_id', selectedChapter);
      if (selectedSubSubject) formData.append('sub_subject_id', selectedSubSubject);
      // Tell the backend the intent so it can validate more strictly per row
      formData.append('expected_type', intent);
      const res = await api.post('/questions/excel-upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadResult(res.data?.data ?? res.data ?? {});
      setFile(null);
      const fi = document.getElementById('excel-file') as HTMLInputElement;
      if (fi) fi.value = '';
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string; error?: { message?: string } } } })?.response?.data;
      setUploadError(msg?.error?.message ?? msg?.message ?? 'Upload failed. Check your file format.');
    } finally { setUploading(false); }
  };

  const downloadTemplate = async () => {
    try {
      const resp = await api.get(templateEndpoint, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url; a.download = templateFilename; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Could not download template. Please try again.'); }
  };

  const bg = accent === 'blue' ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-amber-50 border-amber-100 text-amber-800';
  const btn = accent === 'blue' ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300' : 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`${bg} border-b px-6 py-4 flex items-center justify-between gap-3`}>
        <div>
          <h2 className="text-sm font-semibold">{intent === 'MCQ' ? 'Bulk upload — MCQ' : 'Bulk upload — Subjective'}</h2>
          <p className="text-xs mt-0.5 opacity-80">
            {intent === 'MCQ'
              ? 'Every row needs 4 options + a correct answer.'
              : 'Every row needs a sub-type (fill / one-word / short / long). Model answer is optional for essays.'}
          </p>
        </div>
        <button onClick={downloadTemplate}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 ${accent === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          Download Template
        </button>
      </div>

      {/* Column reference */}
      <div className="px-6 pt-5 pb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Expected columns</p>
        {intent === 'MCQ' ? <McqColumnTable /> : <SubjectiveColumnTable />}
      </div>

      <form onSubmit={handleBulkUpload} className="p-6 pt-4">
        {uploadError && <ErrorBox>{uploadError}</ErrorBox>}
        {uploadResult && <ResultBox result={uploadResult} />}

        <label htmlFor="excel-file"
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${file ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}>
          <input id="excel-file" type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          </div>
          {file
            ? <><p className="text-sm font-semibold text-indigo-700">{file.name}</p><p className="text-xs text-indigo-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p></>
            : <><p className="text-sm font-semibold text-gray-600">Click to select an Excel file</p><p className="text-xs text-gray-400 mt-1">.xlsx or .xls</p></>}
        </label>
        {file && <button type="button" onClick={() => setFile(null)} className="text-xs text-red-500 hover:text-red-700 mb-4 block">Remove file</button>}

        <button type="submit" disabled={uploading || !file || !selectedChapter}
          className={`w-full ${btn} text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2`}>
          {uploading
            ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Uploading...</>
            : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Upload Excel File</>}
        </button>
        {!selectedChapter && <p className="text-center text-xs text-gray-400 mt-2">Select a chapter above to enable upload</p>}
      </form>
    </div>
  );
}

function McqColumnTable() {
  const rows = [
    { col: 'text',           req: 'Required', ex: 'Which planet is known as the Red Planet?' },
    { col: 'option_a',       req: 'Required', ex: 'Earth' },
    { col: 'option_b',       req: 'Required', ex: 'Mars' },
    { col: 'option_c',       req: 'Required', ex: 'Jupiter' },
    { col: 'option_d',       req: 'Required', ex: 'Saturn' },
    { col: 'correct_option', req: 'A / B / C / D', ex: 'B' },
    { col: 'difficulty',     req: 'Optional', ex: 'EASY | MEDIUM | HARD (default MEDIUM)' },
    { col: 'marks_weight',   req: 'Optional', ex: '1 (default)' },
    { col: 'tags',           req: 'Optional', ex: 'science;planets' },
    { col: 'year_tag',       req: 'Optional', ex: '2019-20' },
  ];
  return <ColumnTable rows={rows} />;
}

function SubjectiveColumnTable() {
  const rows = [
    { col: 'text',            req: 'Required', ex: 'Explain Newton\'s third law with an example.' },
    { col: 'sub_type',        req: 'Required', ex: 'FILL_BLANK | ONE_WORD | SHORT_ANSWER | LONG_ANSWER' },
    { col: 'expected_answer', req: 'Optional*', ex: 'For every action there is an equal and opposite reaction…' },
    { col: 'difficulty',      req: 'Optional', ex: 'EASY | MEDIUM | HARD (default MEDIUM)' },
    { col: 'marks_weight',    req: 'Optional', ex: '3' },
    { col: 'tags',            req: 'Optional', ex: 'physics;laws' },
    { col: 'year_tag',        req: 'Optional', ex: '2020-21' },
  ];
  return (
    <>
      <ColumnTable rows={rows} />
      <p className="text-xs text-gray-500 mt-2 italic">
        * <strong>expected_answer</strong> is recommended for fill-blanks and one-word answers (needed for the answer key).
        Leave it blank for short/long answers you'll grade manually — the answer key will still print with "graded by evaluator".
      </p>
    </>
  );
}

function ColumnTable({ rows }: { rows: Array<{ col: string; req: string; ex: string }> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="text-left px-3 py-2 font-semibold text-gray-600">Column</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-600">Required?</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-600">Example</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row) => (
            <tr key={row.col} className="hover:bg-gray-50 transition-colors">
              <td className="px-3 py-2 font-mono text-indigo-700 font-medium">{row.col}</td>
              <td className={`px-3 py-2 ${row.req.includes('Required') ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{row.req}</td>
              <td className="px-3 py-2 text-gray-500 font-mono">{row.ex}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Result + error boxes ────────────────────────────────────────────────────

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-4 text-sm">
      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
      {children}
    </div>
  );
}

function ResultBox({ result }: { result: UploadResult }) {
  const failed = result.failed ?? 0;
  return (
    <div className={`border rounded-xl px-5 py-4 mb-4 ${failed ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
      <p className={`font-semibold text-sm mb-2 ${failed ? 'text-amber-800' : 'text-green-800'}`}>Upload Complete!</p>
      <p className="text-sm text-gray-700">Inserted: <strong>{result.inserted ?? 0}</strong> question{(result.inserted ?? 0) === 1 ? '' : 's'}</p>
      {failed > 0 && <p className="text-sm text-red-600 mt-1">Failed: <strong>{failed}</strong> row{failed === 1 ? '' : 's'}</p>}
      {result.message && <p className="text-sm text-gray-500 mt-1">{result.message}</p>}
      {result.errors && result.errors.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer">Show errors ({result.errors.length})</summary>
          <ul className="mt-1 text-xs text-red-600 space-y-0.5 ml-3">
            {result.errors.map((err, i) => (
              <li key={i}>• {typeof err === 'string' ? err : `Row ${err.row}: ${err.reason}`}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ─── Manual MCQ form ─────────────────────────────────────────────────────────

function ManualMcqForm({ selectedChapter, selectedSubject, selectedSubSubject, toast, inputCls, selectCls }: any) {
  const [qText, setQText] = useState('');
  const [qA, setQA] = useState(''); const [qB, setQB] = useState('');
  const [qC, setQC] = useState(''); const [qD, setQD] = useState('');
  const [qAnswer, setQAnswer] = useState('A');
  const [qMarks, setQMarks] = useState('1');
  const [qDifficulty, setQDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [qTags, setQTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!selectedChapter) { setErr('Please select a chapter first.'); return; }
    if (!qText.trim()) { setErr('Question text is required.'); return; }
    if (!qA.trim() || !qB.trim() || !qC.trim() || !qD.trim()) { setErr('All 4 options are required for MCQ.'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('subject_id', selectedSubject);
      fd.append('chapter_id', selectedChapter);
      if (selectedSubSubject) fd.append('sub_subject_id', selectedSubSubject);
      fd.append('text', qText.trim());
      fd.append('option_a', qA.trim()); fd.append('option_b', qB.trim());
      fd.append('option_c', qC.trim()); fd.append('option_d', qD.trim());
      fd.append('correct_option', qAnswer);
      fd.append('difficulty', qDifficulty);
      fd.append('marks_weight', qMarks);
      if (qTags.trim()) fd.append('tags', qTags.trim());
      await api.post('/questions', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOk('MCQ question saved.');
      toast.success('MCQ added to your bank.');
      // Clear form but keep target for rapid entry
      setQText(''); setQA(''); setQB(''); setQC(''); setQD('');
      setQAnswer('A'); setQMarks('1'); setQTags('');
    } catch (e: any) {
      setErr(e?.response?.data?.error?.message ?? 'Failed to add question.');
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-blue-50 border-b border-blue-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-blue-800">Add one MCQ</h2>
        <p className="text-xs text-blue-500 mt-0.5">All 4 options + correct answer required.</p>
      </div>
      <form onSubmit={submit} className="p-6 space-y-4">
        {err && <ErrorBox>{err}</ErrorBox>}
        {ok && <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">✓ {ok}</div>}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question <span className="text-red-500">*</span></label>
          <textarea value={qText} onChange={e => setQText(e.target.value)} rows={3}
            placeholder="What is …?" className={`${inputCls} resize-none`} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[['A', qA, setQA], ['B', qB, setQB], ['C', qC, setQC], ['D', qD, setQD]].map(([letter, val, setter]: any) => (
            <div key={letter}>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Option {letter} <span className="text-red-500">*</span></label>
              <input type="text" value={val} onChange={(e) => setter(e.target.value)} placeholder={`Option ${letter}`} className={inputCls} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Correct <span className="text-red-500">*</span></label>
            <select value={qAnswer} onChange={(e) => setQAnswer(e.target.value)} className={selectCls}>
              {['A', 'B', 'C', 'D'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Marks</label>
            <input type="number" value={qMarks} onChange={(e) => setQMarks(e.target.value)} min="1" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Difficulty</label>
            <select value={qDifficulty} onChange={(e) => setQDifficulty(e.target.value as any)} className={selectCls}>
              <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tags</label>
            <input type="text" value={qTags} onChange={(e) => setQTags(e.target.value)} placeholder="physics;laws" className={inputCls} />
          </div>
        </div>

        <button type="submit" disabled={saving || !selectedChapter}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
          {saving ? 'Saving…' : 'Save MCQ'}
        </button>
        {!selectedChapter && <p className="text-center text-xs text-gray-400">Select a chapter above to enable</p>}
      </form>
    </div>
  );
}

// ─── Manual Subjective form ──────────────────────────────────────────────────

function ManualSubjectiveForm({ selectedChapter, selectedSubject, selectedSubSubject, toast, inputCls, selectCls }: any) {
  const [subType, setSubType] = useState<SubjectiveSubType>('SHORT_ANSWER');
  const [qText, setQText] = useState('');
  const [qAnswer, setQAnswer] = useState('');
  const [qMarks, setQMarks] = useState('3');
  const [qDifficulty, setQDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [qTags, setQTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  const meta = SUBTYPE_META[subType];
  const answerIsOptional = subType === 'SHORT_ANSWER' || subType === 'LONG_ANSWER';

  useEffect(() => {
    // Sensible marks default per sub-type
    if (subType === 'FILL_BLANK' || subType === 'ONE_WORD') setQMarks('1');
    else if (subType === 'SHORT_ANSWER') setQMarks('3');
    else if (subType === 'LONG_ANSWER') setQMarks('5');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subType]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!selectedChapter) { setErr('Please select a chapter first.'); return; }
    if (!qText.trim()) { setErr('Question text is required.'); return; }
    // Fill-blank / one-word: warn but allow if no expected answer
    if (!answerIsOptional && !qAnswer.trim()) {
      // Not blocking — just warn via toast; teacher can still save
      toast.error('Tip: fill-in-blank / one-word questions usually need a correct answer for the answer key.');
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('subject_id', selectedSubject);
      fd.append('chapter_id', selectedChapter);
      if (selectedSubSubject) fd.append('sub_subject_id', selectedSubSubject);
      fd.append('text', qText.trim());
      fd.append('sub_type', subType);
      if (qAnswer.trim()) fd.append('expected_answer', qAnswer.trim());
      fd.append('difficulty', qDifficulty);
      fd.append('marks_weight', qMarks);
      if (qTags.trim()) fd.append('tags', qTags.trim());
      await api.post('/questions', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setOk(`${meta.label} saved.`);
      toast.success('Subjective question added to your bank.');
      setQText(''); setQAnswer(''); setQTags('');
      // Keep sub-type + marks + difficulty for rapid entry
    } catch (e: any) {
      setErr(e?.response?.data?.error?.message ?? 'Failed to add question.');
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-amber-800">Add one subjective question</h2>
        <p className="text-xs text-amber-600 mt-0.5">Pick a sub-type, write the question, and (optionally) provide a model answer.</p>
      </div>
      <form onSubmit={submit} className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Left column: form */}
        <div className="lg:col-span-3 space-y-4">
          {err && <ErrorBox>{err}</ErrorBox>}
          {ok && <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">✓ {ok}</div>}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question type <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              {(['FILL_BLANK', 'ONE_WORD', 'SHORT_ANSWER', 'LONG_ANSWER'] as SubjectiveSubType[]).map((t) => (
                <button key={t} type="button" onClick={() => setSubType(t)}
                  className={`text-left rounded-xl border-2 p-3 transition ${
                    subType === t ? 'border-amber-500 bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                  <div className={`text-xs font-bold ${subType === t ? 'text-amber-700' : 'text-gray-700'}`}>{SUBTYPE_META[t].label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{SUBTYPE_META[t].hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Question <span className="text-red-500">*</span></label>
            <textarea value={qText} onChange={e => setQText(e.target.value)} rows={3}
              placeholder={meta.example}
              className={`${inputCls} resize-none`} />
            {subType === 'FILL_BLANK' && (
              <p className="text-xs text-gray-500 mt-1">Use <code className="bg-gray-100 px-1 rounded">___</code> where the blank should appear.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              {meta.expectedAnswerLabel}
              {answerIsOptional && <span className="ml-2 text-xs font-normal text-gray-400">Optional</span>}
            </label>
            <textarea value={qAnswer} onChange={e => setQAnswer(e.target.value)}
              rows={answerIsOptional ? 3 : 1}
              placeholder={answerIsOptional ? 'Model answer or marking scheme…' : 'Correct answer'}
              className={`${inputCls} resize-none`} />
            <p className="text-xs text-gray-500 mt-1">{meta.expectedAnswerHint}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Marks</label>
              <input type="number" value={qMarks} onChange={(e) => setQMarks(e.target.value)} min="1" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Difficulty</label>
              <select value={qDifficulty} onChange={(e) => setQDifficulty(e.target.value as any)} className={selectCls}>
                <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tags</label>
              <input type="text" value={qTags} onChange={(e) => setQTags(e.target.value)} placeholder="chapter;topic" className={inputCls} />
            </div>
          </div>

          <button type="submit" disabled={saving || !selectedChapter}
            className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
            {saving ? 'Saving…' : 'Save subjective question'}
          </button>
          {!selectedChapter && <p className="text-center text-xs text-gray-400">Select a chapter above to enable</p>}
        </div>

        {/* Right column: live preview */}
        <div className="lg:col-span-2">
          <div className="sticky top-4 bg-gray-50 border border-gray-200 rounded-2xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview on printed paper</p>
            <QuestionPreview subType={subType} text={qText || meta.example} marks={Number(qMarks) || 1} />
            <p className="text-xs text-gray-400 mt-3 italic">
              Answer space adjusts automatically — {subType === 'FILL_BLANK' ? 'inline blank hint' : subType === 'ONE_WORD' ? '1 short line' : subType === 'SHORT_ANSWER' ? '4 ruled lines' : '14 ruled lines'}.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}

// Print-preview mimicking what the renderer will output.
function QuestionPreview({ subType, text, marks }: { subType: SubjectiveSubType; text: string; marks: number }) {
  const marksBadge = <span className="text-xs text-gray-500 float-right">[{marks} mark{marks !== 1 ? 's' : ''}]</span>;
  if (subType === 'FILL_BLANK') {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200 text-sm">
        <div className="mb-2"><strong>1.</strong> {text} {marksBadge}</div>
        <div className="text-xs text-gray-500 pl-4">Ans: ______________________________</div>
      </div>
    );
  }
  if (subType === 'ONE_WORD') {
    return (
      <div className="bg-white rounded-lg p-3 border border-gray-200 text-sm">
        <div className="mb-2"><strong>1.</strong> {text} {marksBadge}</div>
        <div className="border-b-2 border-gray-500 h-4 ml-4 w-3/5" />
      </div>
    );
  }
  const lineCount = subType === 'SHORT_ANSWER' ? 4 : 14;
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200 text-sm">
      <div className="mb-2"><strong>1.</strong> {text} {marksBadge}</div>
      <div className="space-y-1.5 mt-2">
        {Array.from({ length: Math.min(lineCount, 6) }).map((_, i) => (
          <div key={i} className="border-b border-gray-300 h-4" />
        ))}
        {lineCount > 6 && <div className="text-xs text-gray-400 italic">…and {lineCount - 6} more lines</div>}
      </div>
    </div>
  );
}
