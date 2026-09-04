import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { StoreIcon, LogOutIcon } from './icons';

interface AdminAuthState {
  user: { isAdmin: boolean } | null;
  setUser: (u: { isAdmin: boolean } | null) => void;
}

const AdminAuthContext = createContext<AdminAuthState>({ user: null, setUser: () => {} });
const useAdminAuth = () => useContext(AdminAuthContext);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ isAdmin: boolean } | null>(null);
  useEffect(() => {
    api
      .get<{ user: { isAdmin: boolean } | null }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setUser(null);
      });
  }, []);
  return <AdminAuthContext.Provider value={{ user, setUser }}>{children}</AdminAuthContext.Provider>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAdminAuth();
  if (!user) return <NavigateToLogin />;
  if (!user.isAdmin) return <p className="text-sm text-red-700 p-6">Forbidden: admin role required.</p>;
  return <>{children}</>;
}

function NavigateToLogin() {
  // Lazy import to avoid circular dep; matches web's BrowserRouter context.
  return <Redirect path="/admin/login" />;
}

import { Navigate } from 'react-router-dom';
function Redirect({ path }: { path: string }) {
  return <Navigate to={path} replace />;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center h-8 px-3 rounded-full text-xs font-medium transition-colors ${isActive ? 'bg-slate-950 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`;

export function AdminShell() {
  const { user, setUser } = useAdminAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-pearl text-ink-1">
      <header className="sticky top-0 z-40 bg-midnight-2 text-paper border-b border-midnight-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link to="/admin" className="flex items-center gap-2.5 font-semibold text-paper">
            <span className="inline-flex items-center justify-center">
              <svg viewBox="0 0 32 32" className="h-8 w-8 rounded-md" aria-hidden>
                <rect width="32" height="32" rx="7" fill="#5EE2FF" />
                <path d="M9 8h4l5 12 5-12h4l-7 16h-4L9 8z" fill="#0A0B10" />
              </svg>
            </span>
            <span className="font-semibold tracking-tight">VYRO Admin</span>
          </Link>
          {user ? (
            <nav className="flex items-center gap-1 flex-wrap">
              <NavLink to="/admin/suppliers" className={linkClass}>Suppliers</NavLink>
              <NavLink to="/admin/businesses" className={linkClass}>Businesses</NavLink>
              <NavLink to="/admin/disputed" className={linkClass}>Disputed</NavLink>
              <NavLink to="/admin/audit" className={linkClass}>Audit</NavLink>
              <div className="h-6 w-px bg-white/15 mx-1" aria-hidden />
              <Link to="/" className="text-xs text-ink-4 hover:text-cyan transition-colors">← Web</Link>
              <button
                onClick={async () => {
                  await api.post('/auth/sign-out');
                  setUser(null);
                  navigate('/admin/login');
                }}
                className="ml-1 inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
              >
                <LogOutIcon size={14} /> Sign out
              </button>
            </nav>
          ) : (
            <span className="text-xs text-ink-4">Sign in to administer</span>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
