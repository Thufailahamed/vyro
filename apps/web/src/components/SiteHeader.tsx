import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button } from '@/components/ui';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { MenuIcon, XIcon } from '@/components/icons';

const MARKETING_LINKS = [
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
  { to: '/search', label: 'Catalog' },
];

const AUDIENCE_LINKS = [
  { to: '/onboarding/business', label: 'For buyers' },
  { to: '/onboarding/supplier', label: 'For suppliers' },
];

const ALL_MARKETING_LINKS = [...MARKETING_LINKS, ...AUDIENCE_LINKS];

export function marketingBarClass(elevated: boolean) {
  return cn(
    'sticky top-0 z-40 border-b border-paper/5 bg-void text-paper transition-[box-shadow,border-color] duration-200',
    elevated && 'border-paper/10 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.7)]',
  );
}

export function useChromeElevated() {
  const [elevated, setElevated] = useState(false);
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return elevated;
}

export function chromeBarClass(elevated: boolean) {
  return cn(
    'sticky top-0 z-40 border-b bg-bone/90 backdrop-blur-md transition-[box-shadow,border-color] duration-200',
    elevated ? 'border-ink/15 shadow-[0_10px_28px_-18px_rgba(12,14,11,0.4)]' : 'border-ink/10',
  );
}

function MarketingNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'relative inline-flex min-h-11 items-center px-3 text-[13px] font-medium tracking-wide rounded-md transition-colors duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt',
          isActive ? 'text-paper' : 'text-paper/75 hover:text-paper hover:bg-paper/5',
        )
      }
    >
      {({ isActive }) => (
        <>
          {label}
          <span
            aria-hidden
            className={cn(
              'absolute left-3 right-3 bottom-2 h-px bg-volt origin-left transition-transform duration-200',
              isActive ? 'scale-x-100' : 'scale-x-0',
            )}
          />
        </>
      )}
    </NavLink>
  );
}

export function MarketingHeader({ user }: { user: { name?: string } | null }) {
  const location = useLocation();
  const elevated = useChromeElevated();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  return (
    <>
      <header className={marketingBarClass(elevated)}>
        <div className="max-w-stage mx-auto flex h-16 items-center gap-5 px-5 sm:px-8">
          <Link
            to="/"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
          >
            <BrandMark size={28} tone="volt" />
            <BrandWordmark size="sm" tone="paper" />
          </Link>

          <nav className="ml-2 hidden items-center lg:flex" aria-label="Primary">
            {MARKETING_LINKS.map((link) => (
              <MarketingNavLink key={link.to} to={link.to} label={link.label} />
            ))}
            <span aria-hidden className="mx-2 h-4 w-px bg-paper/20" />
            {AUDIENCE_LINKS.map((link) => (
              <MarketingNavLink key={link.to} to={link.to} label={link.label} />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm" className="bg-volt text-ink hover:bg-volt-glow h-10 px-4">
                  Open workspace
                </Button>
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden sm:inline-flex h-11 items-center rounded-md px-3 text-sm font-medium text-paper/70 transition-colors hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
                >
                  Sign in
                </Link>
                <Link to="/signup">
                  <Button size="sm" className="bg-volt text-ink hover:bg-volt-glow h-10 px-4">
                    Start procuring
                  </Button>
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="inline-flex size-11 -mr-1.5 items-center justify-center rounded-md text-paper hover:bg-paper/10 lg:hidden"
            >
              <MenuIcon size={22} />
            </button>
          </div>
        </div>
      </header>

      <div
        className={cn(
          'fixed inset-0 z-50 transition-opacity duration-200 lg:hidden',
          mobileNavOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-hidden={!mobileNavOpen}
      >
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
          className="absolute inset-0 cursor-pointer bg-void/70 backdrop-blur-sm"
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Marketing navigation"
          className={cn(
            'absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col rounded-l-xl bg-ink text-paper shadow-2xl transition-transform duration-300 ease-out',
            mobileNavOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-paper/10 px-5">
            <Link to="/" onClick={() => setMobileNavOpen(false)} className="flex min-w-0 items-center gap-3">
              <BrandMark size={26} tone="volt" />
              <BrandWordmark size="sm" tone="paper" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close"
              className="inline-flex size-11 -mr-2 items-center justify-center rounded-md text-paper hover:bg-paper/10"
            >
              <XIcon size={20} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-1">
              {ALL_MARKETING_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 items-center rounded-lg px-4 py-3 text-sm font-medium',
                      isActive ? 'bg-paper/10 text-volt' : 'text-paper/80 hover:bg-paper/5 hover:text-paper',
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="shrink-0 space-y-2 border-t border-paper/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {user ? (
              <Link to="/dashboard" onClick={() => setMobileNavOpen(false)} className="block">
                <Button size="sm" className="h-11 w-full bg-volt text-ink hover:bg-volt-glow">
                  Open workspace
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/signup" onClick={() => setMobileNavOpen(false)} className="block">
                  <Button size="sm" className="h-11 w-full bg-volt text-ink hover:bg-volt-glow">
                    Start procuring
                  </Button>
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMobileNavOpen(false)}
                  className="flex h-11 items-center justify-center rounded-lg text-sm font-medium text-paper/70 hover:text-paper"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

export function OnboardingHeader({
  user,
  onSignOut,
}: {
  user: { email?: string } | null;
  onSignOut: () => void;
}) {
  const elevated = useChromeElevated();
  return (
    <header className={chromeBarClass(elevated)}>
      <div className="max-w-stage mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt"
        >
          <BrandMark size={28} />
          <BrandWordmark size="sm" />
        </Link>
        <div className="flex items-center gap-3 sm:gap-5 text-sm">
          <Link
            to="/search"
            className="text-ink-3 hover:text-ink transition-colors duration-200 font-medium cursor-pointer"
          >
            Catalog
          </Link>
          {user && (
            <div className="hidden sm:flex items-center gap-3 pl-4 border-l border-ink/10">
              <span className="text-ink-3 truncate max-w-[14rem]">{user.email}</span>
              <button
                type="button"
                onClick={() => onSignOut()}
                className="text-copper hover:text-ink transition-colors duration-200 cursor-pointer font-medium"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
