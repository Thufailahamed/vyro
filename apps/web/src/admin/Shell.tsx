import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';
import { hasPermission, type AdminRole } from '@vyro/auth';
import { RoleBadge } from './RoleBadge';
import { GlobalSearchBar } from './GlobalSearchBar';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { BellButton } from './BellButton';
import { usePermission } from './lib/permissions';

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
  const searchRef = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shortcuts = useKeyboardShortcuts({ focusSearch: () => searchRef.current?.focus() });
  return (
    <div className="min-h-dvh bg-bone text-ink lg:flex">
      <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-void text-paper h-dvh sticky top-0 border-r border-paper/10 select-none">
        <Link to="/admin" className="flex items-center gap-2.5 px-4 h-14 border-b border-paper/10">
          <BrandMark size={24} tone="volt" />
          <BrandWordmark tone="paper" size="sm" eyebrow="Control" />
        </Link>
        {usePermission('notification:read') ? (
          <div className="px-3 py-2 border-b border-paper/10 flex justify-end">
            <BellButton />
          </div>
        ) : null}
        <div className="px-3 py-2 border-b border-paper/10">
          <GlobalSearchBar ref={searchRef} />
        </div>
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
            <NavLink to="/admin/orders" className={linkClass}>
              Orders
            </NavLink>
            <NavLink to="/admin/deliveries" className={linkClass}>
              Deliveries
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
            {user.adminRole &&
            (hasPermission(user.adminRole, 'health:read') ||
              hasPermission(user.adminRole, 'cron:read')) ? (
              <NavLink to="/admin/observability" className={linkClass}>
                Observability
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
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
            className="text-paper/70 hover:text-volt"
          >
            <span aria-hidden="true">≡</span>
          </button>
          <Link to="/admin" className="vyro-display text-sm tracking-tight">
            VYRO CONTROL
          </Link>
          <Link to="/" className="text-[11px] text-paper/50">
            Web
          </Link>
        </header>
        <main id="main-content" className="max-w-stage mx-auto px-4 sm:px-8 py-8">
          <Outlet />
        </main>
      </div>
      {drawerOpen ? (
        <div
          id="admin-drawer"
          className="lg:hidden fixed inset-0 z-50 bg-ink/70"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-void text-paper flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Admin navigation"
          >
            <Link
              to="/admin"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2.5 px-4 h-14 border-b border-paper/10"
            >
              <BrandMark size={24} tone="volt" />
              <BrandWordmark tone="paper" size="sm" eyebrow="Control" />
            </Link>
            <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
              <NavLink to="/admin" end className={linkClass} onClick={() => setDrawerOpen(false)}>
                Overview
              </NavLink>
              <NavLink to="/admin/suppliers" className={linkClass} onClick={() => setDrawerOpen(false)}>
                Suppliers
              </NavLink>
              <NavLink to="/admin/businesses" className={linkClass} onClick={() => setDrawerOpen(false)}>
                Businesses
              </NavLink>
              <NavLink to="/admin/disputed" className={linkClass} onClick={() => setDrawerOpen(false)}>
                Disputes
              </NavLink>
              <NavLink to="/admin/orders" className={linkClass} onClick={() => setDrawerOpen(false)}>
                Orders
              </NavLink>
              <NavLink to="/admin/deliveries" className={linkClass} onClick={() => setDrawerOpen(false)}>
                Deliveries
              </NavLink>
              <NavLink to="/admin/users" className={linkClass} onClick={() => setDrawerOpen(false)}>
                Users
              </NavLink>
              {user?.adminRole && hasPermission(user.adminRole, 'audit:read') ? (
                <NavLink to="/admin/activity" className={linkClass} onClick={() => setDrawerOpen(false)}>
                  Activity
                </NavLink>
              ) : null}
              {user?.adminRole && hasPermission(user.adminRole, 'admin:role_change') ? (
                <NavLink to="/admin/roles" className={linkClass} onClick={() => setDrawerOpen(false)}>
                  Roles
                </NavLink>
              ) : null}
              {user?.adminRole &&
              (hasPermission(user.adminRole, 'product:read') ||
                hasPermission(user.adminRole, 'category:read') ||
                hasPermission(user.adminRole, 'type:read')) ? (
                <NavLink to="/admin/catalog" className={linkClass} onClick={() => setDrawerOpen(false)}>
                  Catalog
                </NavLink>
              ) : null}
              {user?.adminRole &&
              (hasPermission(user.adminRole, 'payment:read') ||
                hasPermission(user.adminRole, 'payout:read') ||
                hasPermission(user.adminRole, 'ledger:read')) ? (
                <NavLink to="/admin/money" className={linkClass} onClick={() => setDrawerOpen(false)}>
                  Money
                </NavLink>
              ) : null}
              {user?.adminRole &&
              (hasPermission(user.adminRole, 'abuse_report:read') ||
                hasPermission(user.adminRole, 'kyc:read') ||
                hasPermission(user.adminRole, 'user:suspend')) ? (
                <NavLink
                  to="/admin/trust-safety"
                  className={linkClass}
                  onClick={() => setDrawerOpen(false)}
                >
                  Trust &amp; Safety
                </NavLink>
              ) : null}
              {user?.adminRole &&
              (hasPermission(user.adminRole, 'feature_flag:read') ||
                hasPermission(user.adminRole, 'email_template:read') ||
                hasPermission(user.adminRole, 'webhook:read')) ? (
                <NavLink to="/admin/platform" className={linkClass} onClick={() => setDrawerOpen(false)}>
                  Platform
                </NavLink>
              ) : null}
              {user?.adminRole &&
              (hasPermission(user.adminRole, 'session:revoke') ||
                hasPermission(user.adminRole, 'impersonation:start') ||
                hasPermission(user.adminRole, 'data_export:run') ||
                hasPermission(user.adminRole, '2fa:enforce')) ? (
                <NavLink to="/admin/security" className={linkClass} onClick={() => setDrawerOpen(false)}>
                  Security
                </NavLink>
              ) : null}
              {user?.adminRole &&
              (hasPermission(user.adminRole, 'health:read') ||
                hasPermission(user.adminRole, 'cron:read')) ? (
                <NavLink
                  to="/admin/observability"
                  className={linkClass}
                  onClick={() => setDrawerOpen(false)}
                >
                  Observability
                </NavLink>
              ) : null}
            </nav>
            <div className="p-3 border-t border-paper/10 flex items-center justify-between text-xs">
              <Link to="/" className="text-paper/40 hover:text-volt" onClick={() => setDrawerOpen(false)}>
                ← Web
              </Link>
              {user && (
                <button
                  onClick={async () => {
                    setDrawerOpen(false);
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
          </div>
        </div>
      ) : null}
      {shortcuts.helpOpen ? (
        <div
          className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4"
          onClick={() => shortcuts.setHelpOpen(false)}
        >
          <div
            className="bg-paper border border-ink/10 rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-3">Keyboard shortcuts</h3>
            <table className="w-full text-sm">
              <tbody>
                {shortcuts.SHORTCUTS.map(([key, desc]) => (
                  <tr key={key} className="border-t border-ink/10">
                    <td className="py-1 font-mono text-xs">{key}</td>
                    <td className="py-1 text-ink-500">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-ink-500 mt-3">Press ? or Esc to close.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
