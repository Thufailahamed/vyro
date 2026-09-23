import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate, Navigate } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { BrandMark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';
import { hasPermission, type AdminRole } from '@vyro/auth';
import { RoleBadge } from './RoleBadge';
import { GlobalSearchBar } from './GlobalSearchBar';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { BellButton } from './BellButton';
import { usePermission } from './lib/permissions';
import {
  LayoutGridIcon,
  PackageIcon,
  TruckIcon,
  AlertTriangleIcon,
  StoreIcon,
  Building2Icon,
  LayersIcon,
  BanknoteIcon,
  CreditCardIcon,
  UsersIcon,
  UserCheckIcon,
  ShieldCheckIcon,
  ClockIcon,
  Edit3Icon,
  TrendingUpIcon,
  SparklesIcon,
  LogOutIcon,
  ArrowLeftIcon,
  MenuIcon,
  XIcon,
  FileTextIcon,
  GraduationCapIcon,
  RefreshCwIcon,
  SettingsIcon,
} from '@/components/icons';

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
      <div className="flex flex-col items-center justify-center gap-3 p-24 text-sm text-ink-4">
        <svg className="size-5 animate-spin text-ink-4" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading control session…
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

interface NavItem {
  to: string;
  label: string;
  icon: (props: { size?: number | string; className?: string }) => ReactNode;
  end?: boolean;
  badge?: string;
  show?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150 select-none',
    isActive
      ? 'bg-paper/[0.09] text-paper before:absolute before:-left-3 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-full before:bg-volt'
      : 'text-paper/55 hover:bg-paper/[0.05] hover:text-paper',
  );

function NavSections({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Admin">
      {sections.map((section) => {
        const visibleItems = section.items.filter((item) => item.show !== false);
        if (visibleItems.length === 0) return null;
        return (
          <div key={section.title}>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-paper/30">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  {...(item.end ? { end: true } : {})}
                  className={navLinkClass}
                  {...(onNavigate ? { onClick: onNavigate } : {})}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={cn(
                          'shrink-0 transition-colors duration-150',
                          isActive ? 'text-volt' : 'text-paper/35 group-hover:text-paper/75',
                        )}
                      >
                        <item.icon size={16} />
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-full bg-volt/15 px-1.5 text-[10px] font-semibold text-volt">
                          {item.badge}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function ControlWordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-paper/[0.06] shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
        <BrandMark size={18} tone="volt" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="vyro-display text-[15px] tracking-wide text-paper">VYRO</span>
        <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-volt">Control</span>
      </span>
    </span>
  );
}

export function AdminShell() {
  const { user, setUser } = useAdminAuth();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const shortcuts = useKeyboardShortcuts({ focusSearch: () => searchRef.current?.focus() });

  const role = user?.adminRole ?? null;
  const hasNotifPerm = usePermission('notification:read');

  const sections: NavSection[] = [
    {
      title: 'Operations',
      items: [
        { to: '/admin', label: 'Overview', icon: LayoutGridIcon, end: true },
        { to: '/admin/orders', label: 'Orders', icon: PackageIcon },
        { to: '/admin/rfqs', label: 'RFQs', icon: FileTextIcon },
        { to: '/admin/learning', label: 'Training center', icon: GraduationCapIcon },
        { to: '/admin/deliveries', label: 'Deliveries', icon: TruckIcon },
        { to: '/admin/disputed', label: 'Disputes', icon: AlertTriangleIcon },
        { to: '/admin/returns', label: 'Returns', icon: RefreshCwIcon },
        { to: '/admin/reviews/flags', label: 'Review Flags', icon: AlertTriangleIcon },
      ],
    },
    {
      title: 'Commerce & Supply',
      items: [
        { to: '/admin/suppliers', label: 'Suppliers', icon: StoreIcon },
        { to: '/admin/businesses', label: 'Businesses', icon: Building2Icon },
        {
          to: '/admin/catalog',
          label: 'Catalog',
          icon: LayersIcon,
          show:
            !role ||
            hasPermission(role, 'product:read') ||
            hasPermission(role, 'category:read') ||
            hasPermission(role, 'type:read'),
        },
        {
          to: '/admin/money',
          label: 'Money & Orders',
          icon: BanknoteIcon,
          show:
            !role ||
            hasPermission(role, 'payment:read') ||
            hasPermission(role, 'payout:read') ||
            hasPermission(role, 'ledger:read'),
        },
        {
          to: '/admin/accounts',
          label: 'Accounts',
          icon: BanknoteIcon,
          show:
            !role ||
            hasPermission(role, 'financial_report:read') ||
            hasPermission(role, 'payment:read'),
        },
        {
          to: '/admin/finance',
          label: 'Finance Ops',
          icon: CreditCardIcon,
          show:
            !role ||
            hasPermission(role, 'payment:read') ||
            hasPermission(role, 'payout:read') ||
            hasPermission(role, 'invoice:read'),
        },
      ],
    },
    {
      title: 'Governance & Access',
      items: [
        { to: '/admin/users', label: 'Users', icon: UsersIcon, show: !role || hasPermission(role, 'user:read') },
        {
          to: '/admin/roles',
          label: 'Roles & Invites',
          icon: UserCheckIcon,
          show: !role || hasPermission(role, 'admin:role_change') || hasPermission(role, 'admin:invite'),
        },
        {
          to: '/admin/trust-safety',
          label: 'Trust & Safety',
          icon: ShieldCheckIcon,
          show:
            !role ||
            hasPermission(role, 'abuse_report:read') ||
            hasPermission(role, 'kyc:read') ||
            hasPermission(role, 'user:suspend'),
        },
        {
          to: '/admin/activity',
          label: 'Audit Activity',
          icon: ClockIcon,
          show: !role || hasPermission(role, 'audit:read'),
        },
      ],
    },
    {
      title: 'System & Platform',
      items: [
        {
          to: '/admin/platform',
          label: 'Platform Config',
          icon: Edit3Icon,
          show:
            !role ||
            hasPermission(role, 'feature_flag:read') ||
            hasPermission(role, 'email_template:read') ||
            hasPermission(role, 'webhook:read'),
        },
        {
          to: '/admin/order-lifecycle',
          label: 'Order Lifecycle',
          icon: SettingsIcon,
          show: !role || hasPermission(role, 'feature_flag:read'),
        },
        {
          to: '/admin/security',
          label: 'Security & 2FA',
          icon: ShieldCheckIcon,
          show:
            !role ||
            hasPermission(role, 'session:revoke') ||
            hasPermission(role, 'impersonation:start') ||
            hasPermission(role, 'data_export:run') ||
            hasPermission(role, '2fa:enforce'),
        },
        {
          to: '/admin/observability',
          label: 'Observability',
          icon: TrendingUpIcon,
          show: !role || hasPermission(role, 'health:read') || hasPermission(role, 'cron:read'),
        },
        {
          to: '/admin/ai-usage',
          label: 'AI Usage & Costs',
          icon: SparklesIcon,
        },
      ],
    },
  ];

  const handleSignOut = async () => {
    await api.post('/auth/sign-out');
    setUser(null);
    navigate('/admin/login');
  };

  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'Operator');
  const initial = (user?.name || user?.email || 'A').charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh bg-bone text-ink lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 select-none flex-col bg-void text-paper lg:flex">
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <Link to="/admin" className="group" aria-label="VYRO Control overview">
            <ControlWordmark />
          </Link>
          {hasNotifPerm ? <BellButton /> : null}
        </div>

        <div className="shrink-0 px-3 pb-2">
          <GlobalSearchBar ref={searchRef} />
        </div>

        {user ? <NavSections sections={sections} /> : <p className="flex-1 p-5 text-xs text-paper/40">Sign in to administer</p>}

        <div className="shrink-0 space-y-3 border-t border-paper/[0.07] p-3">
          {user ? (
            <div className="flex items-center gap-3 rounded-xl bg-paper/[0.04] p-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-volt text-sm font-bold text-ink">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-paper" title={user.name || user.email}>
                  {displayName}
                </div>
                <div className="mt-0.5">
                  {user.adminRole ? (
                    <RoleBadge role={user.adminRole} compact />
                  ) : (
                    <span className="truncate text-[11px] text-paper/40">{user.email || 'Admin Control'}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-paper/40 transition-colors hover:bg-rose/15 hover:text-rose"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOutIcon size={15} />
              </button>
            </div>
          ) : null}

          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-paper/40 transition-colors hover:text-volt"
          >
            <ArrowLeftIcon size={12} />
            Back to marketplace
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-void px-4 text-paper lg:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-lg text-paper/70 transition-colors hover:bg-paper/10 hover:text-volt"
          >
            <MenuIcon size={20} />
          </button>
          <Link to="/admin" aria-label="VYRO Control overview">
            <ControlWordmark />
          </Link>
          <div className="flex items-center gap-1">{hasNotifPerm ? <BellButton /> : <span className="size-9" />}</div>
        </header>

        <main id="main-content" className="mx-auto max-w-stage px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div
          id="admin-drawer"
          className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-sm lg:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-void text-paper shadow-5 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Admin navigation"
          >
            <div className="flex h-16 shrink-0 items-center justify-between px-5">
              <Link to="/admin" onClick={() => setDrawerOpen(false)}>
                <ControlWordmark />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="flex size-8 items-center justify-center rounded-lg text-paper/50 hover:bg-paper/10 hover:text-paper"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="shrink-0 px-3 pb-2">
              <GlobalSearchBar ref={searchRef} />
            </div>

            <NavSections sections={sections} onNavigate={() => setDrawerOpen(false)} />

            <div className="flex shrink-0 items-center justify-between border-t border-paper/[0.07] p-4 text-xs">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-paper/40 hover:text-volt"
                onClick={() => setDrawerOpen(false)}
              >
                <ArrowLeftIcon size={12} />
                Marketplace
              </Link>
              {user && (
                <button
                  type="button"
                  onClick={async () => {
                    setDrawerOpen(false);
                    await handleSignOut();
                  }}
                  className="inline-flex items-center gap-1.5 text-paper/40 hover:text-rose"
                >
                  <LogOutIcon size={12} />
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {shortcuts.helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          onClick={() => shortcuts.setHelpOpen(false)}
        >
          <div
            className="vyro-floating w-full max-w-md p-6 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Keyboard shortcuts"
          >
            <h3 className="font-sans text-base font-semibold tracking-normal text-ink">Keyboard shortcuts</h3>
            <dl className="mt-4 divide-y divide-ink/[0.07]">
              {shortcuts.SHORTCUTS.map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <dt className="text-ink-3">{desc}</dt>
                  <dd>
                    <kbd className="rounded-md bg-bone px-2 py-0.5 font-mono text-xs text-ink shadow-[inset_0_-1px_0_rgba(12,14,11,0.15),inset_0_0_0_1px_rgba(12,14,11,0.1)]">
                      {key}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <p className={cn('mt-4 text-xs text-ink-4')}>Press ? or Esc to close.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
