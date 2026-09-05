import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';
import { hasPermission, type AdminRole } from '@vyro/auth';
import { RoleBadge } from './RoleBadge';

export interface AdminUser {
  isAdmin: boolean;
  email?: string;
  name?: string;
  adminRole?: AdminRole | null;
}

export interface AdminAuthState {
  user: AdminUser | null;
  setUser: (u: AdminUser | null) => void;
  refresh: () => Promise<AdminUser | null>;
  loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthState>({
  user: null,
  setUser: () => {},
  refresh: async () => null,
  loading: true,
});

export const useAdminAuth = () => useContext(AdminAuthContext);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const d = await api.get<{ user: AdminUser | null }>('/auth/me');
      setUser(d.user);
      return d.user;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <AdminAuthContext.Provider value={{ user, setUser, refresh, loading }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAdminAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-ink-4">
        Loading control session...
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.isAdmin) return <Navigate to="/admin/login" replace />;
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
            <NavLink to="/admin/users" className={linkClass}>
              Users
            </NavLink>
            {user.adminRole && hasPermission(user.adminRole, 'audit:read') ? (
              <NavLink to="/admin/activity" className={linkClass}>
                Activity
              </NavLink>
            ) : null}
            {user.adminRole && hasPermission(user.adminRole, 'admin:role_change') ? (
              <NavLink to="/admin/roles" className={linkClass}>
                Roles
              </NavLink>
            ) : null}
            {user.adminRole &&
            (hasPermission(user.adminRole, 'product:read') ||
              hasPermission(user.adminRole, 'category:read') ||
              hasPermission(user.adminRole, 'type:read')) ? (
              <NavLink to="/admin/catalog" className={linkClass}>
                Catalog
              </NavLink>
            ) : null}
            {user.adminRole &&
            (hasPermission(user.adminRole, 'payment:read') ||
              hasPermission(user.adminRole, 'payout:read') ||
              hasPermission(user.adminRole, 'ledger:read')) ? (
              <NavLink to="/admin/money" className={linkClass}>
                Money
              </NavLink>
            ) : null}
            {user.adminRole &&
            (hasPermission(user.adminRole, 'abuse_report:read') ||
              hasPermission(user.adminRole, 'kyc:read') ||
              hasPermission(user.adminRole, 'user:suspend')) ? (
              <NavLink to="/admin/trust-safety" className={linkClass}>
                Trust &amp; Safety
              </NavLink>
            ) : null}
            {user.adminRole &&
            (hasPermission(user.adminRole, 'feature_flag:read') ||
              hasPermission(user.adminRole, 'email_template:read') ||
              hasPermission(user.adminRole, 'webhook:read')) ? (
              <NavLink to="/admin/platform" className={linkClass}>
                Platform
              </NavLink>
            ) : null}
            {user.adminRole &&
            (hasPermission(user.adminRole, 'session:revoke') ||
              hasPermission(user.adminRole, 'impersonation:start') ||
              hasPermission(user.adminRole, 'data_export:run') ||
              hasPermission(user.adminRole, '2fa:enforce')) ? (
              <NavLink to="/admin/security" className={linkClass}>
                Security
              </NavLink>
            ) : null}
          </nav>
        ) : (
          <p className="p-4 text-xs text-paper/40">Sign in to administer</p>
        )}
        {user?.adminRole ? (
          <div className="px-3 py-2 border-t border-paper/10">
            <RoleBadge role={user.adminRole} />
          </div>
        ) : null}
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
