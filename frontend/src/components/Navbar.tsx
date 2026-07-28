import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, isAuthenticated, isTeacher, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    setMenuOpen(false);
  };

  const isActive = (path: string) => location.pathname === path;

  const navLink = (to: string, label: string, highlight = false) => (
    <Link
      to={to}
      onClick={() => setMenuOpen(false)}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        highlight
          ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-300 font-semibold'
          : isActive(to)
          ? 'bg-indigo-600 text-white'
          : 'text-indigo-100 hover:text-white hover:bg-indigo-600'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-indigo-800 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 text-white hover:opacity-90 transition-opacity">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center font-black text-sm tracking-tighter shrink-0">EF</div>
            <div className="leading-tight">
              <span className="font-bold text-base tracking-tight block">ExamForge</span>
              <span className="text-[10px] text-white/70 font-medium tracking-wide hidden sm:block">Powered by Joyful Genius</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLink('/', 'Browse')}
            {navLink('/exam', '🎓 Join Exam', true)}

            {isAuthenticated ? (
              <>
                {isTeacher && navLink('/teacher', 'Dashboard')}
                {!isTeacher && navLink('/student', 'Dashboard')}
                <div className="ml-2 flex items-center gap-2 pl-2 border-l border-indigo-600">
                  <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {user?.name?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-indigo-200 text-sm hidden lg:block">{user?.name}</span>
                  <button
                    onClick={handleLogout}
                    className="ml-1 text-indigo-200 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : (
              <div className="ml-2 flex items-center gap-2 pl-2 border-l border-indigo-600">
                <Link to="/login" className="text-indigo-100 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors">
                  Sign in
                </Link>
                <Link to="/register" className="bg-white text-indigo-800 hover:bg-indigo-50 text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-sm">
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            {menuOpen
              ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/></svg>
            }
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-indigo-700 bg-indigo-800 px-4 py-3 space-y-1">
          {[['/', 'Browse'], ['/exam', '🎓 Join Exam']].map(([to, label]) => (
            <Link key={to} to={to} onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive(to) ? 'bg-indigo-600 text-white' : 'text-indigo-100 hover:bg-indigo-700 hover:text-white'}`}>
              {label}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              {isTeacher && (
                <Link to="/teacher" onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-100 hover:bg-indigo-700 hover:text-white transition-colors">
                  Teacher Dashboard
                </Link>
              )}
              {!isTeacher && (
                <Link to="/student" onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-100 hover:bg-indigo-700 hover:text-white transition-colors">
                  Student Dashboard
                </Link>
              )}
              <div className="pt-2 border-t border-indigo-700 mt-2">
                <p className="px-3 py-1 text-indigo-300 text-sm">{user?.name}</p>
                <button onClick={handleLogout}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-red-300 hover:bg-red-900/30 transition-colors">
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="pt-2 border-t border-indigo-700 mt-2 flex gap-2">
              <Link to="/login" onClick={() => setMenuOpen(false)}
                className="flex-1 text-center px-3 py-2.5 rounded-lg text-sm font-medium text-indigo-100 hover:bg-indigo-700 transition-colors">
                Sign in
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)}
                className="flex-1 text-center bg-white text-indigo-800 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-indigo-50 transition-colors">
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
