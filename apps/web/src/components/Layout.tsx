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
} from './icons';
import { Button } from './ui';
import { BrandMark, BrandWordmark } from './brand/BrandMark';
import { FlowPathMini } from './brand/FlowLine';
import { cn } from '@vyro/ui';
import { CookieConsentBanner } from './CookieConsentBanner';

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

  const cartCount = cartData?.items?.length ?? 0;
  const unread = notifData?.unreadCount ?? notifData?.notifications?.filter((n) => !n.readAt).length ?? 0;

  const primary = [
    { to: '/dashboard', label: 'Command', icon: LayoutGridIcon, show: !!user },
    { to: '/search', label: 'Discover', icon: SearchIcon, show: true },
    { to: '/orders', label: 'Orders', icon: PackageIcon, show: !!user },
    { to: '/cart', label: 'Cart', icon: ShoppingCartIcon, show: true, badge: cartCount },
  ].filter((i) => i.show);

  const contextual = [
    { to: '/supplier/orders', label: 'Incoming', icon: StoreIcon, show: isSupplier },
    { to: '/notifications', label: 'Signals', icon: BellIcon, show: !!user, badge: unread },
    { to: '/profile', label: 'Account', icon: UserIcon, show: true },
  ].filter((i) => i.show);

  return (
    <div className="min-h-dvh bg-bone text-ink lg:flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-3 focus:py-2 focus:bg-ink focus:text-volt focus:text-sm"
      >
        Skip to main content
      </a>
      <aside className="hidden lg:flex w-sidebar shrink-0 flex-col bg-ink text-paper min-h-dvh sticky top-0">
        <Link to="/" className="flex items-center gap-3 px-5 h-16 border-b border-paper/10">
          <BrandMark size={28} tone="volt" />
          <BrandWordmark tone="paper" size="sm" />
        </Link>

        <div className="px-4 pt-5 pb-3">
          <div className="vyro-kicker text-volt/80 mb-2">Workspace</div>
          <div className="bg-paper/5 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-paper/40">
              {isSupplier && !business ? 'Supplier' : 'Business'}
            </div>
            <div className="mt-1 text-sm font-semibold truncate">
              {business?.businessName ?? supplier?.supplierName ?? 'Guest catalog'}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
          <NavGroup title="Operate" items={primary} />
          <NavGroup title="Context" items={contextual} />
        </nav>

        <div className="p-4 border-t border-paper/10">
          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/profile" className="flex-1 min-w-0 flex items-center gap-2.5">
                <span className="size-8 bg-volt text-ink text-[11px] font-bold inline-flex items-center justify-center">
                  {(user.name || 'U').slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm truncate">{user.name}</span>
                  <span className="block text-[10px] text-paper/40 truncate">{user.email}</span>
                </span>
              </Link>
              <button
                title="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate('/');
                }}
                className="size-9 inline-flex items-center justify-center text-paper/50 hover:text-volt hover:bg-paper/5"
              >
                <LogOutIcon size={16} />
              </button>
            </div>
          ) : (
            <Link to="/login">
              <Button size="sm" className="w-full bg-volt text-ink hover:bg-volt-glow">
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

        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-ink/10 bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-5 h-16">
            <MobileTab to="/search" icon={SearchIcon} label="Discover" />
            <MobileTab to="/dashboard" icon={LayoutGridIcon} label="Command" />
            <MobileTab to="/orders" icon={PackageIcon} label="Orders" />
            <MobileTab to="/cart" icon={ShoppingCartIcon} label="Cart" badge={cartCount} />
            <MobileTab to={isSupplier ? '/supplier/orders' : '/profile'} icon={isSupplier ? StoreIcon : UserIcon} label={isSupplier ? 'Inbox' : 'You'} />
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
}: {
  title: string;
  items: Array<{ to: string; label: string; icon: typeof SearchIcon; badge?: number }>;
}) {
  return (
    <div>
      <div className="px-3 mb-2 text-[10px] uppercase tracking-[0.16em] text-paper/35">{title}</div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-200',
                  isActive ? 'nav-active text-volt' : 'text-paper/70 hover:text-paper hover:bg-paper/5',
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="min-w-5 h-5 px-1 bg-volt text-ink text-[10px] font-mono inline-flex items-center justify-center">
                  {item.badge}
                </span>
              ) : null}
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
