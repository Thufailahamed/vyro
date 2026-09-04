import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { Button, PageHeader } from '@/components/ui';
import { useAdminAuth } from './Shell';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refresh, loading: authLoading } = useAdminAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && user?.isAdmin) {
      navigate('/admin', { replace: true });
    }
  }, [user, authLoading, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/sign-in', { email, password });
      const u = await refresh();
      if (!u) {
        setErr('Unable to establish session. Please verify your credentials and try again.');
        return;
      }
      if (!u.isAdmin) {
        setErr('Forbidden: Platform administrator privileges required.');
        return;
      }
      navigate('/admin', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign-in failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-2 gap-0 bg-paper">
      <aside className="relative hidden lg:flex flex-col justify-between bg-void text-paper p-10 overflow-hidden grain min-h-dvh">
        <div className="absolute inset-0 opacity-50">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={32} tone="volt" />
            <BrandWordmark tone="paper" eyebrow="Control" />
          </div>
          <Link to="/" className="text-xs text-paper/60 hover:text-volt transition-colors">
            ← Back to Web
          </Link>
        </div>
        <div className="relative">
          <h1 className="vyro-display text-4xl">VYRO CONTROL</h1>
          <p className="mt-3 text-sm text-paper/50 max-w-xs">Restricted operations. Every action writes to the audit trail.</p>
        </div>
      </aside>
      <section className="p-8 sm:p-12 flex flex-col justify-center min-h-dvh bg-bone">
        <div className="lg:hidden mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={24} tone="volt" />
            <BrandWordmark tone="ink" size="sm" eyebrow="Control" />
          </div>
          <Link to="/" className="text-xs text-ink-3 hover:text-ink">
            ← Back to Web
          </Link>
        </div>
        <div className="max-w-sm w-full mx-auto">
          <PageHeader kicker="Admin" title="Administrator sign in." sub="Restricted operations. Every action writes to the audit trail." />
          {err && (
            <div className="mt-4 p-3 bg-rose/10 border border-rose/20 text-sm text-rose">
              {err}
            </div>
          )}
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-4 mb-1.5">Email</label>
              <input
                className="w-full h-11 bg-paper px-3 text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B]"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@vyro.lk"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-4 mb-1.5">Password</label>
              <input
                className="w-full h-11 bg-paper px-3 text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B]"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <Button type="submit" loading={loading} className="w-full">
              Enter control
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
