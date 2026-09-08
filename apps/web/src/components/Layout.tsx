import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
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
  return (
    <div className="min-h-dvh bg-bone text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-ink focus:text-volt focus:text-sm"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-bone/90 backdrop-blur-md">
        <div className="max-w-stage mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <BrandMark size={28} />
            <BrandWordmark size="sm" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <Link to="/how-it-works" className="text-ink-3 hover:text-ink transition-colors">
              How it works
            </Link>
            <Link to="/about" className="text-ink-3 hover:text-ink transition-colors">
              About
            </Link>
            <Link to="/search" className="text-ink-3 hover:text-ink transition-colors">
              Catalog
            </Link>
            <Link to="/onboarding/supplier" className="text-ink-3 hover:text-ink transition-colors">
              For suppliers
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm">Open workspace</Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Start procuring</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
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
  const business = user?.memberships?.[0];
  const businessId = business?.businessId;
  const isSupplier = (user?.supplierMemberships?.length ?? 0) > 0;
  const supplier = user?.supplierMemberships?.[0];

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
        <header className="lg:hidden sticky top-0 z-40 h-14 px-4 flex items-center justify-between bg-bone/95 backdrop-blur border-b border-ink/10">
          <Link to="/" className="flex items-center gap-2">
            <BrandMark size={24} />
            <span className="vyro-display text-lg">VYRO</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/notifications" className="relative p-2">
              <BellIcon size={18} />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 size-1.5 bg-volt rounded-full" />}
              {aiUnread > 0 && (
                <span
                  title={`${aiUnread} AI insight${aiUnread === 1 ? '' : 's'} unread`}
                  className="absolute -bottom-0.5 -right-0.5 size-2 bg-copper rounded-full"
                />
              )}
            </Link>
            <Link to="/cart" className="relative p-2">
              <ShoppingCartIcon size={18} />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-ink text-volt text-[10px] font-mono inline-flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main id="main-content" className="flex-1 w-full max-w-stage mx-auto px-4 sm:px-6 lg:px-10 py-8 pb-24 lg:pb-12">
          <Outlet />
        </main>

        <AskVyroFloat />

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 h-16">
            <MobileTab to="/search" icon={SearchIcon} label="Discover" />
            <MobileTab to="/dashboard" icon={LayoutGridIcon} label="Dashboard" />
            <MobileTab to="/ask" icon={SparklesIcon} label="Ask AI" />
            <MobileTab to="/orders" icon={PackageIcon} label="Orders" />
            <MobileTab to="/cart" icon={ShoppingCartIcon} label="Cart" badge={cartCount} />
            <MobileTab to={isSupplier ? '/supplier' : '/profile'} icon={isSupplier ? StoreIcon : UserIcon} label={isSupplier ? 'Facility' : 'Account'} />
          </div>
        </nav>
      </div>
      <CookieConsentBanner />
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
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center justify-center gap-1 text-[10px] tracking-wide relative',
          isActive ? 'text-ink' : 'text-ink-4',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute top-0 inset-x-6 h-0.5 bg-volt" />}
          <span className="relative">
            <Icon size={18} />
            {badge ? (
              <span className="absolute -top-1.5 -right-2 min-w-3.5 h-3.5 px-0.5 bg-ink text-volt text-[9px] font-mono inline-flex items-center justify-center">
                {badge}
              </span>
            ) : null}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

void FileTextIcon;
void TruckIcon;
