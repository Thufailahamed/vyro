import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  SearchIcon,
  ShoppingCartIcon,
  PackageIcon,
  StoreIcon,
  LogOutIcon,
  TruckIcon,
  FileTextIcon,
  LayoutGridIcon,
  BellIcon,
  UserIcon,
  ShieldCheckIcon,
  SparklesIcon,
  BanknoteIcon,
  MenuIcon,
  XIcon,
} from './icons';
import { Button } from './ui';
import { BrandMark, BrandWordmark } from './brand/BrandMark';
import { FlowPathMini } from './brand/FlowLine';
import { cn } from '@vyro/ui';
import { CookieConsentBanner } from './CookieConsentBanner';
import { AskVyroFloat } from '@/ai/AskVyroFloat';

function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex gap-4 ${className}`} aria-label="Legal">
      <Link to="/legal/terms" className="hover:underline">Terms</Link>
      <Link to="/legal/privacy" className="hover:underline">Privacy</Link>
      <Link to="/legal/cookies" className="hover:underline">Cookies</Link>
    </nav>
  );
}

export function Layout() {
  const location = useLocation();
  const isAuth = location.pathname === '/login' || location.pathname === '/signup';
  if (isAuth) return (
    <>
      <Outlet />
      <CookieConsentBanner />
    </>
  );
  const isOnboarding = location.pathname.startsWith('/onboarding');
  if (isOnboarding) return <OnboardingShell />;
  const isMarketing = ['/', '/about', '/how-it-works'].includes(location.pathname);
  if (isMarketing) return <MarketingShell />;
  return <WorkspaceShell />;
}

function OnboardingShell() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-dvh bg-bone text-ink flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-ink focus:text-volt focus:text-sm"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-bone/95 backdrop-blur-sm">
        <div className="max-w-stage mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark size={28} />
            <BrandWordmark size="sm" />
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/search" className="text-ink-4 hover:text-ink transition-colors">
              Browse Catalog
            </Link>
            {user && (
              <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-ink/10">
                <span className="text-ink-3">{user.email}</span>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-copper hover:text-ink transition-colors cursor-pointer"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1 max-w-stage mx-auto w-full px-5 sm:px-8 py-8 sm:py-12">
        <Outlet />
      </main>
      <footer className="border-t border-ink/10 py-6 bg-bone text-[11px] text-ink-4">
        <div className="max-w-stage mx-auto px-5 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>VYRO Platform · Commercial Procurement Network</span>
          <LegalLinks />
          <span>Encrypted Audit Trail · Sri Lanka</span>
        </div>
      </footer>
      <CookieConsentBanner />
    </div>
  );
}

function MarketingShell() {
  const { user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  const navLinks = [
    { to: '/how-it-works', label: 'How it works' },
    { to: '/about', label: 'About' },
    { to: '/search', label: 'Catalog' },
    { to: '/onboarding/supplier', label: 'For suppliers' },
    { to: '/onboarding/business', label: 'For buyers' },
  ];

  return (
    <div className="min-h-dvh bg-bone text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-ink focus:text-volt focus:text-sm"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-bone/90 backdrop-blur-md">
        <div className="max-w-stage mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <BrandMark size={28} />
            <BrandWordmark size="sm" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            {navLinks.slice(0, 4).map((link) => (
              <Link key={link.to} to={link.to} className="text-ink-3 hover:text-ink transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm">Open workspace</Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline-flex">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Start procuring</Button>
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="md:hidden size-10 -mr-2 inline-flex items-center justify-center text-ink hover:bg-ink/5 active:bg-ink/10 transition-colors rounded-md"
            >
              <MenuIcon size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile marketing drawer */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-50 transition-opacity duration-200',
          mobileNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden={!mobileNavOpen}
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
          className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Marketing navigation"
          className={cn(
            'absolute inset-y-0 right-0 w-[88%] max-w-sm bg-paper shadow-2xl flex flex-col transition-transform duration-300 ease-out',
            mobileNavOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex items-center justify-between px-5 h-16 border-b border-ink/10 shrink-0">
            <Link to="/" onClick={() => setMobileNavOpen(false)} className="flex items-center gap-3 min-w-0">
              <BrandMark size={26} />
              <BrandWordmark size="sm" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close"
              className="size-10 -mr-2 inline-flex items-center justify-center text-ink hover:bg-ink/5 rounded-md"
            >
              <XIcon size={20} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors min-h-[44px]',
                      isActive ? 'bg-ink text-paper' : 'text-ink hover:bg-bone',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="p-4 border-t border-ink/10 space-y-2 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {user ? (
              <Link to="/dashboard" onClick={() => setMobileNavOpen(false)} className="block">
                <Button size="sm" className="w-full">Open workspace</Button>
              </Link>
            ) : (
              <>
                <Link to="/signup" onClick={() => setMobileNavOpen(false)} className="block">
                  <Button size="sm" className="w-full">Start procuring</Button>
                </Link>
                <Link to="/login" onClick={() => setMobileNavOpen(false)} className="block">
                  <Button variant="ghost" size="sm" className="w-full">Sign in</Button>
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>

      <main id="main-content">
        <Outlet />
      </main>
      <MarketingFooter />
      <CookieConsentBanner />
    </div>
  );
}

function MarketingFooter() {
  return (
    <footer className="bg-ink text-paper mt-0">
      <div className="max-w-stage mx-auto px-5 sm:px-8 py-16 grid gap-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <BrandMark size={32} tone="volt" />
            <BrandWordmark tone="paper" />
          </div>
          <p className="mt-5 max-w-sm text-sm text-paper/60 leading-relaxed">
            The operating layer connecting businesses to suppliers, orders, payments and delivery.
          </p>
          <div className="mt-6 text-volt max-w-xs">
            <FlowPathMini />
          </div>
        </div>
        <div>
          <div className="vyro-kicker text-copper">Product</div>
          <ul className="mt-4 space-y-2 text-sm text-paper/70">
            <li>
              <Link to="/search" className="hover:text-volt">
                Catalog
              </Link>
            </li>
            <li>
              <Link to="/how-it-works" className="hover:text-volt">
                How it works
              </Link>
            </li>
            <li>
              <Link to="/onboarding/business" className="hover:text-volt">
                Register a business
              </Link>
            </li>
            <li>
              <Link to="/onboarding/supplier" className="hover:text-volt">
                Become a supplier
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <div className="vyro-kicker text-copper">VYRO</div>
          <ul className="mt-4 space-y-2 text-sm text-paper/70">
            <li>VYRO Procurement</li>
            <li>VYRO Pay</li>
            <li>VYRO Logistics</li>
            <li>VYRO Credit</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-paper/10 px-5 sm:px-8 py-5 text-[11px] text-paper/40 flex flex-col sm:flex-row justify-between gap-2 max-w-stage mx-auto">
        <span>© {new Date().getFullYear()} VYRO. Sri Lanka.</span>
        <LegalLinks className="text-paper/40" />
        <span>Flow · Movement · Connection · Commerce</span>
      </div>
    </footer>
  );
}

function WorkspaceShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const business = user?.memberships?.[0];
  const businessId = business?.businessId;
  const isSupplier = (user?.supplierMemberships?.length ?? 0) > 0;
  const supplier = user?.supplierMemberships?.[0];
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  const { data: cartData } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string }> }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 0,
  });
  const { data: notifData } = useQuery({
    queryKey: ['notifications-me'],
    queryFn: () => api.get<{ notifications: Array<{ id: string; readAt: number | null }>; unreadCount: number }>('/notifications/me?limit=20'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const { data: aiUnreadData } = useQuery({
    queryKey: ['notifications-ai-unread'],
    queryFn: () => api.get<{ unreadCount: number }>('/notifications/me/unread-count?source=ai'),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const cartCount = cartData?.items?.length ?? 0;
  const unread = notifData?.unreadCount ?? notifData?.notifications?.filter((n) => !n.readAt).length ?? 0;
  const aiUnread = aiUnreadData?.unreadCount ?? 0;

  const primary = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutGridIcon, show: !!user },
    { to: '/ask', label: 'Ask VYRO', icon: SparklesIcon, show: !!user, accent: true },
    { to: '/search', label: 'Marketplace', icon: SearchIcon, show: true },
    { to: '/orders', label: 'Purchase Orders', icon: PackageIcon, show: !!user },
    { to: '/accounts', label: 'Accounts', icon: BanknoteIcon, show: !!businessId },
    { to: '/rfqs', label: 'Bulk Quotes', icon: FileTextIcon, show: !!businessId },
    { to: '/cart', label: 'Active Cart', icon: ShoppingCartIcon, show: true, badge: cartCount },
  ].filter((i) => i.show);

  const supplierItems = [
    { to: '/supplier', label: 'Dispatch Console', icon: StoreIcon, show: isSupplier },
    { to: '/supplier/orders', label: 'Incoming Orders', icon: TruckIcon, show: isSupplier },
  ].filter((i) => i.show);

  const adminItems = [
    { to: '/admin', label: 'Control Center', icon: ShieldCheckIcon, show: Boolean(user?.isAdmin || (user as unknown as { adminRole?: string })?.adminRole) },
  ].filter((i) => i.show);

  const contextual = [
    { to: '/notifications', label: 'Notifications', icon: BellIcon, show: !!user, badge: unread },
    { to: '/profile', label: 'Account & Settings', icon: UserIcon, show: true },
  ].filter((i) => i.show);

  return (
    <div className="min-h-dvh bg-bone text-ink lg:flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-ink focus:text-volt focus:text-sm"
      >
        Skip to main content
      </a>
      <aside className="hidden lg:flex w-sidebar shrink-0 flex-col bg-ink text-paper h-dvh sticky top-0 border-r border-paper/10 select-none">
        <div className="flex items-center justify-between px-5 h-16 border-b border-paper/10 shrink-0">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark size={28} tone="volt" />
            <BrandWordmark tone="paper" size="sm" />
          </Link>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-volt/10 border border-volt/20 text-[10px] font-mono text-volt">
            <span className="size-1.5 rounded-full bg-volt animate-pulse" />
            <span>ONLINE</span>
          </div>
        </div>

        <div className="px-3.5 pt-4 pb-2 shrink-0">
          <div className="text-[10px] uppercase tracking-[0.16em] text-paper/40 font-mono mb-2 px-1 flex items-center justify-between">
            <span>Workspace</span>
            <span className="text-volt text-[9px] font-semibold tracking-normal uppercase">
              {isSupplier ? 'Facility' : 'Commercial'}
            </span>
          </div>
          <div className="bg-paper/[0.04] border border-paper/10 rounded-lg p-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded bg-volt/15 border border-volt/30 text-volt flex items-center justify-center font-bold text-xs shrink-0 font-display">
                {(business?.businessName ?? supplier?.supplierName ?? 'V').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-paper truncate leading-tight">
                  {business?.businessName ?? supplier?.supplierName ?? 'Guest Workspace'}
                </div>
                <div className="text-[10px] text-paper/45 truncate mt-0.5 flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>{business?.role ? `${business.role} · Verified` : isSupplier ? 'Owner · Active' : 'Sri Lanka Network'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto min-h-0">
          <NavGroup title="Operate" items={primary} />
          {supplierItems.length > 0 && (
            <NavGroup title="Supplier Dispatch" items={supplierItems} badge="FACILITY" />
          )}
          {adminItems.length > 0 && (
            <NavGroup title="Management" items={adminItems} badge="ADMIN" />
          )}
          <NavGroup title="Preferences" items={contextual} />
        </nav>

        <div className="p-3.5 border-t border-paper/10 bg-ink/90 shrink-0">
          {user ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Link
                  to="/profile"
                  className="flex-1 min-w-0 flex items-center gap-2.5 p-1 rounded-md hover:bg-paper/5 transition-colors group"
                >
                  <span className="size-8 rounded bg-volt text-ink text-xs font-bold inline-flex items-center justify-center font-mono shrink-0 shadow-sm">
                    {(user.name || 'U').slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-paper group-hover:text-volt transition-colors truncate leading-tight">
                      {user.name}
                    </span>
                    <span className="block text-[10px] text-paper/40 truncate font-mono mt-0.5">
                      {user.email}
                    </span>
                  </span>
                </Link>
                <button
                  title="Sign out"
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                  className="size-8 rounded inline-flex items-center justify-center text-paper/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                >
                  <LogOutIcon size={16} />
                </button>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-paper/30 px-1 border-t border-paper/5 pt-2">
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <span>SL GATEWAY</span>
                </span>
                <span>v0.1.0</span>
              </div>
            </div>
          ) : (
            <Link to="/login">
              <Button size="sm" className="w-full bg-volt text-ink hover:bg-volt-glow font-medium">
                Sign in
              </Button>
            </Link>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-40 h-14 px-4 flex items-center justify-between gap-2 bg-bone/95 backdrop-blur border-b border-ink/10">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="size-10 -ml-2 inline-flex items-center justify-center text-ink hover:bg-ink/5 active:bg-ink/10 transition-colors rounded-md"
          >
            <MenuIcon size={22} />
          </button>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <BrandMark size={22} />
            <span className="vyro-display text-base sm:text-lg truncate">VYRO</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link to="/notifications" aria-label="Notifications" className="relative size-10 inline-flex items-center justify-center hover:bg-ink/5 active:bg-ink/10 transition-colors rounded-md">
              <BellIcon size={18} />
              {unread > 0 && <span className="absolute top-2 right-2 size-1.5 bg-volt rounded-full" />}
              {aiUnread > 0 && (
                <span
                  title={`${aiUnread} AI insight${aiUnread === 1 ? '' : 's'} unread`}
                  className="absolute bottom-2 right-2 size-2 bg-copper rounded-full"
                />
              )}
            </Link>
            <Link to="/cart" aria-label="Cart" className="relative size-10 inline-flex items-center justify-center hover:bg-ink/5 active:bg-ink/10 transition-colors rounded-md">
              <ShoppingCartIcon size={18} />
              {cartCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 bg-ink text-volt text-[10px] font-mono inline-flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        {/* Mobile navigation drawer */}
        <MobileNavDrawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          user={user}
          business={business}
          supplier={supplier}
          isSupplier={isSupplier}
          unread={unread}
          aiUnread={aiUnread}
          cartCount={cartCount}
          onSignOut={async () => {
            await signOut();
            navigate('/');
          }}
        />

        <main id="main-content" className="flex-1 w-full max-w-stage mx-auto px-4 sm:px-6 lg:px-10 py-8 pb-24 lg:pb-12">
          <Outlet />
        </main>

        <AskVyroFloat />

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-6 h-16">
            <MobileTab to="/search" icon={SearchIcon} label="Search" />
            <MobileTab to="/dashboard" icon={LayoutGridIcon} label="Home" />
            <MobileTab to="/ask" icon={SparklesIcon} label="Ask" />
            <MobileTab to="/orders" icon={PackageIcon} label="Orders" />
            <MobileTab to="/cart" icon={ShoppingCartIcon} label="Cart" badge={cartCount} />
            <MobileTab to={isSupplier ? '/supplier' : '/profile'} icon={isSupplier ? StoreIcon : UserIcon} label={isSupplier ? 'Supply' : 'Me'} />
          </div>
        </nav>
      </div>
      <CookieConsentBanner />
    </div>
  );
}

function MobileNavDrawer({
  open,
  onClose,
  user,
  business,
  supplier,
  isSupplier,
  unread,
  aiUnread,
  cartCount,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  user: ReturnType<typeof useAuth>['user'];
  business: { businessId?: string; businessName?: string; role?: string } | undefined;
  supplier: { supplierName?: string } | undefined;
  isSupplier: boolean;
  unread: number;
  aiUnread: number;
  cartCount: number;
  onSignOut: () => Promise<void> | void;
}) {
  return (
    <div
      className={cn(
        'lg:hidden fixed inset-0 z-50 transition-opacity duration-200',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close navigation"
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Workspace navigation"
        className={cn(
          'absolute inset-y-0 left-0 w-[88%] max-w-sm bg-ink text-paper shadow-2xl flex flex-col transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-paper/10 shrink-0">
          <Link to="/" onClick={onClose} className="flex items-center gap-2 min-w-0">
            <BrandMark size={24} tone="volt" />
            <BrandWordmark tone="paper" size="sm" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="size-10 -mr-2 inline-flex items-center justify-center text-paper/70 hover:text-paper hover:bg-paper/10 rounded-md"
          >
            <XIcon size={20} />
          </button>
        </div>

        {user && (
          <div className="px-4 pt-4 pb-3 shrink-0">
            <Link
              to="/profile"
              onClick={onClose}
              className="flex items-center gap-3 p-2.5 rounded-lg bg-paper/[0.04] border border-paper/10 hover:bg-paper/[0.08] transition-colors"
            >
              <span className="size-10 rounded bg-volt text-ink text-sm font-bold inline-flex items-center justify-center font-mono shrink-0">
                {(user.name || 'U').slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-paper truncate">{user.name}</span>
                <span className="block text-[11px] text-paper/50 truncate font-mono">{user.email}</span>
              </span>
            </Link>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
          <DrawerNavGroup
            title="Workspace"
            badge={isSupplier ? 'Facility' : 'Commercial'}
            items={[
              { to: '/dashboard', label: 'Dashboard', icon: LayoutGridIcon, show: !!user },
              { to: '/ask', label: 'Ask VYRO', icon: SparklesIcon, show: !!user, accent: true },
              { to: '/search', label: 'Marketplace', icon: SearchIcon, show: true },
              { to: '/orders', label: 'Purchase Orders', icon: PackageIcon, show: !!user },
              { to: '/accounts', label: 'Accounts', icon: BanknoteIcon, show: !!business?.businessId },
              { to: '/rfqs', label: 'Bulk Quotes', icon: FileTextIcon, show: !!business?.businessId },
              { to: '/cart', label: 'Active Cart', icon: ShoppingCartIcon, show: true, badge: cartCount },
            ]}
          />
          {isSupplier && (
            <DrawerNavGroup
              title="Supplier Dispatch"
              badge="FACILITY"
              items={[
                { to: '/supplier', label: 'Dispatch Console', icon: StoreIcon, show: true },
                { to: '/supplier/orders', label: 'Incoming Orders', icon: TruckIcon, show: true },
              ]}
            />
          )}
          {user?.isAdmin && (
            <DrawerNavGroup
              title="Management"
              badge="ADMIN"
              items={[{ to: '/admin', label: 'Control Center', icon: ShieldCheckIcon, show: true }]}
            />
          )}
          <DrawerNavGroup
            title="Preferences"
            items={[
              { to: '/notifications', label: 'Notifications', icon: BellIcon, show: !!user, badge: unread, badgeTone: 'volt' },
              { to: '/profile', label: 'Account & Settings', icon: UserIcon, show: true },
            ]}
          />
        </nav>

        <div className="p-3 border-t border-paper/10 bg-ink/90 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-paper border border-paper/20 hover:bg-paper/10 hover:border-rose-400/50 hover:text-rose-300 transition-colors rounded-md min-h-[44px]"
            >
              <LogOutIcon size={16} />
              Sign out
            </button>
          ) : (
            <Link to="/login" onClick={onClose}>
              <Button size="sm" className="w-full bg-volt text-ink hover:bg-volt-glow font-medium">
                Sign in
              </Button>
            </Link>
          )}
          <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-paper/40 px-1">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>SL GATEWAY</span>
            </span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function DrawerNavGroup({
  title,
  badge,
  items,
}: {
  title: string;
  badge?: string;
  items: Array<{ to: string; label: string; icon: typeof SearchIcon; badge?: number; badgeTone?: 'volt' | 'copper'; accent?: boolean; show: boolean }>;
}) {
  const visible = items.filter((i) => i.show);
  if (visible.length === 0) return null;
  return (
    <div>
      <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-paper/40 font-mono flex items-center justify-between">
        <span>{title}</span>
        {badge ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase bg-volt/10 text-volt border border-volt/20 leading-none">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        {visible.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-3 px-3 py-3 text-sm font-medium rounded-md transition-colors min-h-[44px]',
                  isActive
                    ? 'bg-volt/10 text-volt font-semibold'
                    : item.accent
                    ? 'text-volt hover:bg-volt/10'
                    : 'text-paper/80 hover:text-paper hover:bg-paper/[0.06]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 bg-volt rounded-r" />}
                  <Icon size={18} className={cn('shrink-0', isActive || item.accent ? 'text-volt' : 'text-paper/50')} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.accent && !isActive ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase bg-volt/15 text-volt border border-volt/30 leading-none">
                      New
                    </span>
                  ) : null}
                  {typeof item.badge === 'number' && item.badge > 0 ? (
                    <span className="min-w-5 h-5 px-1.5 bg-volt text-ink text-[10px] font-mono font-bold rounded inline-flex items-center justify-center shrink-0">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function NavGroup({
  title,
  items,
  badge,
}: {
  title: string;
  items: Array<{ to: string; label: string; icon: typeof SearchIcon; badge?: number; accent?: boolean }>;
  badge?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.16em] text-paper/40 font-mono flex items-center justify-between">
        <span>{title}</span>
        {badge ? (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase bg-volt/10 text-volt border border-volt/20 leading-none">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-all duration-150',
                  isActive
                    ? 'bg-volt/10 text-volt font-semibold shadow-sm'
                    : item.accent
                    ? 'text-volt hover:bg-volt/10'
                    : 'text-paper/70 hover:text-paper hover:bg-paper/[0.06]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-volt rounded-r" />
                  )}
                  <Icon
                    size={16}
                    className={cn(
                      'shrink-0 transition-colors',
                      isActive || item.accent ? 'text-volt' : 'text-paper/50 group-hover:text-paper/80',
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.accent && !isActive ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase bg-volt/15 text-volt border border-volt/30 leading-none">
                      New
                    </span>
                  ) : null}
                  {typeof item.badge === 'number' && item.badge > 0 ? (
                    <span className="min-w-4 h-4 px-1 bg-volt text-ink text-[10px] font-mono font-bold rounded inline-flex items-center justify-center shrink-0 shadow-sm">
                      {item.badge}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function MobileTab({
  to,
  icon: Icon,
  label,
  badge,
}: {
  to: string;
  icon: typeof SearchIcon;
  label: string;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/dashboard' || to === '/search'}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium tracking-tight relative min-w-0',
          isActive ? 'text-ink' : 'text-ink-4',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-0 inset-x-4 h-0.5 bg-volt" />}
          <span className="relative">
            <Icon size={18} />
            {badge ? (
              <span className="absolute -top-1.5 -right-2 min-w-3.5 h-3.5 px-0.5 bg-ink text-volt text-[9px] font-mono inline-flex items-center justify-center">
                {badge}
              </span>
            ) : null}
          </span>
          <span className="truncate w-full text-center leading-tight">{label}</span>
        </>
      )}
    </NavLink>
  );
}

void TruckIcon;
