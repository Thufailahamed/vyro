import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, PageHeader } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas } from '@/components/brand/FlowLine';

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      navigate('/onboarding/business');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Sign up failed. Please check your information.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr] bg-bone">
      <aside className="relative hidden lg:flex flex-col justify-between bg-ink text-paper p-12 overflow-hidden grain">
        <div className="absolute inset-0 opacity-70">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <Link to="/" className="relative z-10 flex items-center gap-3">
          <BrandMark size={32} tone="volt" />
          <BrandWordmark tone="paper" />
        </Link>
        <div className="relative z-10 max-w-md">
          <h2 className="vyro-display text-5xl text-balance">Start in the operating layer.</h2>
          <p className="mt-4 text-paper/60">Free to browse. Pay only when you issue purchase orders.</p>
        </div>
        <p className="relative z-10 text-xs text-paper/35">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <PageHeader kicker="Create account" title="Join VYRO." sub="Free to browse. Pay only when you issue purchase orders." />
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            {err && <ErrorBanner message={err} />}
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone <span className="text-ink-4 font-normal">(optional)</span></Label>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="+94 …"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                pattern="^[+0-9 ()\-]{7,20}$"
              />
            </div>
            <Button type="submit" loading={loading} className="w-full">
              Continue
            </Button>
          </form>
          <p className="mt-8 text-sm text-ink-4">
            Already have an account?{' '}
            <Link to="/login" className="text-copper hover:text-ink">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
