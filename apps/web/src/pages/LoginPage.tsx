import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas, FlowLine } from '@/components/brand/FlowLine';

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
      navigate('/dashboard');
    } catch (e) {
      setErr(e instanceof ApiError ? `${e.message}` : 'Sign in failed. Please check your credentials.');
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
          <h2 className="vyro-display text-5xl text-balance">Return to the flow.</h2>
          <p className="mt-4 text-paper/60">Your procurement, suppliers and orders — in one operating layer.</p>
          <div className="mt-10">
            <FlowLine
              tone="paper"
              nodes={[
                { label: 'Business', state: 'active' },
                { label: 'Catalog', state: 'idle' },
                { label: 'Orders', state: 'idle' },
              ]}
            />
          </div>
        </div>
        <p className="relative z-10 text-xs text-paper/35">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <Link to="/" className="lg:hidden flex items-center gap-2 mb-10">
            <BrandMark size={28} />
            <BrandWordmark size="sm" />
          </Link>
          <div className="vyro-kicker">Sign in</div>
          <h1 className="mt-2 vyro-display text-4xl">Welcome back</h1>
          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            {err && <ErrorBanner message={err} />}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@business.lk" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button type="submit" loading={loading} className="w-full">
              Enter workspace
            </Button>
          </form>
          <p className="mt-8 text-sm text-ink-4">
            New to VYRO?{' '}
            <Link to="/signup" className="text-copper hover:text-ink">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
