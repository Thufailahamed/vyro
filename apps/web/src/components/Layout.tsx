import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  SearchIcon,
  ShoppingCartIcon,
  PackageIcon,
  StoreIcon,
  Building2Icon,
  LogOutIcon,
  ShieldCheckIcon,
  TruckIcon,
  FileTextIcon,
} from './icons';
import { Button } from './ui';

export function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const businessId = user?.memberships?.[0]?.businessId;
  const isSupplier = (user?.supplierMemberships?.length ?? 0) > 0;

  const { data: cartData } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string }> }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const cartCount = cartData?.items?.length ?? 0;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? 'bg-brand-50 text-brand-700 shadow-soft-sm font-semibold'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-700 via-brand-600 to-sky-400 flex items-center justify-center text-white shadow-soft-sm group-hover:scale-105 transition-transform">
                <span className="font-black tracking-tighter text-lg">V</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-xl tracking-tight text-slate-900 group-hover:text-brand-700 transition-colors">
                    VYRO
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded bg-slate-100 text-slate-600 border border-slate-200">
                    LK
                  </span>
                </div>
                <span className="text-[10px] text-slate-600 -mt-1 font-medium hidden sm:inline">
                  B2B Procurement Platform
                </span>
              </div>
            </Link>

            {/* Main Navigation links */}
            <nav className="hidden md:flex items-center gap-1">
              <NavLink to="/search" className={navLinkClass}>
                <SearchIcon size={16} />
                <span>Search Products</span>
              </NavLink>

              {user && (
                <NavLink to="/orders" className={navLinkClass}>
                  <PackageIcon size={16} />
                  <span>My Orders</span>
                </NavLink>
              )}

              {user && isSupplier && (
                <NavLink to="/supplier/orders" className={navLinkClass}>
                  <StoreIcon size={16} />
                  <span>Supplier Inbox</span>
                </NavLink>
              )}
            </nav>
          </div>

          {/* Right Header: Cart + Profile + Auth */}
          <div className="flex items-center gap-2.5">
            <NavLink
              to="/cart"
              className={({ isActive }) =>
                `relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`
              }
            >
              <ShoppingCartIcon size={18} />
              <span className="hidden sm:inline">Cart</span>
              {cartCount > 0 && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-brand-600 rounded-full animate-in zoom-in-75">
                  {cartCount}
                </span>
              )}
            </NavLink>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  to="/profile"
                  className="flex items-center gap-2.5 p-1.5 pr-3 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 font-semibold text-xs flex items-center justify-center border border-brand-200">
                    {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
                  </div>
                  <div className="hidden lg:flex flex-col text-left">
                    <span className="text-xs font-semibold text-slate-800 leading-tight">
                      {user.name}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      {user.memberships?.[0]?.businessName ?? (isSupplier ? 'Supplier' : 'Buyer')}
                    </span>
                  </div>
                </Link>

                <button
                  title="Sign out"
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <LogOutIcon size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <NavLink to="/login">
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </NavLink>
                <NavLink to="/signup">
                  <Button variant="primary" size="sm">
                    Create Account
                  </Button>
                </NavLink>
              </div>
            )}
          </div>
        </div>

        {/* Mobile secondary navigation */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-100 px-3 py-2 bg-slate-50/70 text-xs">
          <NavLink to="/search" className="flex items-center gap-1 text-slate-700 font-medium py-1">
            <SearchIcon size={15} /> Search
          </NavLink>
          {user && (
            <NavLink to="/orders" className="flex items-center gap-1 text-slate-700 font-medium py-1">
              <PackageIcon size={15} /> Orders
            </NavLink>
          )}
          {user && isSupplier && (
            <NavLink to="/supplier/orders" className="flex items-center gap-1 text-slate-700 font-medium py-1">
              <StoreIcon size={15} /> Inbox
            </NavLink>
          )}
          <NavLink to="/profile" className="flex items-center gap-1 text-slate-700 font-medium py-1">
            <Building2Icon size={15} /> Account
          </NavLink>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Professional Footer */}
      <footer className="border-t border-slate-200 bg-white mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          
          {/* Trust Value Props Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12 border-b border-slate-100">
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <ShieldCheckIcon size={22} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Verified Sri Lankan Suppliers</h4>
                <p className="text-xs text-slate-500 mt-0.5">Strict business authentication with local VAT/BR and address verification.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <FileTextIcon size={22} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Transparent LKR Pricing</h4>
                <p className="text-xs text-slate-500 mt-0.5">Direct manufacturer wholesale quotes without hidden commissions or FX markups.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <TruckIcon size={22} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Purchase Order Lifecycle</h4>
                <p className="text-xs text-slate-500 mt-0.5">Automated PO generation, supplier acceptance, and audited dispute resolution.</p>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-slate-700">VYRO</span>
              <span>•</span>
              <span>Sri Lanka's B2B Wholesale & Procurement Infrastructure</span>
            </div>
            <div className="flex items-center gap-6">
              <Link to="/search" className="hover:text-slate-900 transition-colors">Catalog</Link>
              <Link to="/onboarding/business" className="hover:text-slate-900 transition-colors">Register Business</Link>
              <Link to="/onboarding/supplier" className="hover:text-slate-900 transition-colors">Become a Supplier</Link>
            </div>
            <div>
              © {new Date().getFullYear()} VYRO Technologies. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
