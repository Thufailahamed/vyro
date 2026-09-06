import { Link, NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';
import { NoSupplierMembership } from './NoSupplierMembership';
import { SupplierIdProvider } from './useSupplierId';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative block px-3 py-2.5 text-sm tracking-tight transition-all duration-200',
    isActive
      ? 'nav-active text-volt bg-paper/[0.06]'
      : 'text-paper/55 hover:text-paper hover:bg-paper/[0.04]',
  );

const NAV_GROUPS: { label: string; items: { to: string; label: string; end?: boolean }[] }[] = [
  {
    label: 'Operations',
    items: [
      { to: '/supplier', label: 'Dashboard', end: true },
      { to: '/supplier/orders', label: 'Orders' },
      { to: '/supplier/deliveries', label: 'Deliveries' },
      { to: '/supplier/payments', label: 'Payments' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/supplier/products', label: 'Products' },
      { to: '/supplier/pricing', label: 'Pricing' },
      { to: '/supplier/inventory', label: 'Inventory' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/supplier/analytics', label: 'Analytics' },
      { to: '/supplier/customers', label: 'Customers' },
      { to: '/supplier/settings', label: 'Settings' },
    ],
  },
];

export function SupplierShell() {
  const { user, loading } = useAuth();

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

  return (
    <SupplierIdProvider>
      <div className="min-h-dvh bg-bone text-ink lg:flex">
        <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-void text-paper min-h-dvh sticky top-0 border-r border-paper/5">
          <Link
            to="/supplier"
            className="flex items-center gap-2.5 px-4 h-14 border-b border-paper/10 hover:bg-paper/[0.03] transition-colors"
          >
            <BrandMark size={24} tone="volt" />
            <BrandWordmark tone="paper" size="sm" eyebrow="Supplier" />
          </Link>
          <nav className="flex-1 px-2 py-5 space-y-5 overflow-y-auto">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-0.5">
                <div className="px-3 pb-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-paper/30">
                  {group.label}
                </div>
                {group.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end ?? false} className={linkClass}>
                    {n.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-paper/10 space-y-2">
            <div className="px-2 truncate text-[11px] text-paper/45" title={membership.supplierName}>
              {membership.supplierName}
            </div>
            <div className="flex items-center justify-between text-xs px-2">
              <Link to="/" className="text-paper/40 hover:text-volt transition-colors">
                ← Web
              </Link>
              <span className="text-paper/30 capitalize">{membership.role}</span>
            </div>
          </div>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col">
          <header className="lg:hidden sticky top-0 z-20 border-b border-paper/10 bg-ink text-paper">
            <div className="h-12 px-4 flex items-center justify-between">
              <Link to="/supplier" className="flex items-center gap-2">
                <BrandMark size={18} tone="volt" />
                <span className="vyro-display text-sm tracking-tight">VYRO SUPPLIER</span>
              </Link>
              <Link to="/" className="text-[11px] text-paper/50 hover:text-volt transition-colors">
                Web
              </Link>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-2 pb-2 scrollbar-none">
              {NAV_GROUPS.flatMap((g) => g.items).map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end ?? false}
                  className={({ isActive }) =>
                    cn(
                      'shrink-0 px-3 py-1.5 text-[11px] uppercase tracking-wider border transition-colors',
                      isActive
                        ? 'bg-volt text-ink border-volt'
                        : 'border-paper/15 text-paper/60 hover:text-paper',
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </header>
          <main className="flex-1 max-w-stage w-full mx-auto px-4 sm:px-8 py-8 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </SupplierIdProvider>
  );
}
