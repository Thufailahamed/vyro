import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';

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
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.isAdmin) return <p className="text-sm text-rose p-6">Forbidden: admin role required.</p>;
  return <>{children}</>;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative block px-3 py-2 text-sm transition-colors',
    isActive ? 'nav-active text-volt' : 'text-paper/60 hover:text-paper hover:bg-paper/5',
  );

export function AdminShell() {
  const { user, setUser } = useAdminAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-bone text-ink lg:flex">
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-void text-paper min-h-dvh sticky top-0">
        <Link to="/admin" className="flex items-center gap-2.5 px-4 h-14 border-b border-paper/10">
          <BrandMark size={24} tone="volt" />
          <BrandWordmark tone="paper" size="sm" eyebrow="Control" />
        </Link>
        {user ? (
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            <NavLink to="/admin" end className={linkClass}>
              Overview
            </NavLink>
            <NavLink to="/admin/suppliers" className={linkClass}>
              Suppliers
            </NavLink>
            <NavLink to="/admin/businesses" className={linkClass}>
              Businesses
            </NavLink>
            <NavLink to="/admin/disputed" className={linkClass}>
              Disputes
            </NavLink>
            <NavLink to="/admin/audit" className={linkClass}>
              Audit
            </NavLink>
          </nav>
        ) : (
          <p className="p-4 text-xs text-paper/40">Sign in to administer</p>
        )}
        <div className="p-3 border-t border-paper/10 flex items-center justify-between text-xs">
          <Link to="/" className="text-paper/40 hover:text-volt">
            ← Web
          </Link>
          {user && (
            <button
              onClick={async () => {
                await api.post('/auth/sign-out');
                setUser(null);
                navigate('/admin/login');
              }}
              className="text-paper/40 hover:text-paper"
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <header className="lg:hidden h-12 px-4 flex items-center justify-between border-b border-ink/10 bg-ink text-paper">
          <Link to="/admin" className="vyro-display text-sm tracking-tight">
            VYRO CONTROL
          </Link>
          <Link to="/" className="text-[11px] text-paper/50">
            Web
          </Link>
        </header>
        <main className="max-w-stage mx-auto px-4 sm:px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
