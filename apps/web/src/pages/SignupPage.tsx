import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';
import {
  Building2Icon,
  EyeIcon,
  EyeOffIcon,
  MailIcon,
  PackageIcon,
  PhoneIcon,
  ShieldCheckIcon,
  StoreIcon,
  TruckIcon,
  UserIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';
import { usePageTitle } from '@/lib/usePageTitle';

const BUYER_HIGHLIGHTS = [
  { icon: StoreIcon, title: 'Free to browse', body: 'Explore verified wholesale catalogs at no cost.' },
  { icon: Building2Icon, title: 'Built for teams', body: 'Bring your branches and buyers into one workspace.' },
  { icon: TruckIcon, title: 'Pay per PO', body: 'You only pay when you issue purchase orders.' },
];

const SUPPLIER_HIGHLIGHTS = [
  { icon: Building2Icon, title: 'Direct POs', body: 'Orders straight from hotels, restaurants and grocers.' },
  { icon: PackageIcon, title: 'Your catalog, live', body: 'Publish pricing and stock buyers can order against.' },
  { icon: TruckIcon, title: 'Fulfil with clarity', body: 'Track every order from accepted to delivered.' },
];

export function SignupPage() {
  usePageTitle('Sign up');
  const [search] = useSearchParams();
  const intent = search.get('intent') === 'supplier' ? 'supplier' : 'buyer';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/sign-up', {
        email,
        password,
        name,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      await refresh();
      navigate(intent === 'supplier' ? '/onboarding/supplier' : '/onboarding/business');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Sign up failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  }

  const isSupplier = intent === 'supplier';
  const highlights = isSupplier ? SUPPLIER_HIGHLIGHTS : BUYER_HIGHLIGHTS;

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr] bg-bone">
      <aside className="relative hidden lg:flex flex-col justify-between bg-ink text-paper p-12 xl:p-16 overflow-hidden grain">
        <div className="absolute inset-0 opacity-70">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div
          className="pointer-events-none absolute -bottom-40 -left-32 size-[34rem] rounded-full bg-volt/10 blur-3xl"
          aria-hidden
        />

        <Link to="/" className="relative z-10 flex items-center gap-3 w-fit">
          <BrandMark size={32} tone="volt" />
          <BrandWordmark tone="paper" />
        </Link>

        <div className="relative z-10 max-w-lg">
          <div className="vyro-kicker text-volt">{isSupplier ? 'For wholesale suppliers' : 'For businesses'}</div>
          <h2 className="mt-4 vyro-display text-5xl xl:text-6xl text-balance">
            {isSupplier ? (
              <>
                Sell into the <span className="text-volt">flow.</span>
              </>
            ) : (
              <>
                Start in the <span className="text-volt">operating layer.</span>
              </>
            )}
          </h2>
          <p className="mt-5 text-body-lg text-paper/60 max-w-md">
            {isSupplier
              ? 'Receive direct purchase orders from hotels, restaurants and grocers.'
              : 'Free to browse. Pay only when you issue purchase orders.'}
          </p>

          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-paper/5 text-volt shadow-[inset_0_0_0_1px_rgba(250,247,240,0.1)]">
                  <Icon size={18} />
                </span>
                <div>
                  <div className="text-sm font-semibold text-paper">{title}</div>
                  <div className="mt-0.5 text-sm text-paper/50">{body}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-12 rounded-xl bg-paper/[0.04] p-5 backdrop-blur-sm shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)]">
            <FlowLine
              tone="paper"
              nodes={
                isSupplier
                  ? [
                      { label: 'Account', state: 'active' },
                      { label: 'Onboarding', state: 'idle' },
                      { label: 'Catalog', state: 'idle' },
                      { label: 'Orders', state: 'idle' },
                    ]
                  : [
                      { label: 'Account', state: 'active' },
                      { label: 'Business', state: 'idle' },
                      { label: 'Orders', state: 'idle' },
                    ]
              }
            />
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-paper/35">
          <span>© {new Date().getFullYear()} VYRO</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheckIcon size={14} className="text-volt/70" />
            Encrypted, session-based sign in
          </span>
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-12 sm:px-8 sm:py-16 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 flow-bg opacity-60" aria-hidden />

        <div className="relative w-full max-w-md animate-fade-in">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-8 w-fit">
            <BrandMark size={28} />
            <BrandWordmark size="sm" />
          </Link>

          <div className="vyro-elevated p-7 sm:p-10">
            <div
              className="grid grid-cols-2 gap-1 rounded-lg bg-bone p-1 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]"
              role="tablist"
              aria-label="Account type"
            >
              {[
                { key: 'buyer', label: 'Buyer', to: '/signup' },
                { key: 'supplier', label: 'Supplier', to: '/signup?intent=supplier' },
              ].map((tab) => {
                const active = intent === tab.key;
                return (
                  <Link
                    key={tab.key}
                    to={tab.to}
                    replace
                    role="tab"
                    aria-selected={active}
                    className={cn(
                      'flex h-9 items-center justify-center rounded-md text-sm font-medium transition-colors duration-200',
                      active ? 'bg-paper text-ink shadow-pop' : 'text-ink-4 hover:text-ink',
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 vyro-kicker">{isSupplier ? 'Wholesale supplier account' : 'Create account'}</div>
            <h1 className="mt-2 vyro-display text-4xl text-ink text-balance">
              {isSupplier ? 'Become a VYRO supplier.' : 'Join VYRO.'}
            </h1>
            <p className="mt-3 text-body text-ink-3">
              {isSupplier
                ? "After signup you'll complete a short 4-step wholesale onboarding."
                : 'Set up your account, then add your business in the next step.'}
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {err && (
                <div role="alert">
                  <ErrorBanner message={err} />
                </div>
              )}

              <div>
                <Label htmlFor="name">Full name</Label>
                <div className="relative">
                  <UserIcon
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4"
                    aria-hidden
                  />
                  <Input
                    id="name"
                    autoComplete="name"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <MailIcon
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.lk"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-11"
                    minLength={8}
                    maxLength={128}
                    aria-describedby="password-hint"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-md text-ink-4 hover:bg-ink/5 hover:text-ink transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
                <p
                  id="password-hint"
                  className={cn(
                    'mt-1.5 text-xs transition-colors',
                    password.length >= 8 ? 'text-mint' : 'text-ink-4',
                  )}
                >
                  At least 8 characters
                </p>
              </div>

              <div>
                <Label htmlFor="phone">
                  Phone <span className="text-ink-4 font-normal normal-case tracking-normal">(optional)</span>
                </Label>
                <div className="relative">
                  <PhoneIcon
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4"
                    aria-hidden
                  />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+94 …"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    pattern="^[+0-9 ()\-]{7,20}$"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button type="submit" size="lg" loading={loading} className="w-full">
                {loading ? 'Creating account…' : 'Continue'}
              </Button>
            </form>

            <div className="my-7 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
              <span className="h-px flex-1 bg-ink/10" />
              Already have an account?
              <span className="h-px flex-1 bg-ink/10" />
            </div>

            <Link to="/login" className="vyro-btn vyro-btn-secondary h-12 w-full text-base">
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
