import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../api';
import type { User, AuthResponse } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isTeacher: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string, role: 'TEACHER' | 'STUDENT') => Promise<AuthResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Auth storage strategy — sessionStorage, not localStorage.
 *
 * Reason: teachers testing the student flow (or a shared computer with
 * a teacher + student in different tabs) previously had both tabs share
 * a single localStorage key. Whichever tab logged in last clobbered the
 * other. sessionStorage is per-tab, so a teacher-in-tab-A and student-
 * in-tab-B coexist cleanly.
 *
 * Migration: on first load we read a legacy localStorage token so
 * existing users don't get unceremoniously logged out. The legacy key
 * is then removed and everything future flows through sessionStorage.
 *
 * Tradeoff: closing all tabs = logged out. Refreshing a tab keeps you
 * logged in (sessionStorage survives refresh, only dies on tab close).
 * Acceptable for a teacher tool — matches how Gmail behaves in
 * "don't remember me" mode.
 */
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

function readStoredToken(): string | null {
  const sess = sessionStorage.getItem(TOKEN_KEY);
  if (sess) return sess;
  // One-time migration from the old localStorage-based flow.
  const legacy = localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    sessionStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
    return legacy;
  }
  return null;
}

function readStoredUser(): User | null {
  try {
    const sess = sessionStorage.getItem(USER_KEY);
    if (sess) return JSON.parse(sess);
    const legacy = localStorage.getItem(USER_KEY);
    if (legacy) {
      sessionStorage.setItem(USER_KEY, legacy);
      localStorage.removeItem(USER_KEY);
      return JSON.parse(legacy);
    }
  } catch { /* ignore malformed */ }
  return null;
}

function persistAuth(token: string, user: User) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  // Also clear any legacy localStorage residue.
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [token, setToken] = useState<string | null>(() => readStoredToken());

  const login = useCallback(async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<{ success: boolean; data: AuthResponse }>('/auth/login', { email, password });
    const { token: newToken, user: newUser } = response.data.data;
    setToken(newToken);
    setUser(newUser);
    persistAuth(newToken, newUser);
    return response.data.data;
  }, []);

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
    role: 'TEACHER' | 'STUDENT'
  ): Promise<AuthResponse> => {
    const response = await api.post<{ success: boolean; data: AuthResponse }>('/auth/register', { name, email, password, role });
    const { token: newToken, user: newUser } = response.data.data;
    setToken(newToken);
    setUser(newUser);
    persistAuth(newToken, newUser);
    return response.data.data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    clearAuth();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isAuthenticated: !!token && !!user,
      isTeacher: user?.role === 'TEACHER',
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
