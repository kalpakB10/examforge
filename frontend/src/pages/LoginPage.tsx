import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.user.role === 'TEACHER') navigate('/teacher', { replace: true });
      else navigate('/student', { replace: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e?.response?.data?.error?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 flex-col justify-between p-12">
        <Link to="/" className="flex items-center gap-3 text-white">
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center text-lg font-black tracking-tighter">EF</div>
          <div className="leading-tight">
            <span className="font-bold text-xl tracking-tight block">ExamForge</span>
            <span className="text-xs text-white/70 font-medium">Powered by Joyful Genius</span>
          </div>
        </Link>
        <div>
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Your complete exam<br />management platform.
          </h1>
          <p className="text-indigo-200 text-lg">
            Create exams, manage question banks, and track student performance — all in one place.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-4">
            {[['10k+', 'Questions'], ['500+', 'Exams'], ['98%', 'Satisfaction']].map(([n, l]) => (
              <div key={l} className="bg-white/10 rounded-2xl p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-black text-white">{n}</div>
                <div className="text-indigo-200 text-xs mt-1">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-indigo-300 text-sm">© {new Date().getFullYear()} ExamForge — Powered by Joyful Genius</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-indigo-600 font-bold text-xl">
              <span className="w-7 h-7 bg-indigo-600 text-white rounded-lg flex items-center justify-center text-sm font-black tracking-tighter">EF</span>
              ExamForge
            </Link>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-extrabold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 mt-1">Sign in to your account to continue</p>
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-semibold text-gray-700 mb-1.5">Email address</label>
              <input id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" autoComplete="email" required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400 text-sm transition-all"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input id="login-password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                  autoComplete="current-password" required
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-400 text-sm transition-all"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
                  {showPassword
                    ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21"/></svg>
                    : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                  }
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all text-sm shadow-sm hover:shadow-md active:scale-[0.99]">
              {loading
                ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Signing in...</span>
                : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/register" className="text-indigo-600 hover:text-indigo-800 font-semibold">Create one free</Link>
          </p>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-gray-400 hover:text-gray-600">← Back to browse</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
