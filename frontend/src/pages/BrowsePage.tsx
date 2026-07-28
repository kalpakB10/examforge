import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import type { Subject } from '../types';

const SUBJECT_COLORS = [
  'from-blue-500 to-blue-700',
  'from-indigo-500 to-indigo-700',
  'from-purple-500 to-purple-700',
  'from-teal-500 to-teal-700',
  'from-green-500 to-green-700',
  'from-orange-500 to-orange-700',
];

const SUBJECT_ICONS = ['📐', '🔬', '📖', '🌍', '🧮', '🎨', '💡', '🧬', '⚗️', '🌱'];

export default function BrowsePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        setLoading(true);
        const response = await api.get('/subjects');
        const data = response.data;
        // Handle both {data: {subjects: [...]}} and {subjects: [...]} and plain array
        const rawList = data?.data?.subjects || data?.subjects || data || [];
        const subjectList = Array.isArray(rawList) ? rawList.map((s: any) => ({
          ...s,
          chapter_count: s._count?.chapters ?? s.chapter_count ?? 0,
        })) : [];
        setSubjects(subjectList);
      } catch (err: unknown) {
        setError('Failed to load subjects. Please try again later.');
        console.error('Fetch subjects error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSubjects();
  }, []);

  const filtered = subjects.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-linear-to-br from-indigo-700 via-indigo-600 to-blue-700 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/15 rounded-2xl mb-4 text-2xl font-black tracking-tighter">EF</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-2 leading-tight">
            ExamForge
          </h1>
          <p className="text-sm text-white/70 font-medium mb-6 tracking-wide">Powered by Joyful Genius</p>
          <p className="text-xl sm:text-2xl text-indigo-100 mb-8">
            Design, print, and share exams — MCQ, subjective, or both
          </p>
          <div className="flex flex-wrap justify-center gap-6 text-center text-indigo-100 mb-8">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <span>Chapter-wise PDFs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔑</span>
              <span>Answer Keys Included</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">📱</span>
              <span>Mobile Friendly</span>
            </div>
          </div>
          {/* Search */}
          <div className="max-w-xl mx-auto mb-4">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search subjects..."
              className="w-full px-5 py-3 rounded-full text-gray-800 text-base focus:outline-none focus:ring-4 focus:ring-indigo-300 shadow-lg"
            />
          </div>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold px-6 py-3 rounded-full shadow-lg hover:bg-indigo-50 transition-colors text-sm"
          >
            👩‍🏫 Sign up as Teacher — Create exams & printable papers
          </Link>
        </div>
      </section>

      {/* Stats Bar */}
      <div className="bg-white border-b border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap justify-center gap-8 text-center">
          <div>
            <span className="text-2xl font-bold text-indigo-700">{subjects.length}</span>
            <p className="text-gray-500 text-sm">Subjects</p>
          </div>
          <div>
            <span className="text-2xl font-bold text-indigo-700">
              {subjects.reduce((acc, s) => acc + (s.chapter_count || 0), 0)}
            </span>
            <p className="text-gray-500 text-sm">Chapters</p>
          </div>
          <div>
            <span className="text-2xl font-bold text-indigo-700">Free</span>
            <p className="text-gray-500 text-sm">Always</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Browse by Subject
          </h2>
          {search && (
            <p className="text-gray-500 text-sm">
              {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
            </p>
          )}
        </div>

        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading subjects...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-6">
            <p className="font-medium">Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-500 text-lg">
              {search ? 'No subjects match your search.' : 'No subjects available yet.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filtered.map((subject, idx) => (
            <Link
              key={subject.id}
              to={`/subjects/${subject.id}`}
              className="group block"
            >
              <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 hover:-translate-y-1">
                {/* Card Header */}
                <div className={`bg-linear-to-br ${SUBJECT_COLORS[idx % SUBJECT_COLORS.length]} p-6 text-white`}>
                  <div className="text-4xl mb-2">{SUBJECT_ICONS[idx % SUBJECT_ICONS.length]}</div>
                  <h3 className="text-lg font-bold leading-tight">{subject.name}</h3>
                </div>
                {/* Card Body */}
                <div className="p-4">
                  {subject.description && (
                    <p className="text-gray-500 text-sm mb-3 line-clamp-2">{subject.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-indigo-600">
                      <span className="text-sm">📄</span>
                      <span className="text-sm font-semibold">
                        {subject.chapter_count ?? 0} Chapter{(subject.chapter_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-indigo-600 text-sm font-medium group-hover:underline">
                      View →
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-300 py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="inline-flex w-10 h-10 bg-indigo-600/90 text-white rounded-lg items-center justify-center font-black text-sm tracking-tighter mb-2">EF</div>
          <p className="font-semibold text-white mb-1">ExamForge</p>
          <p className="text-sm text-gray-400">© {new Date().getFullYear()} ExamForge — Powered by Joyful Genius</p>
          <p className="text-xs text-gray-500 mt-2">Compose exams · Auto-graded online · Print-ready PDFs</p>
        </div>
      </footer>
    </div>
  );
}
