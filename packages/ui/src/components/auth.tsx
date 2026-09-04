import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? 'http://localhost:4000';

export const api = {
  async get<T = any>(path: string): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  },
  async post<T = any>(path: string, body?: any): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null,
    });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  },
  async patch<T = any>(path: string, body?: any): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null,
    });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  },
  async delete<T = any>(path: string): Promise<T> {
    const r = await fetch(`${API_BASE}${path}`, { method: 'DELETE', credentials: 'include' });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r.json();
  },
};

interface AuthUser { id: string; email: string; isAdmin?: boolean; isSupplier?: boolean; }
const AuthContext = createContext<{ user: AuthUser | null; loading: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> } | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const r = await api.get<AuthUser | null>('/auth/me').catch(() => null);
      setUser(r ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await api.post('/auth/sign-out').catch(() => {});
    setUser(null);
  };

  useEffect(() => { refresh(); }, []);

  return <AuthContext.Provider value={{ user, loading, refresh, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const AdminAuthContext = createContext<{ user: AuthUser | null; loading: boolean; refresh: () => Promise<void> } | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const r = await api.get<AuthUser | null>('/auth/admin/me').catch(() => null);
      setUser(r ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return <AdminAuthContext.Provider value={{ user, loading, refresh }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
