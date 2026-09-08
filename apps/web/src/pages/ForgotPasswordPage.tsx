import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, PageHeader } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { usePageTitle } from '@/lib/usePageTitle';

export function ForgotPasswordPage() {
  usePageTitle('Reset password');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      await api.post('/auth/forget-password', { email });
      setDone(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not send reset email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1.05fr_1fr] bg-bone">
      <aside className="hidden lg:flex flex-col justify-between bg-ink text-paper p-12">
        <Link to="/" className="flex items-center gap-3">
          <BrandMark size={32} tone="volt" />
          <BrandWordmark tone="paper" />
        </Link>
        <h2 className="vyro-display text-5xl text-balance">Reset your access.</h2>
        <p className="text-xs text-paper/35">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <PageHeader kicker="Recovery" title="Forgot password." sub="We'll send a reset link to your email." />
          {done ? (
            <div className="mt-8 p-5 border border-mint/30 bg-mint/5 text-sm">
              If an account exists for <strong>{email}</strong>, a reset link has been sent. Check your inbox.
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {err && <ErrorBanner message={err} />}
              <div>
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" loading={loading} className="w-full">
                Send reset link
              </Button>
            </form>
          )}
          <p className="mt-8 text-sm text-ink-4">
            Remembered it?{' '}
            <Link to="/login" className="text-copper hover:text-ink">
              Back to sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
