import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import type { Chapter, Question, Subject } from '../types';

export default function ChapterPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  const token = localStorage.getItem('auth_token');

  useEffect(() => {
    if (!chapterId) return;
    const fetchData = async () => {
      try {
        setLoading(true);
        const chapterRes = await api.get(`/chapters/${chapterId}`);
        const data = chapterRes.data?.data;
        if (!data) throw new Error('Not found');

        const ch: Chapter = {
          ...data,
          question_count: data._count?.questions ?? data.question_count ?? 0,
        };
        setChapter(ch);
        setSubject(data.subject ?? null);

        // Load questions
        setQuestionsLoading(true);
        try {
          const qRes = await api.get(`/questions?chapter_id=${chapterId}`);
          const qList: Question[] = qRes.data?.data?.questions || qRes.data?.questions || qRes.data || [];
          setQuestions(Array.isArray(qList) ? qList : []);
        } catch {
          // questions may not be accessible
        } finally {
          setQuestionsLoading(false);
        }
      } catch (err) {
        setError('Failed to load chapter data.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [chapterId]);

  const handleDownload = async (type: 'question-paper-pdf' | 'answer-key-pdf') => {
    if (!chapterId) return;
    setDownloading(type);
    const url = `/api/chapters/${chapterId}/${type}`;
    try {
      if (token) {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Failed');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${chapter?.name || 'chapter'}-${type}.pdf`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      window.open(url, '_blank');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading chapter...</p>
        </div>
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Chapter Not Found</h2>
          <p className="text-gray-500 mb-4">{error || 'This chapter could not be found.'}</p>
          <Link to="/" className="text-indigo-600 hover:underline">Go Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-700 to-blue-700 text-white py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <nav className="flex items-center gap-2 text-indigo-200 text-sm mb-4 flex-wrap">
            <Link to="/" className="hover:text-white transition-colors">Home</Link>
            <span>›</span>
            {subject && (
              <>
                <Link to={`/subjects/${subject.id}`} className="hover:text-white transition-colors">
                  {subject.name}
                </Link>
                <span>›</span>
              </>
            )}
            <span className="text-white font-medium">{chapter.name}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">{chapter.name}</h1>
          {chapter.description && (
            <p className="text-indigo-100 text-lg">{chapter.description}</p>
          )}
        </div>
      </div>

      {/* Info Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 text-indigo-700 p-2 rounded-lg text-lg">🎯</span>
            <div>
              <p className="text-xs text-gray-400">Total Marks</p>
              <p className="font-bold text-gray-800">{chapter.total_marks}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-100 text-blue-700 p-2 rounded-lg text-lg">⏱️</span>
            <div>
              <p className="text-xs text-gray-400">Time Allowed</p>
              <p className="font-bold text-gray-800">{chapter.time_minutes} minutes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-green-100 text-green-700 p-2 rounded-lg text-lg">❓</span>
            <div>
              <p className="text-xs text-gray-400">Questions</p>
              <p className="font-bold text-gray-800">{chapter.question_count ?? questions.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-purple-100 text-purple-700 p-2 rounded-lg text-lg">📋</span>
            <div>
              <p className="text-xs text-gray-400">Chapter Order</p>
              <p className="font-bold text-gray-800">#{chapter.order}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Download Buttons */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📥 Download Resources</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => handleDownload('question-paper-pdf')}
              disabled={downloading === 'question-paper-pdf'}
              className="flex-1 flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-4 px-6 rounded-xl transition-colors text-base shadow-md hover:shadow-lg"
            >
              {downloading === 'question-paper-pdf' ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Downloading...
                </>
              ) : (
                <>
                  <span className="text-2xl">📄</span>
                  Download Question Paper PDF
                </>
              )}
            </button>
            <button
              onClick={() => handleDownload('answer-key-pdf')}
              disabled={downloading === 'answer-key-pdf'}
              className="flex-1 flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold py-4 px-6 rounded-xl transition-colors text-base shadow-md hover:shadow-lg"
            >
              {downloading === 'answer-key-pdf' ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Downloading...
                </>
              ) : (
                <>
                  <span className="text-2xl">🔑</span>
                  Download Answer Key PDF
                </>
              )}
            </button>
          </div>
          <p className="text-gray-400 text-xs mt-3 text-center">
            PDFs are generated from the question bank. Free to download.
          </p>
        </div>

        {/* Questions Preview */}
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
          <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
            <h2 className="text-lg font-bold text-gray-800">📝 Questions Preview</h2>
            <p className="text-gray-500 text-sm">Correct answers are hidden. Download the Answer Key PDF to see them.</p>
          </div>

          {questionsLoading && (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
              <p className="text-gray-400 text-sm">Loading questions...</p>
            </div>
          )}

          {!questionsLoading && questions.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-4xl mb-2">📭</p>
              <p>No questions preview available.</p>
            </div>
          )}

          <div className="divide-y divide-gray-100">
            {questions.map((q, idx) => (
              <div key={q.id} className="px-6 py-5 hover:bg-gray-50 transition-colors">
                <p className="font-medium text-gray-800 mb-3">
                  <span className="text-indigo-600 font-bold mr-2">Q{idx + 1}.</span>
                  {q.question_text}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-6">
                  {[
                    { label: 'A', value: q.option_a },
                    { label: 'B', value: q.option_b },
                    { label: 'C', value: q.option_c },
                    { label: 'D', value: q.option_d },
                  ].map(opt => (
                    <div key={opt.label} className="flex items-start gap-2 text-gray-600 text-sm">
                      <span className="bg-gray-100 text-gray-700 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                        {opt.label}
                      </span>
                      <span>{opt.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3 ml-6">
                  ★ Marks: {q.marks || 1} | Answer: [See Answer Key PDF]
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="bg-gray-800 text-gray-300 py-6 mt-16 text-center text-sm">
        <p>© {new Date().getFullYear()} ExamForge — Powered by Joyful Genius</p>
      </footer>
    </div>
  );
}
