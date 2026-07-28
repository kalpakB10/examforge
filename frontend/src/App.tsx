import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar'
import ProtectedRoute from './components/ProtectedRoute'
import BrowsePage from './pages/BrowsePage'
import SubjectPage from './pages/SubjectPage'
import ChapterPage from './pages/ChapterPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import TeacherDashboard from './pages/TeacherDashboard'
import TeacherUploadPage from './pages/TeacherUploadPage'
import TeacherTestsPage from './pages/TeacherTestsPage'
import TeacherTestResultsPage from './pages/TeacherTestResultsPage'
import TeacherExamsPage from './pages/TeacherExamsPage'
import TeacherExamResultsPage from './pages/TeacherExamResultsPage'
import TeacherClassesPage from './pages/TeacherClassesPage'
import TeacherClassDetailPage from './pages/TeacherClassDetailPage'
import TeacherSubjectDetailPage from './pages/TeacherSubjectDetailPage'
import TeacherSubSubjectDetailPage from './pages/TeacherSubSubjectDetailPage'
import TeacherQuestionsPage from './pages/TeacherQuestionsPage'
import TakeTestPage from './pages/TakeTestPage'
import ExamJoinPage from './pages/ExamJoinPage'
import ExamTakePage from './pages/ExamTakePage'
import ExamResultPage from './pages/ExamResultPage'

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  )
}

function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requiredRole="TEACHER">
      {children}
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public routes with Navbar */}
      <Route path="/" element={<PublicLayout><BrowsePage /></PublicLayout>} />
      <Route path="/subjects/:subjectId" element={<PublicLayout><SubjectPage /></PublicLayout>} />
      <Route path="/chapters/:chapterId" element={<PublicLayout><ChapterPage /></PublicLayout>} />

      {/* Legacy: /generate-paper is now merged into the Exam builder */}
      <Route path="/generate-paper" element={<Navigate to="/teacher/exams" replace />} />

      {/* Auth routes - no Navbar */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Student test routes — no Navbar, fully public */}
      <Route path="/test" element={<TakeTestPage />} />
      <Route path="/test/:code" element={<TakeTestPage />} />

      {/* Student exam flow — fully public, no Navbar */}
      {/* Specific sub-paths MUST come before the dynamic /:examCode catch-all */}
      <Route path="/exam/take/:sessionId" element={<ExamTakePage />} />
      <Route path="/exam/result/:sessionId" element={<ExamResultPage />} />
      <Route path="/exam/:examCode" element={<ExamJoinPage />} />
      <Route path="/exam" element={<ExamJoinPage />} />

      {/* Teacher routes - have their own sidebar */}
      <Route path="/teacher" element={<TeacherLayout><TeacherDashboard /></TeacherLayout>} />
      <Route path="/teacher/classes" element={<TeacherLayout><TeacherClassesPage /></TeacherLayout>} />
      <Route path="/teacher/classes/:classId" element={<TeacherLayout><TeacherClassDetailPage /></TeacherLayout>} />
      <Route path="/teacher/classes/:classId/subjects/:subjectId" element={<TeacherLayout><TeacherSubjectDetailPage /></TeacherLayout>} />
      <Route path="/teacher/classes/:classId/subjects/:subjectId/sub-subjects/:subSubjectId" element={<TeacherLayout><TeacherSubSubjectDetailPage /></TeacherLayout>} />
      <Route path="/teacher/questions" element={<TeacherLayout><TeacherQuestionsPage /></TeacherLayout>} />
      <Route path="/teacher/upload" element={<TeacherLayout><TeacherUploadPage /></TeacherLayout>} />
      <Route path="/teacher/tests" element={<TeacherLayout><TeacherTestsPage /></TeacherLayout>} />
      <Route path="/teacher/tests/:testId/results" element={<TeacherLayout><TeacherTestResultsPage /></TeacherLayout>} />
      <Route path="/teacher/exams" element={<TeacherLayout><TeacherExamsPage /></TeacherLayout>} />
      <Route path="/teacher/exams/:examId/results" element={<TeacherLayout><TeacherExamResultsPage /></TeacherLayout>} />

      {/* 404 */}
      <Route path="*" element={
        <PublicLayout>
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-8xl font-black text-gray-200 mb-4">404</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Page Not Found</h2>
              <p className="text-gray-500 mb-6">The page you're looking for doesn't exist.</p>
              <a href="/" className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors">
                Go Home
              </a>
            </div>
          </div>
        </PublicLayout>
      } />
    </Routes>
  )
}
