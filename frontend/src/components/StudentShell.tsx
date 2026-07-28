import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Brand from './Brand';

// Students have a much smaller product surface than teachers — two nav items
// is intentional. Anything more would just be padding.
const NAV = [
  { to: '/student', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/student/results', label: 'My Results', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
];

interface Props {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function StudentShell({ children, title, subtitle, action }: Props) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/'); };
  const isActive = (to: string) =>
    to === '/student' ? location.pathname === '/student' : location.pathname.startsWith(to);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col shrink-0 fixed h-full z-20">
        <div className="px-6 py-5 border-b border-gray-100">
          <Brand size="sm" showTagline />
          <p className="text-xs text-gray-400 mt-2 ml-10">Student Portal</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = isActive(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <svg className={`shrink-0 ${active ? 'text-indigo-600' : 'text-gray-400'}`} style={{width:'18px',height:'18px'}} fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon}/>
                </svg>
                {item.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600"></span>}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-sm font-bold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
            <button onClick={handleLogout} title="Sign out"
              className="text-gray-400 hover:text-red-500 transition-colors p-1 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 flex">
        {NAV.map(item => {
          const active = isActive(item.to);
          return (
            <Link key={item.to} to={item.to}
              className={`flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon}/>
              </svg>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
