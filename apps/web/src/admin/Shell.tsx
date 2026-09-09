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
      <div className="flex items-center justify-center p-16 text-sm text-ink-4">
        Loading control session...
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
    'group relative flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-xs transition-all duration-150 select-none',
    isActive
      ? 'bg-paper/10 text-paper font-semibold shadow-xs before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-volt before:rounded-r'
      : 'text-paper/60 hover:text-paper hover:bg-paper/5',
  );

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
        { to: '/admin/deliveries', label: 'Deliveries', icon: TruckIcon },
        { to: '/admin/disputed', label: 'Disputes', icon: AlertTriangleIcon },
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

  return (
    <div className="min-h-dvh bg-bone text-ink lg:flex">
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-void text-paper h-dvh sticky top-0 border-r border-paper/10 select-none">
        {/* Brand Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-paper/10 shrink-0 bg-void">
          <Link to="/admin" className="flex items-center gap-2.5 group">
            <BrandMark size={22} tone="volt" />
            <div className="flex flex-col">
              <span className="vyro-display text-sm font-bold tracking-wider text-paper group-hover:text-volt transition-colors">
                VYRO
              </span>
              <span className="text-[9px] font-mono tracking-widest text-volt uppercase -mt-0.5">
                Control
              </span>
            </div>
          </Link>
          {hasNotifPerm ? <BellButton /> : null}
        </div>

        {/* Search Command */}
        <div className="px-3 py-2.5 border-b border-paper/10 shrink-0 bg-void">
          <GlobalSearchBar ref={searchRef} />
        </div>

        {/* Navigation grouped list with smooth scroll */}
        {user ? (
          <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin space-y-5">
            {sections.map((section) => {
              const visibleItems = section.items.filter((item) => item.show !== false);
              if (visibleItems.length === 0) return null;
              return (
                <div key={section.title} className="space-y-1">
                  <div className="px-2.5 text-[10px] font-mono font-bold tracking-widest text-paper/35 uppercase">
                    {section.title}
                  </div>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        {...(item.end ? { end: true } : {})}
                        className={navLinkClass}
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                'shrink-0 transition-colors duration-150',
                                isActive ? 'text-volt' : 'text-paper/40 group-hover:text-paper/80',
                              )}
                            >
                              <item.icon size={15} />
                            </span>
                            <span className="truncate flex-1">{item.label}</span>
                            {item.badge ? (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-volt/15 text-volt border border-volt/30">
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
        ) : (
          <p className="p-4 text-xs text-paper/40">Sign in to administer</p>
        )}

        {/* User Session Footer — Always Visible & Fixed at Bottom */}
        <div className="shrink-0 border-t border-paper/10 bg-void p-3 space-y-2.5">
          {user ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="size-7 rounded-xs bg-paper/10 border border-paper/10 text-volt font-mono font-bold text-xs flex items-center justify-center shrink-0">
                  {(user.name || user.email || 'A').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-paper truncate" title={user.name || user.email}>
                    {user.name || (user.email ? user.email.split('@')[0] : 'Operator')}
                  </div>
                  <div className="text-[10px] font-mono text-paper/40 truncate">
                    {user.email || 'Admin Control'}
                  </div>
                </div>
              </div>
              {user.adminRole ? <RoleBadge role={user.adminRole} compact /> : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between pt-2 border-t border-paper/5 text-xs">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-paper/40 hover:text-volt transition-colors"
              title="Return to marketplace"
            >
              <ArrowLeftIcon size={12} />
              <span>Marketplace</span>
            </Link>
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 text-paper/40 hover:text-rose transition-colors cursor-pointer"
                title="Sign out of admin session"
              >
                <LogOutIcon size={12} />
                <span>Sign out</span>
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden h-14 px-4 flex items-center justify-between border-b border-paper/10 bg-void text-paper">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            onClick={() => setDrawerOpen((v) => !v)}
            className="p-1.5 text-paper/70 hover:text-volt transition-colors"
          >
            <MenuIcon size={20} />
          </button>
          <Link to="/admin" className="flex items-center gap-2">
            <BrandMark size={20} tone="volt" />
            <span className="vyro-display text-sm font-bold tracking-wider">VYRO CONTROL</span>
          </Link>
          <div className="flex items-center gap-2">
            {hasNotifPerm ? <BellButton /> : null}
            <Link to="/" className="text-xs text-paper/50 hover:text-volt transition-colors">
              Store
            </Link>
          </div>
        </header>
        <main id="main-content" className="max-w-stage mx-auto px-4 sm:px-8 py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Drawer */}
      {drawerOpen ? (
        <div
          id="admin-drawer"
          className="lg:hidden fixed inset-0 z-50 bg-ink/70 backdrop-blur-xs"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-void text-paper flex flex-col shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Admin navigation"
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-paper/10 shrink-0">
              <Link
                to="/admin"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2.5"
              >
                <BrandMark size={22} tone="volt" />
                <div className="flex flex-col">
                  <span className="vyro-display text-sm font-bold tracking-wider text-paper">
                    VYRO
                  </span>
                  <span className="text-[9px] font-mono tracking-widest text-volt uppercase -mt-0.5">
                    Control
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-paper/50 hover:text-paper"
              >
                <XIcon size={18} />
              </button>
            </div>

            <div className="px-3 py-2.5 border-b border-paper/10 shrink-0">
              <GlobalSearchBar ref={searchRef} />
            </div>

            <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin space-y-5">
              {sections.map((section) => {
                const visibleItems = section.items.filter((item) => item.show !== false);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={section.title} className="space-y-1">
                    <div className="px-2.5 text-[10px] font-mono font-bold tracking-widest text-paper/35 uppercase">
                      {section.title}
                    </div>
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          {...(item.end ? { end: true } : {})}
                          className={navLinkClass}
                          onClick={() => setDrawerOpen(false)}
                        >
                          {({ isActive }) => (
                            <>
                              <span
                                className={cn(
                                  'shrink-0 transition-colors duration-150',
                                  isActive ? 'text-volt' : 'text-paper/40 group-hover:text-paper/80',
                                )}
                              >
                                <item.icon size={15} />
                              </span>
                              <span className="truncate flex-1">{item.label}</span>
                              {item.badge ? (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-volt/15 text-volt border border-volt/30">
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

            <div className="shrink-0 p-3 border-t border-paper/10 bg-void flex items-center justify-between text-xs">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-paper/40 hover:text-volt"
                onClick={() => setDrawerOpen(false)}
              >
                <ArrowLeftIcon size={12} />
                <span>Marketplace</span>
              </Link>
              {user && (
                <button
                  onClick={async () => {
                    setDrawerOpen(false);
                    await handleSignOut();
                  }}
                  className="inline-flex items-center gap-1.5 text-paper/40 hover:text-rose cursor-pointer"
                >
                  <LogOutIcon size={12} />
                  <span>Sign out</span>
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
