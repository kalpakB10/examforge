/**
 * NewExamWizard — the "best question paper builder" flow.
 *
 * 5 clean steps, one screen per step, progressive disclosure, live validation,
 * board-style presets, deterministic sampling with lock-in seed, and on-demand
 * A4 preview before publish.
 *
 * Steps:
 *   1. Foundation  — class, subject, exam heading, date, duration
 *   2. Preset      — pick a board template or start blank
 *   3. Sections    — build multi-type sections with live availability
 *   4. Sample      — see the exact questions, reshuffle, approve  (SKIPPABLE)
 *   5. Publish     — delivery options, live A4 preview, create the exam
 *
 * Ships with:
 *   - Draft auto-save to localStorage (survives browser crashes)
 *   - Idempotent publish (double-click can't create two exams)
 *   - Seed lock-in (the approved sample IS the printed paper)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api';
import type { Section, SubjectiveSubType } from './types';
import { newSection } from './types';
import { useReferenceData, fetchScopeCount } from './useReferenceData';
import SectionEditor from './SectionEditor';
import { PRESETS, getPreset } from './presets';

// ─── Reused types (moved from TeacherExamsPage to keep the wizard self-contained)

interface OrgSettings { orgName: string; address: string; logoText: string; logoUrl?: string; examTitle: string }
interface PaperTemplate { id: string; name: string }
interface ExamClassSummary {
  id: string;
  name: string;
  defaultTemplateId?: string | null;
  defaultOrgSnapshot?: {
    orgName?: string; address?: string; logoText?: string; logoUrl?: string;
    examTitle?: string; footerText?: string;
  } | null;
}

interface Props {
  onCreated: (examId: string) => void;
  onCancel: () => void;
  showToast: (msg: string) => void;
}

// ─── Helpers

const DRAFT_KEY = 'examforge-draft-wizard-v1';
const ORG_KEY = 'examforge-org-settings';
const DEFAULTS_KEY = 'examforge-my-defaults-v1';
const AUTO_SAVE_INTERVAL_MS = 10_000;

interface MyDefaults {
  org?: OrgSettings;
  templateId?: string;
  footerText?: string;
}

function loadOrgSettings(): OrgSettings {
  try {
    const raw = localStorage.getItem(ORG_KEY);
    if (raw) return { orgName: '', address: '', logoText: '', logoUrl: undefined, examTitle: '', ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { orgName: '', address: '', logoText: '', logoUrl: undefined, examTitle: '' };
}
function saveOrgSettings(s: OrgSettings) { try { localStorage.setItem(ORG_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

function loadMyDefaults(): MyDefaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}
function saveMyDefaults(d: MyDefaults) { try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function clearMyDefaults() { try { localStorage.removeItem(DEFAULTS_KEY); } catch { /* ignore */ } }

function defaultExpiry(): string {
  // Local datetime-input format for 7 days from now.
  const d = new Date(); d.setDate(d.getDate() + 7);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface DraftPayload {
  step: number;
  classId: string;
  subjectId: string;
  title: string;
  paperTitle: string;
  date: string;
  durationMinutes: string;
  examCode: string;
  expiresAt: string;
  negativeMarking: boolean;
  negativeMarksValue: string;
  presetId: string;
  sections: Section[];
  org: OrgSettings;
  footerText: string;
  templateId: string;
  deliverInteractive: boolean;
  deliverPdf: boolean;
  generalInstructions: string;
  numVariants: number;
  lockedSeed: number | null;
}

// Convert composition to the backend payload shape.
function compositionPayload(sections: Section[]) {
  return sections.map((s) => ({
    title: s.title,
    type: s.type,
    subType: s.type === 'SUBJECTIVE' ? (s.subType ?? 'SHORT_ANSWER') : undefined,
    attemptAny: s.attemptAny && s.attemptAny > 0 && s.attemptAny < s.numQuestions ? s.attemptAny : undefined,
    instructions: s.instructions?.trim() || undefined,
    marksPerQuestion: s.marksPerQuestion,
    numQuestions: s.numQuestions,
    blankLines: s.type === 'SUBJECTIVE' ? s.blankLines : undefined,
    // G.2: 4 scope shapes serialise as different backend payload keys.
    scope: s.scopeMode === 'chapters'   ? { chapterIds: s.chapterIds }
         : s.scopeMode === 'subjects'   ? { subjectIds: s.subjectIds }
         : s.scopeMode === 'subSubject' ? { subSubjectId: s.subSubjectId }
         :                                 { classId: s.classId },
    shuffle: s.shuffle,
    distributeAcrossChapters: s.distributeAcrossChapters,
    difficulty: s.useDifficultyMix ? s.difficultyMix : undefined,
  }));
}

// ─── The wizard

export default function NewExamWizard({ onCreated, onCancel, showToast }: Props) {
  const refData = useReferenceData();

  // ── State ───────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [showResumeBanner, setShowResumeBanner] = useState(false);

  // Step 1
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [loadedClass, setLoadedClass] = useState<ExamClassSummary | null>(null);
  const [title, setTitle] = useState('');
  const [paperTitle, setPaperTitle] = useState('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [durationMinutes, setDurationMinutes] = useState('60');

  // Step 2
  const [presetId, setPresetId] = useState<string>('');

  // Step 3 (sections)
  const [sections, setSections] = useState<Section[]>([newSection()]);

  // Step 4 (sample)
  const [samplePreview, setSamplePreview] = useState<any | null>(null);
  const [sampling, setSampling] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const [lockedSeed, setLockedSeed] = useState<number | null>(null);
  const [skipSample, setSkipSample] = useState(false);

  // Step 5
  const [org, setOrg] = useState<OrgSettings>(loadOrgSettings);
  const [footerText, setFooterText] = useState('');
  const [templates, setTemplates] = useState<PaperTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [examCode, setExamCode] = useState('');
  const [expiresAt, setExpiresAt] = useState<string>(defaultExpiry());
  const [negativeMarking, setNegativeMarking] = useState(false);
  const [negativeMarksValue, setNegativeMarksValue] = useState('0.5');
  const [deliverInteractive, setDeliverInteractive] = useState(true);
  const [deliverPdf, setDeliverPdf] = useState(true);
  const [generalInstructions, setGeneralInstructions] = useState<string>(
    'All questions are compulsory except where internal choice is provided.\nUse blue or black ballpoint pen only.\nDo not write anything in the margin.'
  );
  const [numVariants, setNumVariants] = useState(1);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  // Once the teacher has manually edited the org header, template, or footer
  // (or loaded from a draft), NEVER let a class-switch silently overwrite
  // their work. The class-defaults auto-fill only fires on the first classId
  // pick when the header is still pristine.
  const headerTouchedRef = useRef<boolean>(false);
  // Same protection for duration: once the teacher types their own value in
  // Step 1, don't let a preset silently overwrite it. The previous check
  // (`durationMinutes === '60'`) couldn't distinguish "still default" from
  // "intentionally set to 60".
  const durationTouchedRef = useRef<boolean>(false);

  // ── Load templates + subjects when class changes ────────────────────────────
  useEffect(() => {
    api.get('/paper-templates').then((r) => {
      const list: PaperTemplate[] = r.data?.data?.templates ?? [];
      setTemplates(Array.isArray(list) ? list : []);
    }).catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (!classId) { setLoadedClass(null); return; }
    refData.loadClassSubjects(classId);
    api.get(`/classes/${classId}`).then((r) => {
      const cls = r.data?.data as ExamClassSummary;
      setLoadedClass(cls);
      // If the teacher has already customized the header, don't overwrite it
      // when they switch classes — their edits win.
      if (headerTouchedRef.current) return;
      // Only source of auto-fill now: the teacher's own saved "my defaults"
      // (class-level defaults were removed as they duplicated the wizard's
      // per-exam setup less well).
      const my = loadMyDefaults();
      if (my.templateId) setTemplateId(my.templateId);
      if (my.org) {
        setOrg({
          orgName: my.org.orgName ?? org.orgName ?? '',
          address: my.org.address ?? org.address ?? '',
          logoText: my.org.logoText ?? org.logoText ?? '',
          logoUrl: my.org.logoUrl ?? org.logoUrl,
          examTitle: my.org.examTitle ?? org.examTitle ?? '',
        });
        if (my.footerText !== undefined) setFooterText(my.footerText ?? '');
      }
    }).catch(() => setLoadedClass(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  // When only one class or subject exists, auto-pick to save a click.
  useEffect(() => {
    if (!classId && refData.classes.length === 1) setClassId(refData.classes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refData.classes]);

  useEffect(() => {
    const subjects = classId ? (refData.subjectsByClass[classId] ?? []) : [];
    if (classId && !subjectId && subjects.length === 1) setSubjectId(subjects[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, refData.subjectsByClass]);

  // Auto-suggest paperTitle from title once user types the title
  useEffect(() => {
    if (!paperTitle && title.trim()) setPaperTitle(title.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Fallback template selection when no class default exists.
  useEffect(() => {
    if (!templateId && templates.length > 0) {
      const preferred = templates.find((t) => t.name === 'Classic Indian School') || templates[0];
      setTemplateId(preferred.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  // ── Draft auto-save + resume ────────────────────────────────────────────────
  useEffect(() => {
    // On mount: check for an existing draft. If found, show resume banner.
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setShowResumeBanner(true);
    } catch { /* ignore */ }
  }, []);

  const dumpDraft = useCallback((): DraftPayload => ({
    step, classId, subjectId, title, paperTitle, date, durationMinutes,
    examCode, expiresAt, negativeMarking, negativeMarksValue,
    presetId, sections, org, footerText, templateId,
    deliverInteractive, deliverPdf, generalInstructions,
    numVariants, lockedSeed,
  }), [step, classId, subjectId, title, paperTitle, date, durationMinutes,
       examCode, expiresAt, negativeMarking, negativeMarksValue,
       presetId, sections, org, footerText, templateId,
       deliverInteractive, deliverPdf, generalInstructions,
       numVariants, lockedSeed]);

  useEffect(() => {
    const id = setInterval(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(dumpDraft())); } catch { /* ignore */ }
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [dumpDraft]);

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as DraftPayload;
      if (d.classId) setClassId(d.classId);
      if (d.subjectId) setSubjectId(d.subjectId);
      if (d.title) setTitle(d.title);
      if (d.paperTitle) setPaperTitle(d.paperTitle);
      if (d.date) setDate(d.date);
      if (d.durationMinutes) { setDurationMinutes(d.durationMinutes); durationTouchedRef.current = true; }
      if (d.examCode) setExamCode(d.examCode);
      if (d.expiresAt) setExpiresAt(d.expiresAt);
      if (typeof d.negativeMarking === 'boolean') setNegativeMarking(d.negativeMarking);
      if (d.negativeMarksValue) setNegativeMarksValue(d.negativeMarksValue);
      if (d.presetId) setPresetId(d.presetId);
      if (Array.isArray(d.sections) && d.sections.length > 0) setSections(d.sections);
      if (d.org) { setOrg(d.org); headerTouchedRef.current = true; }
      if (typeof d.footerText === 'string') { setFooterText(d.footerText); headerTouchedRef.current = true; }
      if (d.templateId) { setTemplateId(d.templateId); headerTouchedRef.current = true; }
      if (typeof d.deliverInteractive === 'boolean') setDeliverInteractive(d.deliverInteractive);
      if (typeof d.deliverPdf === 'boolean') setDeliverPdf(d.deliverPdf);
      if (typeof d.generalInstructions === 'string') setGeneralInstructions(d.generalInstructions);
      if (typeof d.numVariants === 'number') setNumVariants(d.numVariants);
      if (typeof d.lockedSeed === 'number') setLockedSeed(d.lockedSeed);
      if (typeof d.step === 'number') setStep(d.step);
      setShowResumeBanner(false);
      showToast('Draft restored.');
    } catch {
      showToast('Could not restore draft.');
    }
  }
  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setShowResumeBanner(false);
  }

  // ── Live availability per section ──────────────────────────────────────────
  // Recompute per-section counts whenever the section's scope or type changes.
  // Supports all 4 scope shapes (class / subSubject / subjects / chapters).
  useEffect(() => {
    const sectionIsReady = (s: Section): boolean => {
      if (s.scopeMode === 'chapters')  return s.chapterIds.length > 0;
      if (s.scopeMode === 'subjects')  return s.subjectIds.length > 0;
      if (s.scopeMode === 'subSubject') return !!s.subSubjectId;
      if (s.scopeMode === 'class')      return !!s.classId;
      return false;
    };
    // Only kick off a fetch for sections that (a) have a ready scope, (b) don't
    // yet have a count, AND (c) aren't already loading. Without the loadingCount
    // guard, the setSections below re-triggers this effect, sees availableCount
    // still undefined, and fires another request — an infinite loop hammering
    // /scope-stats until the browser returns ERR_INSUFFICIENT_RESOURCES.
    const stale = sections.filter((s) => s.availableCount === undefined && !s.loadingCount && sectionIsReady(s));
    if (stale.length === 0) return;
    stale.forEach(async (sec) => {
      setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, loadingCount: true } : s));
      let selector;
      if (sec.scopeMode === 'chapters')       selector = { mode: 'chapters' as const, ids: sec.chapterIds };
      else if (sec.scopeMode === 'subjects')  selector = { mode: 'subjects' as const, ids: sec.subjectIds };
      else if (sec.scopeMode === 'subSubject') selector = { mode: 'subSubject' as const, id: sec.subSubjectId! };
      else                                     selector = { mode: 'class' as const, id: sec.classId! };
      const count = await fetchScopeCount(selector, sec.type, sec.subType);
      setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, availableCount: count ?? 0, loadingCount: false } : s));
    });
  }, [sections]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const totalQuestions = sections.reduce((a, s) => {
    const eff = s.attemptAny && s.attemptAny < s.numQuestions ? s.attemptAny : s.numQuestions;
    return a + eff;
  }, 0);
  const totalMarks = sections.reduce((a, s) => {
    const eff = s.attemptAny && s.attemptAny < s.numQuestions ? s.attemptAny : s.numQuestions;
    return a + eff * s.marksPerQuestion;
  }, 0);
  const hasAnyMcq = sections.some((s) => s.type === 'MCQ');
  const allSectionsHaveScope = sections.every((s) =>
    (s.scopeMode === 'chapters'   && s.chapterIds.length > 0)
    || (s.scopeMode === 'subjects'   && s.subjectIds.length > 0)
    || (s.scopeMode === 'subSubject' && !!s.subSubjectId)
    || (s.scopeMode === 'class'      && !!s.classId)
  );
  const allSectionsHaveEnoughQuestions = sections.every((s) =>
    s.availableCount === undefined || s.availableCount >= s.numQuestions
  );
  const step1Valid = !!classId && !!subjectId && !!title.trim() && !!durationMinutes && Number(durationMinutes) > 0;
  const step3Valid = sections.length > 0 && allSectionsHaveScope && allSectionsHaveEnoughQuestions;
  const step5Valid = step1Valid && step3Valid && !!org.orgName.trim() && !!templateId && (deliverInteractive || deliverPdf);

  // Enforce online delivery invariant: interactive needs at least one MCQ section
  useEffect(() => {
    if (!hasAnyMcq && deliverInteractive) setDeliverInteractive(false);
  }, [hasAnyMcq, deliverInteractive]);

  // ── Actions ────────────────────────────────────────────────────────────────
  function applyPreset(id: string) {
    const p = getPreset(id);
    if (!p) return;
    setPresetId(id);
    setSections(p.buildSections());
    // Only adopt the preset's suggested duration if the teacher hasn't typed
    // their own value yet. The previous magic-string check couldn't tell "still
    // default" from "intentionally 60".
    if (!durationTouchedRef.current) setDurationMinutes(String(p.durationMinutes));
    // Reset any locked seed since the composition changed.
    setLockedSeed(null); setSamplePreview(null);
  }

  function addSection() { setSections((prev) => [...prev, newSection()]); setLockedSeed(null); setSamplePreview(null); }
  function updateSection(id: string, patch: Partial<Section>) {
    // Only invalidate availableCount when something that actually affects the
    // scope query changes. Typing a title or tweaking marks shouldn't nuke
    // the count and trigger a re-fetch loop.
    const scopeFields: (keyof Section)[] = ['scopeMode', 'classId', 'subSubjectId', 'subjectIds', 'chapterIds', 'type', 'subType'];
    const scopeChanged = scopeFields.some((k) => k in patch);
    setSections((prev) => prev.map((s) => s.id === id
      ? { ...s, ...patch, ...(scopeChanged ? { availableCount: undefined, loadingCount: false } : {}) }
      : s));
    setLockedSeed(null); setSamplePreview(null);
  }
  function removeSection(id: string) {
    setSections((prev) => prev.length > 1 ? prev.filter((s) => s.id !== id) : prev);
    setLockedSeed(null); setSamplePreview(null);
  }
  function duplicateSection(id: string) {
    const src = sections.find((s) => s.id === id);
    if (!src) return;
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const copy = newSection({ ...src, title: `${src.title} (copy)` });
      const next = [...prev]; next.splice(idx + 1, 0, copy); return next;
    });
    setLockedSeed(null); setSamplePreview(null);
  }
  function moveSection(id: string, dir: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setLockedSeed(null); setSamplePreview(null);
  }

  const previewPayload = useCallback((seed?: number) => ({
    org, paperTitle: paperTitle.trim() || title.trim(),
    date, totalTime: Number(durationMinutes) || 60,
    instructions: generalInstructions.split('\n').filter((l) => l.trim()),
    sections: compositionPayload(sections),
    templateId,
    footerText: footerText.trim() || undefined,
    seed,
  }), [org, paperTitle, title, date, durationMinutes, generalInstructions, sections, templateId, footerText]);

  async function generateSample(newSeed = true) {
    setSampling(true); setSampleError('');
    try {
      const seed = newSeed ? undefined : (lockedSeed ?? samplePreview?.seed);
      const r = await api.post('/generate-paper/preview', previewPayload(seed));
      setSamplePreview(r.data?.data);
      setLockedSeed(r.data?.data?.seed);
    } catch (err: any) {
      setSampleError(err?.response?.data?.error?.message ?? 'Could not sample questions.');
      setSamplePreview(null);
    } finally { setSampling(false); }
  }

  async function refreshPreviewHtml() {
    // Use locked seed if we have one so preview matches step-4 sample.
    setPreviewLoading(true);
    try {
      const r = await api.post('/generate-paper/preview', previewPayload(lockedSeed ?? undefined));
      const rawHtml = r.data?.data?.html as string | undefined;
      setPreviewHtml(rawHtml ? wrapForA4Preview(rawHtml) : null);
      if (r.data?.data?.seed && !lockedSeed) setLockedSeed(r.data?.data?.seed);
    } catch { setPreviewHtml(null); }
    finally { setPreviewLoading(false); }
  }

  async function handlePublish() {
    setPublishError(''); setPublishing(true);
    saveOrgSettings(org);
    try {
      const payload = {
        title: title.trim(),
        subjectId,
        examCode: examCode.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        durationMinutes: Number(durationMinutes) || 60,
        negativeMarking, negativeMarksValue: negativeMarking ? Number(negativeMarksValue) : 0,
        composition: compositionPayload(sections),
        templateId,
        paperTitle: paperTitle.trim() || title.trim(),
        date,
        totalTime: Number(durationMinutes) || 60,
        instructions: generalInstructions.split('\n').filter((l) => l.trim()),
        org,
        footerText: footerText.trim() || undefined,
        deliverInteractive, deliverPdf,
        shufflePapers: numVariants > 1 ? numVariants : undefined,
        // Seed lock-in: the paper we generate is the exact one the teacher approved.
        seed: lockedSeed ?? undefined,
      };
      const res = await api.post('/exams', payload, {
        headers: { 'Idempotency-Key': idempotencyKeyRef.current },
      });
      // Clear draft on successful publish
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      showToast('Exam created!');
      onCreated(res.data?.data?.exam?.id);
    } catch (err: any) {
      setPublishError(err?.response?.data?.error?.message ?? 'Failed to create exam.');
    } finally { setPublishing(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const subjectsForClass = classId ? (refData.subjectsByClass[classId] ?? []) : [];
  const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white';

  return (
    <div className="max-w-5xl">
      {/* Resume banner */}
      {showResumeBanner && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="text-xl">📝</div>
          <div className="flex-1 text-sm text-amber-800">
            <strong>Unsaved draft found.</strong> Continue where you left off?
          </div>
          <button onClick={restoreDraft}
            className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700">
            Restore
          </button>
          <button onClick={discardDraft}
            className="px-3 py-1.5 bg-white border border-amber-300 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100">
            Start fresh
          </button>
        </div>
      )}

      {/* Stepper */}
      <Stepper step={step}
        steps={['Foundation', 'Preset', 'Sections', 'Sample', 'Publish']}
        canJump={{ 1: true, 2: step1Valid, 3: step1Valid, 4: step1Valid && step3Valid, 5: step1Valid && step3Valid }}
        onJump={(n) => setStep(n)} />

      {/* Step content */}
      <div className="mt-2">
        {step === 1 && (
          <Step1Foundation
            classes={refData.classes}
            loadingClasses={refData.loadingClasses}
            subjects={subjectsForClass}
            classId={classId} setClassId={setClassId}
            subjectId={subjectId} setSubjectId={setSubjectId}
            title={title} setTitle={setTitle}
            paperTitle={paperTitle} setPaperTitle={setPaperTitle}
            date={date} setDate={setDate}
            durationMinutes={durationMinutes} setDurationMinutes={(v: string) => { durationTouchedRef.current = true; setDurationMinutes(v); }}
            loadedClass={loadedClass}
            inputCls={inputCls}
          />
        )}
        {step === 2 && (
          <Step2Preset presetId={presetId} onPick={applyPreset} />
        )}
        {step === 3 && (
          <Step3Sections
            sections={sections}
            refData={refData}
            onAdd={addSection}
            onUpdate={updateSection}
            onRemove={removeSection}
            onDuplicate={duplicateSection}
            onMove={moveSection}
            totalQuestions={totalQuestions}
            totalMarks={totalMarks}
            durationMinutes={Number(durationMinutes)}
          />
        )}
        {step === 4 && (
          <Step4Sample
            sampling={sampling}
            samplePreview={samplePreview}
            sampleError={sampleError}
            lockedSeed={lockedSeed}
            skipSample={skipSample} setSkipSample={setSkipSample}
            onGenerate={() => generateSample(true)}
            onReshuffle={() => generateSample(true)}
          />
        )}
        {step === 5 && (
          <Step5Publish
            org={org} setOrg={(o: OrgSettings) => { headerTouchedRef.current = true; setOrg(o); }}
            footerText={footerText} setFooterText={(v: string) => { headerTouchedRef.current = true; setFooterText(v); }}
            templates={templates}
            templateId={templateId} setTemplateId={(v: string) => { headerTouchedRef.current = true; setTemplateId(v); }}
            examCode={examCode} setExamCode={setExamCode}
            expiresAt={expiresAt} setExpiresAt={setExpiresAt}
            negativeMarking={negativeMarking} setNegativeMarking={setNegativeMarking}
            negativeMarksValue={negativeMarksValue} setNegativeMarksValue={setNegativeMarksValue}
            deliverInteractive={deliverInteractive} setDeliverInteractive={setDeliverInteractive}
            deliverPdf={deliverPdf} setDeliverPdf={setDeliverPdf}
            generalInstructions={generalInstructions} setGeneralInstructions={setGeneralInstructions}
            numVariants={numVariants} setNumVariants={setNumVariants}
            hasAnyMcq={hasAnyMcq}
            previewHtml={previewHtml}
            previewLoading={previewLoading}
            onRefreshPreview={refreshPreviewHtml}
            onSaveMyDefaults={() => {
              saveMyDefaults({ org, templateId, footerText });
              showToast('Saved as your default setup — pre-fills the next exam.');
            }}
            onLoadMyDefaults={() => {
              const d = loadMyDefaults();
              if (!d.org && !d.templateId && !d.footerText) {
                showToast('No saved defaults yet — save one first.');
                return;
              }
              if (d.org) setOrg({ ...org, ...d.org });
              if (d.templateId) setTemplateId(d.templateId);
              if (d.footerText !== undefined) setFooterText(d.footerText);
              headerTouchedRef.current = true;
              showToast('Loaded your saved defaults.');
            }}
            onClearMyDefaults={() => {
              clearMyDefaults();
              showToast('Cleared your default setup.');
            }}
            hasMyDefaults={!!loadMyDefaults().org?.orgName}
            totalMarks={totalMarks}
            totalQuestions={totalQuestions}
            lockedSeed={lockedSeed}
            inputCls={inputCls}
          />
        )}
      </div>

      {/* Bottom nav */}
      <div className="mt-6 flex items-center justify-between gap-3 pt-4 border-t border-gray-200">
        <button onClick={step === 1 ? onCancel : () => setStep(step - 1)}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200">
          {step === 1 ? 'Cancel' : '← Back'}
        </button>
        <div className="text-xs text-gray-400">
          {step === 1 ? 'Start with the basics' :
           step === 2 ? 'Pick a preset or continue with your own' :
           step === 3 ? `${sections.length} section${sections.length !== 1 ? 's' : ''} · ${totalQuestions} Qs · ${totalMarks} marks` :
           step === 4 ? (lockedSeed ? `Seed locked: ${lockedSeed}` : 'Sample the questions before publishing') :
           'Review, preview, and publish'}
        </div>
        {step < 5 && (
          <button onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !step1Valid) || (step === 3 && !step3Valid)}
            className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
            Continue →
          </button>
        )}
        {step === 5 && (
          <button onClick={handlePublish}
            disabled={!step5Valid || publishing}
            className="px-5 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-40">
            {publishing ? 'Publishing…' : 'Publish Exam'}
          </button>
        )}
      </div>

      {step === 5 && publishError && (
        <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{publishError}</div>
      )}
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────────

function Stepper({ step, steps, canJump, onJump }: {
  step: number; steps: string[];
  canJump: Record<number, boolean>;
  onJump: (n: number) => void;
}) {
  return (
    <div className="py-2">
      <div className="flex items-center gap-1">
        {steps.map((_, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          const enabled = canJump[n];
          return (
            <div key={n} className="flex items-center flex-1">
              <button type="button" disabled={!enabled} onClick={() => enabled && onJump(n)}
                title={steps[i]}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition
                  ${done ? 'bg-green-600 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'}
                  ${enabled ? 'cursor-pointer hover:opacity-80' : 'cursor-not-allowed'}`}>
                {done ? '✓' : n}
              </button>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 ${done ? 'bg-green-600' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>
      <div className="grid text-xs text-center mt-2 mb-4 text-gray-500" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((s, i) => (
          <div key={s} className={i + 1 === step ? 'text-indigo-700 font-semibold' : ''}>{s}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Foundation ─────────────────────────────────────────────────────────

function Step1Foundation(props: {
  classes: Array<{ id: string; name: string }>;
  loadingClasses: boolean;
  subjects: Array<{ id: string; name: string }>;
  classId: string; setClassId: (v: string) => void;
  subjectId: string; setSubjectId: (v: string) => void;
  title: string; setTitle: (v: string) => void;
  paperTitle: string; setPaperTitle: (v: string) => void;
  date: string; setDate: (v: string) => void;
  durationMinutes: string; setDurationMinutes: (v: string) => void;
  loadedClass: ExamClassSummary | null;
  inputCls: string;
}) {
  const { classes, loadingClasses, subjects, classId, setClassId, subjectId, setSubjectId,
          title, setTitle, paperTitle, setPaperTitle, date, setDate,
          durationMinutes, setDurationMinutes, inputCls } = props;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-1">Foundation</h2>
        <p className="text-xs text-gray-400">Pick which class and subject this paper is for. Everything else auto-fills.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Class <span className="text-red-500">*</span></label>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputCls}>
            <option value="">— Select class —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {!loadingClasses && classes.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No classes yet. <Link to="/teacher/classes" className="underline">Create one</Link>.</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Subject <span className="text-red-500">*</span></label>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputCls} disabled={!classId}>
            <option value="">— Select subject —</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {classId && subjects.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">This class has no subjects. <Link to={`/teacher/classes/${classId}`} className="underline">Add one</Link>.</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Exam title <span className="text-red-500">*</span></label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Physics Half-Yearly 2026" className={inputCls} />
        <p className="text-xs text-gray-400 mt-1">Shown in your dashboard + used as the default paper title.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Date on paper</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Duration (min) <span className="text-red-500">*</span></label>
          <input type="number" min={5} max={600} value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Printed title <span className="text-gray-400 font-normal">(if different)</span></label>
          <input type="text" value={paperTitle} onChange={(e) => setPaperTitle(e.target.value)}
            placeholder="Same as exam title" className={inputCls} />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Preset ─────────────────────────────────────────────────────────────

function Step2Preset({ presetId, onPick }: { presetId: string; onPick: (id: string) => void }) {
  const tagColor: Record<string, string> = {
    CBSE: 'bg-blue-50 text-blue-700 border-blue-200',
    STATE: 'bg-purple-50 text-purple-700 border-purple-200',
    COACHING: 'bg-red-50 text-red-700 border-red-200',
    CUSTOM: 'bg-gray-100 text-gray-700 border-gray-300',
  };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Pick a paper template</h2>
        <p className="text-xs text-gray-400 mb-5">Choose a board-style preset to auto-fill sections in the next step. You can still edit anything.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => onPick(p.id)}
              className={`text-left rounded-2xl border-2 p-4 transition
                ${presetId === p.id
                  ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="font-bold text-sm text-gray-900">{p.name}</div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${tagColor[p.tag]}`}>{p.tag}</span>
              </div>
              <p className="text-xs text-gray-500 mb-3 leading-relaxed">{p.description}</p>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>📄 {p.sectionCount} sections</span>
                <span>🎯 {p.totalMarks} marks</span>
                <span>⏱ {p.durationMinutes} min</span>
              </div>
            </button>
          ))}
        </div>

        {presetId && (
          <div className="mt-4 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5">
            ✓ Preset applied. Move on to Step 3 to fine-tune sections and pick chapter scope.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Sections ───────────────────────────────────────────────────────────

function Step3Sections(props: {
  sections: Section[];
  refData: ReturnType<typeof useReferenceData>;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Section>) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
}) {
  const { sections, refData, onAdd, onUpdate, onRemove, onDuplicate, onMove, totalQuestions, totalMarks, durationMinutes } = props;
  return (
    <div className="space-y-4">
      {/* Running totals bar */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-wrap items-center gap-4 text-sm">
        <span className="font-semibold text-indigo-800">Paper totals:</span>
        <Metric label="Sections" value={sections.length} />
        <Metric label="Questions" value={totalQuestions} />
        <Metric label="Marks" value={totalMarks} />
        <Metric label="Duration" value={`${durationMinutes} min`} />
      </div>

      {sections.map((sec, idx) => (
        <div key={sec.id} className="relative">
          <div className="absolute top-3 left-1 flex flex-col gap-0.5 z-10">
            <button onClick={() => onMove(sec.id, -1)} disabled={idx === 0}
              className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">▲</button>
            <button onClick={() => onMove(sec.id, +1)} disabled={idx === sections.length - 1}
              className="w-6 h-6 rounded flex items-center justify-center text-xs text-gray-400 hover:text-indigo-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed">▼</button>
          </div>
          <div className="ml-8">
            <SectionEditor
              idx={idx}
              section={sec}
              classes={refData.classes}
              subjectsByClass={refData.subjectsByClass}
              chaptersBySubject={refData.chaptersBySubject}
              subSubjectsBySubject={refData.subSubjectsBySubject}
              loadClassSubjects={refData.loadClassSubjects}
              loadSubjectChapters={refData.loadSubjectChapters}
              loadSubjectSubSubjects={refData.loadSubjectSubSubjects}
              onChange={(patch) => onUpdate(sec.id, patch)}
              onRemove={() => onRemove(sec.id)}
              onDuplicate={() => onDuplicate(sec.id)}
            />
          </div>
        </div>
      ))}

      <button onClick={onAdd}
        className="w-full bg-white border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 rounded-2xl py-4 text-sm font-semibold text-gray-500 hover:text-indigo-700 transition-all">
        + Add another section
      </button>
    </div>
  );
}

// Wrap the server-rendered paper HTML so it renders as a scaled A4 page inside
// the wizard iframe (instead of squishing to the iframe's narrow width).
// The iframe's own width is variable, so we set the .page to fixed 794px (A4 at
// 96dpi), and scale-to-fit via CSS custom property + a small resize script.
function wrapForA4Preview(rawHtml: string): string {
  const overlay = `
    <style>
      html, body { background: #eef2f7 !important; }
      body { padding: 12px 0 !important; }
      .page {
        width: 794px !important;
        min-height: 1123px;
        background: #fff !important;
        margin: 0 auto !important;
        box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        transform-origin: top center;
      }
    </style>
    <script>
      (function() {
        function fit() {
          var p = document.querySelector('.page');
          if (!p) return;
          var avail = document.documentElement.clientWidth - 16;
          var scale = Math.min(1, avail / 794);
          p.style.transform = 'scale(' + scale + ')';
          p.style.marginBottom = ((scale - 1) * p.offsetHeight) + 'px';
        }
        window.addEventListener('load', fit);
        window.addEventListener('resize', fit);
        setTimeout(fit, 50);
      })();
    </script>`;
  if (rawHtml.includes('</head>')) return rawHtml.replace('</head>', overlay + '</head>');
  return overlay + rawHtml;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-lg font-bold text-indigo-900">{value}</span>
      <span className="text-xs text-indigo-600">{label}</span>
    </div>
  );
}

// ─── Step 4: Sample ─────────────────────────────────────────────────────────────

function Step4Sample(props: {
  sampling: boolean;
  samplePreview: any | null;
  sampleError: string;
  lockedSeed: number | null;
  skipSample: boolean; setSkipSample: (v: boolean) => void;
  onGenerate: () => void;
  onReshuffle: () => void;
}) {
  const { sampling, samplePreview, sampleError, lockedSeed, skipSample, setSkipSample, onGenerate, onReshuffle } = props;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-1">Preview the questions</h2>
            <p className="text-xs text-gray-500 max-w-lg">
              See the exact questions that will appear in your paper. Not happy with the pick?
              Hit <strong>Reshuffle</strong> for a fresh draw. When it looks right, continue —
              the paper you print will be exactly what you approved.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!samplePreview && !sampling && (
              <button onClick={onGenerate}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700">
                Sample questions
              </button>
            )}
            {samplePreview && !sampling && (
              <button onClick={onReshuffle}
                className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600">
                🔀 Reshuffle
              </button>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={skipSample} onChange={(e) => setSkipSample(e.target.checked)} />
          I'm confident — skip this step next time (you can always reshuffle later).
        </label>

        {sampling && (
          <div className="mt-6 text-center py-10 text-sm text-gray-500">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Sampling questions…
          </div>
        )}

        {sampleError && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            ⚠ {sampleError}
          </div>
        )}

        {samplePreview && !sampling && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 text-xs">
              <span className="bg-green-50 text-green-700 border border-green-200 px-2 py-1 rounded font-semibold">
                ✓ Seed locked: {lockedSeed}
              </span>
              <span className="text-gray-500">
                {samplePreview.totals.totalQuestions} questions · {samplePreview.totals.totalMarks} marks
              </span>
            </div>

            {samplePreview.sections.map((sec: any, si: number) => (
              <details key={si} open className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <summary className="cursor-pointer flex items-center justify-between gap-3">
                  <span className="font-bold text-sm text-gray-800">
                    {sec.title} — {sec.type === 'MCQ' ? 'MCQ' : (sec.subType ? SUBTYPE_LABELS[sec.subType as SubjectiveSubType] : 'Subjective')}
                  </span>
                  <span className="text-xs text-gray-500 font-medium">
                    {sec.questions.length} × {sec.marksPerQuestion} = {sec.questions.length * sec.marksPerQuestion} marks
                    {sec.attemptAny && sec.attemptAny < sec.questions.length && ` · attempt any ${sec.attemptAny}`}
                  </span>
                </summary>
                <ol className="mt-3 space-y-2 text-sm">
                  {sec.questions.map((q: any, qi: number) => (
                    <li key={q.id} className="flex gap-2 bg-white rounded-lg p-3 border border-gray-100">
                      <span className="font-bold text-indigo-600 shrink-0 w-6 text-right">{qi + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-800">{q.text}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                          <span className={`px-1.5 py-0.5 rounded ${
                            q.difficulty === 'EASY' ? 'bg-green-50 text-green-700' :
                            q.difficulty === 'HARD' ? 'bg-red-50 text-red-700' :
                            'bg-amber-50 text-amber-700'}`}>
                            {q.difficulty}
                          </span>
                          {q.chapter && <span>· {q.chapter}</span>}
                          {q.yearTag && <span>· [{q.yearTag}]</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SUBTYPE_LABELS: Record<SubjectiveSubType, string> = {
  FILL_BLANK: 'Fill in the Blanks',
  ONE_WORD: 'One-Word Answer',
  SHORT_ANSWER: 'Short Answer',
  LONG_ANSWER: 'Long Answer',
};

// ─── Step 5: Publish ────────────────────────────────────────────────────────────

function Step5Publish(props: any) {
  const {
    org, setOrg, footerText, setFooterText,
    templates, templateId, setTemplateId,
    examCode, setExamCode, expiresAt, setExpiresAt,
    negativeMarking, setNegativeMarking,
    negativeMarksValue, setNegativeMarksValue,
    deliverInteractive, setDeliverInteractive,
    deliverPdf, setDeliverPdf,
    generalInstructions, setGeneralInstructions,
    numVariants, setNumVariants,
    hasAnyMcq,
    previewHtml, previewLoading, onRefreshPreview,
    onSaveMyDefaults, onLoadMyDefaults, onClearMyDefaults, hasMyDefaults,
    totalMarks, totalQuestions, lockedSeed,
    inputCls,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left: settings — full width on mobile/tablet, 3/5 on desktop so preview fits */}
      <div className="lg:col-span-3 space-y-4">
        {/* Delivery */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Delivery</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`border rounded-xl p-3 flex items-start gap-3 cursor-pointer ${deliverPdf ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}>
              <input type="checkbox" checked={deliverPdf} onChange={(e) => setDeliverPdf(e.target.checked)} className="mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-800">📄 Printable PDF</p>
                <p className="text-xs text-gray-500">Auto-generated after publish. Download from exam detail.</p>
              </div>
            </label>
            <label className={`border rounded-xl p-3 flex items-start gap-3 ${!hasAnyMcq ? 'opacity-50 cursor-not-allowed' : (deliverInteractive ? 'border-indigo-400 bg-indigo-50 cursor-pointer' : 'border-gray-200 cursor-pointer')}`}>
              <input type="checkbox" checked={deliverInteractive} onChange={(e) => setDeliverInteractive(e.target.checked)} disabled={!hasAnyMcq} className="mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-800">🌐 Online exam (MCQ auto-grade)</p>
                <p className="text-xs text-gray-500">{hasAnyMcq ? 'Students join with a code, get auto-graded.' : 'Needs at least one MCQ section.'}</p>
              </div>
            </label>
          </div>

          {deliverInteractive && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Exam code</label>
                <input type="text" value={examCode} onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                  placeholder="AUTO" maxLength={12} className={inputCls + ' font-mono uppercase'} />
                <p className="text-xs text-gray-400 mt-1">Leave blank for auto-generated.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Expires at</label>
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={negativeMarking} onChange={(e) => setNegativeMarking(e.target.checked)} />
                  <span className="font-semibold text-gray-700">Negative marking</span>
                  {negativeMarking && (
                    <input type="number" min={0} step={0.25} value={negativeMarksValue}
                      onChange={(e) => setNegativeMarksValue(e.target.value)}
                      className="ml-2 w-20 px-2 py-1 border border-gray-200 rounded text-sm" />
                  )}
                  {negativeMarking && <span className="text-xs text-gray-500">marks per wrong MCQ</span>}
                </label>
              </div>
            </div>
          )}

          {deliverPdf && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Number of paper sets (variants)</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => setNumVariants(n)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold border ${numVariants === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200'}`}>
                    Set {'ABCD'.slice(0, n).split('').join('/') || 'A'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">Each set uses a different reshuffle of the same composition.</p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">General instructions <span className="text-gray-400 font-normal text-xs">(shown at the top of every paper)</span></h3>
          <textarea value={generalInstructions} onChange={(e) => setGeneralInstructions(e.target.value)}
            rows={4}
            className={inputCls + ' font-mono text-xs leading-relaxed'} />
        </div>

        {/* Template + org */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-gray-900">Template & organisation header</h3>
            <div className="flex items-center gap-3">
              {hasMyDefaults && (
                <button type="button" onClick={onLoadMyDefaults}
                  className="text-xs text-gray-600 hover:text-indigo-700 font-semibold">
                  ↺ Load my defaults
                </button>
              )}
              <button type="button" onClick={onSaveMyDefaults}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                💾 Save as my defaults
              </button>
              {hasMyDefaults && (
                <button type="button" onClick={onClearMyDefaults}
                  className="text-xs text-gray-400 hover:text-red-600">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Paper template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
                <option value="">— Select template —</option>
                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">School / org name <span className="text-red-500">*</span></label>
              <input type="text" value={org.orgName} onChange={(e) => setOrg({ ...org, orgName: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Exam heading</label>
              <input type="text" value={org.examTitle} onChange={(e) => setOrg({ ...org, examTitle: e.target.value })}
                placeholder="Half-Yearly 2026" className={inputCls} />
            </div>
            <div>
              <LogoField org={org} setOrg={setOrg} inputCls={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Address</label>
              <input type="text" value={org.address} onChange={(e) => setOrg({ ...org, address: e.target.value })} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Footer text</label>
              <input type="text" value={footerText} onChange={(e) => setFooterText(e.target.value)}
                placeholder="Best of luck to all students!" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm">
          <div className="font-bold text-emerald-900 mb-2">Ready to publish</div>
          <ul className="text-emerald-800 space-y-0.5 text-xs">
            <li>· {totalQuestions} questions · {totalMarks} marks</li>
            <li>· {deliverPdf ? '📄 PDF' : ''}{deliverPdf && deliverInteractive ? ' + ' : ''}{deliverInteractive ? '🌐 Online' : ''}</li>
            {numVariants > 1 && <li>· {numVariants} shuffled variants (Set A–{String.fromCharCode(64 + numVariants)})</li>}
            {lockedSeed && <li>· Seed locked at {lockedSeed} (paper matches your Step 4 sample exactly)</li>}
          </ul>
        </div>
      </div>

      {/* Right: A4 preview */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900">Live preview</h3>
            <button onClick={onRefreshPreview}
              disabled={previewLoading}
              className="text-xs bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 px-3 py-1.5 rounded-lg font-semibold">
              {previewLoading ? 'Loading…' : previewHtml ? '↻ Refresh' : 'Generate preview'}
            </button>
          </div>
          {previewHtml ? (
            <iframe title="preview" srcDoc={previewHtml}
              className="w-full border border-gray-200 rounded-lg bg-slate-100 h-[420px] sm:h-[600px] lg:h-[780px]" />
          ) : (
            <div className="text-center py-16 text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
              Click <strong>Generate preview</strong> to see the printed paper.
              {!previewHtml && !previewLoading && (
                <div className="mt-2 text-xs text-gray-400">Preview loads on demand to keep the wizard snappy.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * F.6 — Logo field. Supports both an uploaded image (preferred) and a
 * fallback 2-4 letter monogram. Upload is a one-shot POST /logos that
 * returns a URL; we store that URL on the org snapshot and render it
 * as an <img> on the printed paper. If the teacher clears the upload,
 * we fall back to the text logo.
 */
function LogoField({ org, setOrg, inputCls }: {
  org: OrgSettings;
  setOrg: (o: OrgSettings) => void;
  inputCls: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    // Client-side sanity: 5 MB cap so the request doesn't waste time.
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo must be under 5 MB.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/logos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url: string = res.data?.data?.url;
      if (!url) throw new Error('No URL returned');
      setOrg({ ...org, logoUrl: url });
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
        Logo <span className="text-gray-400 font-normal normal-case">image or 2–5 letter monogram</span>
      </label>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
          {org.logoUrl
            ? <img src={org.logoUrl} alt="logo" className="max-w-full max-h-full object-contain" />
            : <span className="text-xs font-bold text-gray-500">{org.logoText || 'LOGO'}</span>}
        </div>
        <div className="flex-1 flex items-center gap-2">
          <input type="text" value={org.logoText} onChange={(e) => setOrg({ ...org, logoText: e.target.value })}
            placeholder="ABC" maxLength={5} className={inputCls + ' font-bold text-center'} />
          <label className="px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold hover:bg-indigo-100 cursor-pointer whitespace-nowrap">
            {uploading ? '…' : org.logoUrl ? 'Replace' : 'Upload'}
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleFile} className="hidden" />
          </label>
          {org.logoUrl && (
            <button type="button" onClick={() => setOrg({ ...org, logoUrl: undefined })}
              className="px-2 py-2 text-xs text-red-500 hover:text-red-700" title="Remove uploaded logo (falls back to text)">
              ✕
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {org.logoUrl && (
        <p className="text-xs text-gray-400 mt-1">✓ Uploaded — printed on paper. Text is the fallback if the image can't load.</p>
      )}
    </>
  );
}
