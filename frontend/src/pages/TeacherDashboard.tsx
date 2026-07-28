import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TeacherShell from '../components/TeacherShell';
import Spinner from '../components/Spinner';
import api from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentChapter {
  id: string;
  name: string;
  order: number;
  subject?: { id: string; name: string };
  subSubject?: { id: string; name: string } | null;
  _count?: { questions: number };
}

interface ExpiringExam {
  id: string;
  title: string;
  examCode: string | null;
  expiresAt: string;
}

interface Stats {
  counts: {
    classes: number; subjects: number; chapters: number; questions: number;
    mcqQuestions: number; subjectiveQuestions: number;
  };
  exams: { draft: number; active: number; completed: number; total: number };
  sessions: { total: number; last24h: number; submitted: number };
  alerts: { expiringSoon: ExpiringExam[] };
  recentChapters: RecentChapter[];
}

interface ActivityEvent {
  type: 'exam_created' | 'session_started' | 'session_submitted' | 'question_added';
  timestamp: string;
  title: string;
  subtitle?: string;
  link?: string;
  icon: string;
  color: 'indigo' | 'blue' | 'green' | 'amber' | 'gray';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.floor((now - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function timeUntil(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.floor((then - now) / 1000);
  if (s <= 0) return 'expired';
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${m % 60}m`;
  return `in ${Math.floor(h / 24)}d`;
}

const COLOR_STYLES: Record<ActivityEvent['color'], { bg: string; text: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-600' },
  green:  { bg: 'bg-green-50',  text: 'text-green-600' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-600' },
  gray:   { bg: 'bg-gray-50',   text: 'text-gray-500' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Real icons keyed to what each stat represents (Heroicons outline paths)
const STAT_ICONS = {
  classes:    'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  subjects:   'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  chapters:   'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  questions:  'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  active:     'M13 10V3L4 14h7v7l9-11h-7z',                                          // lightning bolt
  completed:  'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', // shield-check
  attempts:   'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',       // users
  attempts24: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',                          // clock
} as const;

function StatCard({ label, value, tone, to, hint, iconKey }: {
  label: string;
  value: number;
  tone: 'indigo' | 'blue' | 'green' | 'violet' | 'amber';
  to?: string;
  hint?: string;
  iconKey: keyof typeof STAT_ICONS;
}) {
  const tones: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700',
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    violet: 'bg-violet-50 text-violet-700',
    amber:  'bg-amber-50 text-amber-700',
  };
  const content = (
    <>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tones[tone]}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={STAT_ICONS[iconKey]} />
          </svg>
        </div>
        {to && (
          <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
          </svg>
        )}
      </div>
      <p className="text-2xl font-extrabold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-gray-400 text-sm">{label}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </>
  );
  const base = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all';
  return to
    ? <Link to={to} className={`${base} hover:border-indigo-200 hover:shadow-md group block`}>{content}</Link>
    : <div className={base}>{content}</div>;
}

function ExpiringExamCard({ exam }: { exam: ExpiringExam }) {
  return (
    <Link to="/teacher/exams" className="flex items-center gap-3 px-4 py-3 hover:bg-amber-100/50 transition-colors group">
      <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center shrink-0">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-amber-800 transition-colors">{exam.title}</p>
        <p className="text-xs text-gray-500">
          {exam.examCode && <span className="font-mono">{exam.examCode} · </span>}Expires {timeUntil(exam.expiresAt)}
        </p>
      </div>
    </Link>
  );
}

function EventRow({ event }: { event: ActivityEvent }) {
  const style = COLOR_STYLES[event.color] ?? COLOR_STYLES.gray;
  const inner = (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <div className={`w-8 h-8 ${style.bg} ${style.text} rounded-lg flex items-center justify-center shrink-0`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={event.icon}/>
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{event.title}</p>
        {event.subtitle && <p className="text-xs text-gray-400 truncate">{event.subtitle}</p>}
      </div>
      <span className="text-xs text-gray-400 shrink-0 mt-0.5">{timeAgo(event.timestamp)}</span>
    </div>
  );
  return event.link
    ? <Link to={event.link} className="block">{inner}</Link>
    : inner;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/teacher/stats').then((r) => r.data?.data ?? null).catch(() => null),
      api.get('/teacher/activity').then((r) => r.data?.data?.events ?? []).catch(() => []),
    ]).then(([s, a]) => {
      if (!s) setError('Could not load dashboard.');
      setStats(s);
      setActivity(a);
    }).finally(() => setLoading(false));
  }, []);

  const quickActions = [
    { to: '/teacher/exams', label: 'Create Exam', desc: 'Online + Printable PDF', color: 'border-indigo-100 hover:bg-indigo-50 hover:border-indigo-300' },
    { to: '/teacher/upload', label: 'Upload Questions', desc: 'Excel bulk or single', color: 'border-green-100 hover:bg-green-50 hover:border-green-300' },
    { to: '/teacher/classes', label: 'Manage Classes', desc: 'Class → Subject → Chapter', color: 'border-violet-100 hover:bg-violet-50 hover:border-violet-300' },
    { to: '/teacher/questions', label: 'Question Bank', desc: 'Browse & edit questions', color: 'border-yellow-100 hover:bg-yellow-50 hover:border-yellow-300' },
  ];

  return (
    <TeacherShell
      title={`Welcome back, ${user?.name?.split(' ')[0] ?? 'Teacher'}`}
      subtitle="Here's what's happening across your exams and question bank"
    >
      {loading ? (
        <Spinner size="lg" label="Loading dashboard..." />
      ) : error || !stats ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm max-w-2xl">{error || 'No data.'}</div>
      ) : (
        <div className="max-w-6xl space-y-6">
          {/* Expiring-soon alert banner */}
          {stats.alerts.expiringSoon.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
              <div className="bg-amber-100 px-5 py-2.5 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <p className="text-sm font-semibold text-amber-900">
                  {stats.alerts.expiringSoon.length} exam{stats.alerts.expiringSoon.length !== 1 ? 's' : ''} expiring in the next 24 hours
                </p>
              </div>
              <div className="divide-y divide-amber-100">
                {stats.alerts.expiringSoon.map((e) => <ExpiringExamCard key={e.id} exam={e} />)}
              </div>
            </div>
          )}

          {/* Stats row 1: question bank */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Question Bank</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard iconKey="classes"   label="Classes"   value={stats.counts.classes}   tone="indigo" to="/teacher/classes" />
              <StatCard iconKey="subjects"  label="Subjects"  value={stats.counts.subjects}  tone="violet" to="/teacher/classes" />
              <StatCard iconKey="chapters"  label="Chapters"  value={stats.counts.chapters}  tone="blue"   to="/teacher/classes" />
              <StatCard iconKey="questions" label="Questions" value={stats.counts.questions} tone="green"  to="/teacher/questions"
                hint={`${stats.counts.mcqQuestions} MCQ · ${stats.counts.subjectiveQuestions} subjective`} />
            </div>
          </div>

          {/* Stats row 2: exam activity */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Exam Activity</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard iconKey="active"     label="Active Exams"   value={stats.exams.active}       tone="green"  to="/teacher/exams"
                hint={stats.exams.draft > 0 ? `${stats.exams.draft} draft` : undefined} />
              <StatCard iconKey="completed"  label="Completed"      value={stats.exams.completed}    tone="indigo" to="/teacher/exams" />
              <StatCard iconKey="attempts"   label="Total Attempts" value={stats.sessions.total}     tone="blue"
                hint={`${stats.sessions.submitted} submitted`} />
              <StatCard iconKey="attempts24" label="Attempts (24h)" value={stats.sessions.last24h}   tone="amber" />
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map(a => (
                <Link key={a.to} to={a.to}
                  className={`flex flex-col gap-1 p-4 border-2 rounded-xl transition-all text-left ${a.color}`}>
                  <span className="text-sm font-semibold text-gray-800">{a.label}</span>
                  <span className="text-xs text-gray-400">{a.desc}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Two-column: recent chapters + activity feed */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent chapters */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Recent Chapters</h2>
                <Link to="/teacher/classes" className="text-xs text-indigo-600 hover:underline font-medium">View all →</Link>
              </div>
              {stats.recentChapters.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  <p className="text-sm">No chapters yet.</p>
                  <Link to="/teacher/classes" className="text-indigo-600 text-sm hover:underline mt-1 inline-block">Start with a class →</Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {stats.recentChapters.map(ch => (
                    <div key={ch.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{ch.name}</p>
                        {ch.subject && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">
                            {ch.subject.name}
                            {ch.subSubject && <> <span className="text-gray-300">›</span> {ch.subSubject.name}</>}
                          </p>
                        )}
                      </div>
                      <span className="bg-indigo-50 text-indigo-600 text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ml-2">
                        {ch._count?.questions ?? 0} Qs
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Activity feed */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
                {activity && activity.length > 0 && (
                  <span className="text-xs text-gray-400">last {activity.length}</span>
                )}
              </div>
              {!activity || activity.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  <p className="text-sm">No activity yet. Create your first exam or upload questions to see it here.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
                  {activity.map((e, i) => <EventRow key={i} event={e} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </TeacherShell>
  );
}
