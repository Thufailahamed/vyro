import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { FlowCanvas } from '@/components/brand/FlowLine';
import { Button } from '@/components/ui';

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
      navigate('/admin');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] grid lg:grid-cols-2 gap-0 bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
      <aside className="relative hidden lg:flex flex-col justify-between bg-void text-paper p-10 overflow-hidden grain">
        <div className="absolute inset-0 opacity-50">
          <FlowCanvas tone="paper" density="hero" />
        </div>
        <div className="relative flex items-center gap-3">
          <BrandMark size={32} tone="volt" />
          <BrandWordmark tone="paper" eyebrow="Control" />
        </div>
        <div className="relative">
          <h1 className="vyro-display text-4xl">VYRO CONTROL</h1>
          <p className="mt-3 text-sm text-paper/50 max-w-xs">Restricted operations. Every action writes to the audit trail.</p>
        </div>
      </aside>
      <section className="p-8 sm:p-12 flex flex-col justify-center">
        <h2 className="vyro-display text-3xl">Administrator sign in</h2>
        {err && <p className="mt-4 text-sm text-rose">{err}</p>}
        <form onSubmit={submit} className="mt-8 space-y-4 max-w-sm">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-4 mb-1.5">Email</label>
            <input
              className="w-full h-11 bg-bone px-3 text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-[0.14em] text-ink-4 mb-1.5">Password</label>
            <input
              className="w-full h-11 bg-bone px-3 text-sm shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B]"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" loading={loading} className="w-full">
            Enter control
          </Button>
        </form>
      </section>
    </div>
  );
}
