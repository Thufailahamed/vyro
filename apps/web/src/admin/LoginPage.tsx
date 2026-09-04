import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ShieldCheckIcon, AlertCircleIcon } from './icons';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/sign-in', { email, password });
      navigate('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign-in failed. Please check administrator credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-pearl flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl bg-paper rounded-2xl border border-slate-200 shadow-soft-lg overflow-hidden grid grid-cols-1 lg:grid-cols-5">
        {/* Midnight brand panel */}
        <aside className="lg:col-span-2 bg-midnight-2 text-paper px-8 py-10 sm:px-10 sm:py-12 flex flex-col justify-between gap-10 relative overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-[0.07] pointer-events-none" aria-hidden />
          <div className="relative">
            <div className="inline-flex items-center justify-center mb-6">
              <svg viewBox="0 0 32 32" className="h-10 w-10 rounded-md" aria-hidden>
                <rect width="32" height="32" rx="7" fill="#5EE2FF" />
                <path d="M9 8h4l5 12 5-12h4l-7 16h-4L9 8z" fill="#0A0B10" />
              </svg>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-rose/15 text-rose border border-rose/30">
              <span className="size-1.5 rounded-full bg-rose animate-pulse" aria-hidden />
              Restricted operations
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-paper leading-[1.1] text-balance">
              VYRO
              <br />
              <span className="text-cyan">Admin Console.</span>
            </h1>
            <p className="mt-3 text-sm text-ink-4 max-w-xs">
              Platform oversight for supplier onboarding, dispute adjudication, and audit log access.
            </p>
          </div>

          <ul className="relative space-y-3 text-xs text-ink-3">
            <li className="flex items-center gap-2.5">
              <span className="size-5 rounded bg-midnight-3 inline-flex items-center justify-center text-cyan">
                <ShieldCheckIcon size={11} />
              </span>
              <span>256-bit TLS · short-lived session</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="size-5 rounded bg-midnight-3 inline-flex items-center justify-center text-cyan">·</span>
              <span>MFA required for privileged actions</span>
            </li>
            <li className="flex items-center gap-2.5">
              <span className="size-5 rounded bg-midnight-3 inline-flex items-center justify-center text-cyan">·</span>
              <span>All actions write to immutable audit log</span>
            </li>
          </ul>
        </aside>

        {/* Form panel */}
        <section className="lg:col-span-3 px-8 py-10 sm:px-12 sm:py-14 flex flex-col justify-center">
          <div className="max-w-sm w-full mx-auto space-y-7">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Sign in to admin
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Administrator credentials required for elevated privileges.
              </p>
            </div>

            {err && (
              <div className="flex items-start gap-2.5 bg-rose/10 border border-rose/30 text-rose text-xs rounded-md p-3">
                <AlertCircleIcon size={15} className="text-rose shrink-0 mt-0.5" />
                <div className="font-medium">{err}</div>
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Admin email
                </label>
                <input
                  className="w-full h-10 rounded-md border border-slate-200 bg-paper px-3 text-sm text-slate-950 placeholder:text-slate-400 transition-colors focus:border-cyan-deep focus:outline-none focus:ring-2 focus:ring-cyan/30"
                  type="email"
                  placeholder="admin@vyro.lk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  className="w-full h-10 rounded-md border border-slate-200 bg-paper px-3 text-sm text-slate-950 placeholder:text-slate-400 transition-colors focus:border-cyan-deep focus:outline-none focus:ring-2 focus:ring-cyan/30"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 bg-slate-950 text-paper rounded-md text-sm font-semibold hover:bg-slate-900 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <span className="size-3 rounded-full border-2 border-paper/30 border-t-paper animate-spin" aria-hidden />
                    <span className="ml-2">Authenticating…</span>
                  </>
                ) : (
                  'Sign in to console'
                )}
              </button>
            </form>

            <p className="text-[11px] text-slate-400 text-center pt-2 border-t border-slate-100">
              Unauthorized access attempts are logged and reviewed.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
