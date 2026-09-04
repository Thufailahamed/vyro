import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MailIcon, ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from '@/components/icons';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/sign-in', { email, password });
      await refresh();
      navigate('/');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Sign in failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      {/* Cinematic midnight left */}
      <aside className="relative lg:w-[44%] bg-slate-950 text-white px-8 py-10 lg:px-16 lg:py-16 flex flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] grid-bg pointer-events-none" aria-hidden />
        <div className="absolute -top-1/3 -right-1/3 size-[600px] rounded-full bg-sky-400/10 blur-3xl pointer-events-none" aria-hidden />
        <Link to="/" className="relative z-10 inline-flex items-center gap-2.5 group">
          <span className="h-8 w-8 rounded-md bg-sky-300 inline-flex items-center justify-center text-slate-950 font-black text-lg shadow-soft-sm">V</span>
          <span className="font-semibold text-xl tracking-tight">VYRO</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance text-white">
            Sign in to your procurement workspace.
          </h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            Source verified Sri Lankan suppliers. Manage multi-business purchasing at scale.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              { icon: ShieldCheckIcon, label: 'Verified suppliers, every transaction' },
              { icon: SparklesIcon, label: 'Quote-to-PO in minutes' },
              { icon: ShieldCheckIcon, label: 'LKR-native, no FX surprises' },
            ].map((p) => (
              <li key={p.label} className="flex items-center gap-3 text-sm text-slate-200">
                <span className="size-7 rounded-full bg-sky-400/15 text-sky-300 inline-flex items-center justify-center">
                  <p.icon size={14} />
                </span>
                {p.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-slate-500">© {new Date().getFullYear()} VYRO</p>
      </aside>

      {/* Form right */}
      <main className="flex-1 flex items-center justify-center px-6 py-12 lg:py-16">
        <div className="w-full max-w-md">
          <Card className="p-8 sm:p-10">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in with your business email.</p>
            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              {err && <ErrorBanner message={err} />}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.lk" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <Button type="submit" loading={loading} className="w-full">
                Sign in <ArrowRightIcon size={16} />
              </Button>
            </form>
            <p className="mt-7 text-center text-sm text-slate-500">
              New to VYRO? <Link to="/signup" className="font-medium text-sky-600 hover:underline">Create an account</Link>
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
