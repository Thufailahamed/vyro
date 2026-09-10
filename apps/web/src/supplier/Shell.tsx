import { useState } from 'react';
import { Link, NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { BrandMark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';
import { NoSupplierMembership } from './NoSupplierMembership';
import { SupplierIdProvider } from './useSupplierId';
import {
  LayoutGridIcon,
  PackageIcon,
  TruckIcon,
  BanknoteIcon,
  LayersIcon,
  PercentIcon,
  WarehouseIcon,
  TrendingUpIcon,
  UsersIcon,
  SettingsIcon,
  BellIcon,
  ArrowLeftIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
  SparklesIcon,
  FileTextIcon,
} from '@/components/icons';

interface SupplierNavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  end?: boolean;
  badge?: string;
}

interface SupplierNavGroup {
  label: string;
  items: SupplierNavItem[];
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'group relative flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-all duration-150 select-none',
    isActive
      ? 'bg-paper/10 text-paper font-semibold shadow-xs before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-volt before:rounded-r'
      : 'text-paper/60 hover:text-paper hover:bg-paper/5',
  );

const NAV_GROUPS: SupplierNavGroup[] = [
  {
    label: 'Operations',
    items: [
      { to: '/supplier', label: 'Dashboard', icon: LayoutGridIcon, end: true },
      { to: '/supplier/orders', label: 'Orders', icon: PackageIcon },
      { to: '/supplier/quotes', label: 'Quote Requests', icon: FileTextIcon },
      { to: '/supplier/deliveries', label: 'Deliveries', icon: TruckIcon },
      { to: '/supplier/payments', label: 'Payments', icon: BanknoteIcon },
    ],
  },
  {
    label: 'Catalog & Stock',
    items: [
      { to: '/supplier/products', label: 'Products', icon: LayersIcon },
      { to: '/supplier/pricing', label: 'Pricing Rules', icon: PercentIcon },
      { to: '/supplier/inventory', label: 'Inventory', icon: WarehouseIcon },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/supplier/analytics', label: 'Analytics', icon: TrendingUpIcon },
      { to: '/supplier/customers', label: 'Customers', icon: UsersIcon },
      { to: '/supplier/settings', label: 'Facility Settings', icon: SettingsIcon },
    ],
  },
];

export function SupplierShell() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: notif } = useQuery({
    queryKey: ['notifications-me'],
    queryFn: () => api.get<{ unreadCount: number }>('/notifications/me?limit=1'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unread = notif?.unreadCount ?? 0;
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-bone text-sm text-ink-4">
        Loading supplier workspace…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const membership = user.supplierMemberships?.[0];
  if (!membership) return <NoSupplierMembership />;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <SupplierIdProvider>
      <div className="min-h-dvh bg-bone text-ink lg:flex">
        {/* Desktop Sticky Sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-void text-paper h-dvh sticky top-0 border-r border-paper/10 select-none">
          {/* Brand Header & Notification Bell */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-paper/10 shrink-0 bg-void">
            <Link to="/supplier" className="flex items-center gap-2.5 group">
              <BrandMark size={22} tone="volt" />
              <div className="flex flex-col">
                <span className="vyro-display text-sm font-bold tracking-wider text-paper group-hover:text-volt transition-colors">
                  VYRO
                </span>
                <span className="text-[9px] font-mono tracking-widest text-volt uppercase -mt-0.5">
                  Supplier Hub
                </span>
              </div>
            </Link>

            {/* Signals / Notification Bell */}
            <Link
              to="/notifications"
              className="relative p-1.5 rounded-md text-paper/60 hover:text-volt hover:bg-paper/10 transition-colors"
              title="Notifications & Signals"
            >
              <BellIcon size={16} />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-volt text-ink text-[9px] font-mono font-bold flex items-center justify-center shadow-xs">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          </div>

          {/* Active Depot Context Card */}
          <div className="px-3 py-2.5 border-b border-paper/10 bg-void">
            <div className="flex items-center gap-2.5 p-2 rounded-lg bg-paper/[0.04] border border-paper/10">
              <div className="size-7 rounded bg-volt/15 border border-volt/30 text-volt font-mono font-bold text-xs flex items-center justify-center shrink-0">
                {(membership.supplierName || 'D').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-xs font-semibold text-paper truncate"
                  title={membership.supplierName}
                >
                  {membership.supplierName}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-mint shrink-0" />
                  <span className="text-[10px] font-mono text-paper/50 uppercase tracking-wider truncate">
                    Active Depot
                  </span>
                  <span className="text-[9px] font-mono uppercase px-1 rounded bg-paper/10 text-volt shrink-0 font-medium">
                    {membership.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Grouped Navigation Links with Icons */}
          <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin space-y-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <div className="px-2.5 text-[10px] font-mono font-bold tracking-widest text-paper/35 uppercase">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end ?? false}
                      className={navLinkClass}
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              'shrink-0 transition-colors duration-150',
                              isActive
                                ? 'text-volt'
                                : 'text-paper/40 group-hover:text-paper/80',
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
            ))}
          </nav>

          {/* User Session Footer — Always Visible at Bottom */}
          <div className="shrink-0 border-t border-paper/10 bg-void p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="size-7 rounded bg-paper/10 border border-paper/10 text-paper font-mono font-bold text-xs flex items-center justify-center shrink-0">
                  {(user.name || user.email || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div
                    className="text-xs font-medium text-paper truncate"
                    title={user.name || user.email}
                  >
                    {user.name || user.email.split('@')[0]}
                  </div>
                  <div className="text-[10px] font-mono text-paper/40 truncate">
                    {user.email}
                  </div>
                </div>
              </div>
              <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-paper/10 text-paper/60 shrink-0">
                {membership.role}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-paper/5 text-xs">
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-paper/40 hover:text-volt transition-colors"
                title="Return to marketplace"
              >
                <ArrowLeftIcon size={12} />
                <span>Store</span>
              </Link>

              <div className="flex items-center gap-3">
                {user.isAdmin ? (
                  <Link
                    to="/admin"
                    className="inline-flex items-center gap-1 text-[11px] text-paper/40 hover:text-volt transition-colors"
                    title="Switch to Admin Control"
                  >
                    <SparklesIcon size={12} />
                    <span>Control</span>
                  </Link>
                ) : null}

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1 text-paper/40 hover:text-rose transition-colors cursor-pointer"
                  title="Sign out of supplier session"
                >
                  <LogOutIcon size={12} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile Header */}
          <header className="lg:hidden sticky top-0 z-20 border-b border-paper/10 bg-void text-paper">
            <div className="h-14 px-4 flex items-center justify-between">
              <button
                type="button"
                aria-label="Open navigation"
                aria-expanded={drawerOpen}
                aria-controls="supplier-drawer"
                onClick={() => setDrawerOpen((v) => !v)}
                className="p-1.5 text-paper/70 hover:text-volt transition-colors"
              >
                <MenuIcon size={20} />
              </button>

              <Link to="/supplier" className="flex items-center gap-2">
                <BrandMark size={20} tone="volt" />
                <span className="vyro-display text-sm font-bold tracking-wider">
                  VYRO SUPPLIER
                </span>
              </Link>

              <Link
                to="/notifications"
                className="relative p-1.5 text-paper/70 hover:text-volt transition-colors"
                title="Notifications"
              >
                <BellIcon size={18} />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 size-2 bg-volt rounded-full" />
                )}
              </Link>
            </div>
          </header>

          <main
            id="main-content"
            className="flex-1 max-w-stage w-full mx-auto px-4 sm:px-8 py-8 animate-fade-in"
          >
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile Drawer */}
      {drawerOpen ? (
        <div
          id="supplier-drawer"
          className="lg:hidden fixed inset-0 z-50 bg-ink/70 backdrop-blur-xs"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-void text-paper flex flex-col shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Supplier navigation"
          >
            {/* Mobile Drawer Header */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-paper/10">
              <Link
                to="/supplier"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2.5"
              >
                <BrandMark size={22} tone="volt" />
                <div className="flex flex-col">
                  <span className="vyro-display text-sm font-bold tracking-wider">
                    VYRO
                  </span>
                  <span className="text-[9px] font-mono tracking-widest text-volt uppercase -mt-0.5">
                    Supplier Hub
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-paper/60 hover:text-paper"
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Mobile Drawer Depot Card */}
            <div className="px-3 py-2.5 border-b border-paper/10 bg-paper/[0.02]">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-paper/[0.04] border border-paper/10">
                <div className="size-7 rounded bg-volt/15 border border-volt/30 text-volt font-mono font-bold text-xs flex items-center justify-center shrink-0">
                  {(membership.supplierName || 'D').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-paper truncate">
                    {membership.supplierName}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-mint shrink-0" />
                    <span className="text-[10px] font-mono text-paper/50 uppercase">
                      Active Depot
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile Drawer Links */}
            <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-2.5 text-[10px] font-mono font-bold tracking-widest text-paper/35 uppercase">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end ?? false}
                        className={navLinkClass}
                        onClick={() => setDrawerOpen(false)}
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                'shrink-0 transition-colors duration-150',
                                isActive ? 'text-volt' : 'text-paper/40',
                              )}
                            >
                              <item.icon size={15} />
                            </span>
                            <span className="truncate flex-1">{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            {/* Mobile Drawer Footer */}
            <div className="p-3 border-t border-paper/10 space-y-2 bg-void">
              <div className="flex items-center justify-between text-xs px-1">
                <Link
                  to="/"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex items-center gap-1 text-paper/50 hover:text-volt"
                >
                  <ArrowLeftIcon size={12} />
                  <span>Store</span>
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1 text-paper/50 hover:text-rose cursor-pointer"
                >
                  <LogOutIcon size={12} />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </SupplierIdProvider>
  );
}

