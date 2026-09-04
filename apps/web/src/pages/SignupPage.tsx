import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ArrowRightIcon, ShieldCheckIcon, MailIcon, UserIcon } from '@/components/icons';

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const { refresh } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/sign-up', { email, password, name });
      await refresh();
      navigate('/profile');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Sign up failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50">
      <aside className="relative lg:w-[44%] bg-slate-950 text-white px-8 py-10 lg:px-16 lg:py-16 flex flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] grid-bg pointer-events-none" aria-hidden />
        <div className="absolute -bottom-1/4 -left-1/4 size-[500px] rounded-full bg-sky-400/10 blur-3xl pointer-events-none" aria-hidden />
        <Link to="/" className="relative z-10 inline-flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-md bg-sky-300 inline-flex items-center justify-center text-slate-950 font-black text-lg">V</span>
          <span className="font-semibold text-xl tracking-tight">VYRO</span>
        </Link>
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-balance text-white">
            Procurement, built for Sri Lanka.
          </h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            Join businesses sourcing 12,000+ products from 1,200+ verified local suppliers.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              { icon: ShieldCheckIcon, label: 'VAT/BR verified suppliers' },
              { icon: ShieldCheckIcon, label: 'Audited PO dispute resolution' },
              { icon: ShieldCheckIcon, label: 'Consolidated multi-business billing' },
            ].map((p, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-slate-200">
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

      <main className="flex-1 flex items-center justify-center px-6 py-12 lg:py-16">
        <div className="w-full max-w-md">
          <Card className="p-8 sm:p-10">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Create your account</h1>
            <p className="mt-2 text-sm text-slate-500">Free to browse. Pay only on orders.</p>
            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              {err && <ErrorBanner message={err} />}
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Perera" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.lk" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
              </div>
              <Button type="submit" loading={loading} className="w-full">
                Create account <ArrowRightIcon size={16} />
              </Button>
            </form>
            <p className="mt-7 text-center text-sm text-slate-500">
              Already have an account? <Link to="/login" className="font-medium text-sky-600 hover:underline">Sign in</Link>
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
