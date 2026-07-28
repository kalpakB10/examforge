import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import type { Subject, Chapter } from '../types';

function downloadPDF(chapterId: string, type: 'question-paper' | 'answer-key', token: string | null) {
  const endpoint = type === 'question-paper' ? 'question-paper-pdf' : 'answer-key-pdf';
  const url = `/api/chapters/${chapterId}/${endpoint}`;
  // Use fetch with blob for authenticated download
  if (token) {
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `chapter-${chapterId}-${type}.pdf`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        window.open(url, '_blank');
      });
  } else {
    window.open(url, '_blank');
  }
}

export default function SubjectPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const token = localStorage.getItem('auth_token');

  useEffect(() => {
    if (!subjectId) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        // GET /subjects/:id returns subject + chapters in one call
        const res = await api.get(`/subjects/${subjectId}`);
        const data = res.data?.data;
        if (!data) throw new Error('Not found');

        setSubject(data);

        // chapters are embedded in the subject response
        const rawChapters: Chapter[] = data.chapters ?? [];
        const chapterList = rawChapters.map((c: Chapter & { _count?: { questions: number } }) => ({
          ...c,
          question_count: c._count?.questions ?? c.question_count ?? 0,
        }));
        const sorted = [...chapterList].sort((a, b) => (a.order || 0) - (b.order || 0));
        setChapters(sorted);
      } catch (err) {
        setError('Failed to load data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [subjectId]);

  const handleDownload = async (chapterId: string, type: 'question-paper' | 'answer-key') => {
    setDownloadingId(`${chapterId}-${type}`);
    try {
      downloadPDF(chapterId, type, token);
    } finally {
      setTimeout(() => setDownloadingId(null), 1500);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading chapters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Subject Hero */}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white py-10 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-indigo-200 text-sm mb-4">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <span>›</span>
            <span className="text-white font-medium">{subject?.name || 'Subject'}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold">{subject?.name || 'Subject'}</h1>
          {subject?.description && (
            <p className="text-indigo-100 mt-2 text-lg">{subject.description}</p>
          )}
          <div className="mt-4 flex items-center gap-4 text-indigo-100">
            <span>📄 {chapters.length} Chapter{chapters.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {chapters.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-500 text-lg">No chapters available for this subject yet.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {chapters.map((chapter, idx) => (
            <div
              key={chapter.id}
              className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow"
            >
              {/* Card Header */}
              <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-4 flex items-start gap-3">
                <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {idx + 1}
                </div>
                <div>
                  <Link
                    to={`/chapters/${chapter.id}`}
                    className="font-semibold text-gray-800 hover:text-indigo-700 leading-tight"
                  >
                    {chapter.name}
                  </Link>
                  {chapter.description && (
                    <p className="text-gray-500 text-xs mt-1 line-clamp-2">{chapter.description}</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="px-5 py-3 flex gap-4 text-sm text-gray-600 border-b border-gray-100">
                <div className="flex items-center gap-1">
                  <span>🎯</span>
                  <span>{chapter.total_marks} Marks</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>⏱️</span>
                  <span>{chapter.time_minutes} Min</span>
                </div>
                {chapter.question_count !== undefined && (
                  <div className="flex items-center gap-1">
                    <span>❓</span>
                    <span>{chapter.question_count} Qs</span>
                  </div>
                )}
              </div>

              {/* Download Buttons */}
              <div className="px-5 py-4 flex gap-3">
                <button
                  onClick={() => handleDownload(chapter.id, 'question-paper')}
                  disabled={downloadingId === `${chapter.id}-question-paper`}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                >
                  {downloadingId === `${chapter.id}-question-paper` ? '⏳' : '📄'}
                  <span className="hidden sm:inline">Question Paper</span>
                  <span className="sm:hidden">Q. Paper</span>
                </button>
                <button
                  onClick={() => handleDownload(chapter.id, 'answer-key')}
                  disabled={downloadingId === `${chapter.id}-answer-key`}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
                >
                  {downloadingId === `${chapter.id}-answer-key` ? '⏳' : '🔑'}
                  <span>Answer Key</span>
                </button>
              </div>

              <div className="px-5 pb-4">
                <Link
                  to={`/chapters/${chapter.id}`}
                  className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                >
                  View Details →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-300 py-6 mt-16 text-center text-sm">
        <p>© {new Date().getFullYear()} ExamForge — Powered by Joyful Genius</p>
      </footer>
    </div>
  );
}
