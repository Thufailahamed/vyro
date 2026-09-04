import { Link, NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { cn } from '@vyro/ui';
import { NoSupplierMembership } from './NoSupplierMembership';
import { SupplierIdProvider } from './useSupplierId';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative block px-3 py-2 text-sm transition-colors',
    isActive ? 'nav-active text-volt' : 'text-paper/60 hover:text-paper hover:bg-paper/5',
  );

const NAV = [
  { to: '/supplier', label: 'Dashboard', end: true },
  { to: '/supplier/products', label: 'Products' },
  { to: '/supplier/pricing', label: 'Pricing' },
  { to: '/supplier/inventory', label: 'Inventory' },
  { to: '/supplier/analytics', label: 'Analytics' },
  { to: '/supplier/customers', label: 'Customers' },
  { to: '/supplier/deliveries', label: 'Deliveries' },
  { to: '/supplier/payments', label: 'Payments' },
  { to: '/supplier/settings', label: 'Settings' },
];

export function SupplierShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16 text-sm text-ink-4">
        Loading supplier workspace...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const membership = user.supplierMemberships?.[0];
  if (!membership) return <NoSupplierMembership />;

  return (
    <SupplierIdProvider>
      <div className="min-h-dvh bg-bone text-ink lg:flex">
        <aside className="hidden lg:flex w-56 shrink-0 flex-col bg-void text-paper min-h-dvh sticky top-0">
          <Link to="/supplier" className="flex items-center gap-2.5 px-4 h-14 border-b border-paper/10">
            <BrandMark size={24} tone="volt" />
            <BrandWordmark tone="paper" size="sm" eyebrow="Supplier" />
          </Link>
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end ?? false}
                className={linkClass}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="p-3 border-t border-paper/10 flex items-center justify-between text-xs">
            <Link to="/" className="text-paper/40 hover:text-volt">
              ← Web
            </Link>
            <span className="text-paper/30 truncate ml-2" title={membership.supplierName}>
              {membership.role}
            </span>
          </div>
        </aside>
        <div className="flex-1 min-w-0">
          <header className="lg:hidden h-12 px-4 flex items-center justify-between border-b border-ink/10 bg-ink text-paper">
            <Link to="/supplier" className="vyro-display text-sm tracking-tight">
              VYRO SUPPLIER
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
    </SupplierIdProvider>
  );
}
