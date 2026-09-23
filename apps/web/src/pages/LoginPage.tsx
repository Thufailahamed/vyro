import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { resolveNextPath } from '@/components/RequireAuth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';
import { Building2Icon, EyeIcon, EyeOffIcon, MailIcon, ShieldCheckIcon, StoreIcon, TruckIcon } from '@/components/icons';
import { usePageTitle } from '@/lib/usePageTitle';

const HIGHLIGHTS = [
  { icon: Building2Icon, title: 'One workspace', body: 'Every business, branch and buyer in a single view.' },
  { icon: StoreIcon, title: 'Verified suppliers', body: 'Wholesale catalogs with live pricing and stock.' },
  { icon: TruckIcon, title: 'Orders in motion', body: 'Track each PO from draft to delivered.' },
];

export function LoginPage() {
  usePageTitle('Sign in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/sign-in', { email, password });
      // `refresh` resolves the session before we decide where to land, so the
      // redirect can read memberships instead of guessing /dashboard.
      const user = await refresh();
      navigate(resolveNextPath(location.search, user), { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Sign in failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

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
          <div className="vyro-kicker text-volt">Procurement, connected</div>
          <h2 className="mt-4 vyro-display text-5xl xl:text-6xl text-balance">
            Return to the <span className="text-volt">flow.</span>
          </h2>
          <p className="mt-5 text-body-lg text-paper/60 max-w-md">
            Your procurement, suppliers and orders — in one operating layer.
          </p>

          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
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
              nodes={[
                { label: 'Business', state: 'done' },
                { label: 'Catalog', state: 'active' },
                { label: 'Orders', state: 'idle' },
              ]}
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
            <div className="vyro-kicker">Sign in</div>
            <h1 className="mt-2 vyro-display text-4xl text-ink">Welcome back.</h1>
            <p className="mt-3 text-body text-ink-3">Enter your email and password to open your workspace.</p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {err && (
                <div role="alert">
                  <ErrorBanner message={err} />
                </div>
              )}

              <div>
                <Label htmlFor="email">Email</Label>
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
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@business.lk"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link to="/forgot" className="mb-1.5 text-xs font-medium text-copper hover:text-ink transition-colors">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-11"
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
              </div>

              <Button type="submit" size="lg" loading={loading} className="w-full">
                {loading ? 'Signing in…' : 'Enter workspace'}
              </Button>
            </form>

            <div className="my-7 flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
              <span className="h-px flex-1 bg-ink/10" />
              New to VYRO?
              <span className="h-px flex-1 bg-ink/10" />
            </div>

            <Link
              to="/signup"
              className="vyro-btn vyro-btn-secondary h-12 w-full text-base"
            >
              Create an account
            </Link>
          </div>

          <p className="mt-6 text-center text-xs text-ink-4">
            Supplying wholesale?{' '}
            <Link to="/signup?intent=supplier" className="text-copper hover:text-ink underline underline-offset-2 transition-colors">
              Join as a supplier
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
