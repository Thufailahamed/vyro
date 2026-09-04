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
  `px-3 py-1.5 rounded text-sm ${isActive ? 'bg-brand-50 text-brand-700' : 'hover:bg-slate-100'}`;

export function AdminShell() {
  const { user, setUser } = useAdminAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/admin" className="font-bold text-brand-700 flex items-center gap-2">
            <StoreIcon size={18} /> VYRO Admin
          </Link>
          {user && (
            <nav className="flex items-center gap-1">
              <NavLink to="/admin/suppliers" className={linkClass}>Suppliers</NavLink>
              <NavLink to="/admin/businesses" className={linkClass}>Businesses</NavLink>
              <NavLink to="/admin/disputed" className={linkClass}>Disputed</NavLink>
              <NavLink to="/admin/audit" className={linkClass}>Audit</NavLink>
              <button
                onClick={async () => {
                  await api.post('/auth/sign-out');
                  setUser(null);
                  navigate('/admin/login');
                }}
                className="ml-2 text-sm text-muted inline-flex items-center gap-1"
              >
                <LogOutIcon size={14} /> Sign out
              </button>
            </nav>
          )}
          {user && (
            <Link to="/" className="ml-3 text-xs text-muted hover:text-fg">← Back to web</Link>
          )}
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
