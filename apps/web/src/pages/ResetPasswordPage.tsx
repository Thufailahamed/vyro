import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, PageHeader } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandMark';
import { usePageTitle } from '@/lib/usePageTitle';

export function ResetPasswordPage() {
  usePageTitle('Set new password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErr('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { newPassword: password, token });
      navigate('/login');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reset password.');
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
        <h2 className="vyro-display text-5xl text-balance">Choose a new password.</h2>
        <p className="text-xs text-paper/35">© {new Date().getFullYear()} VYRO</p>
      </aside>
      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <PageHeader kicker="Recovery" title="Set new password." sub="Link is valid for one hour." />
          {!token ? (
            <div className="mt-8 p-5 border border-rose/30 bg-rose/5 text-sm">
              Missing or invalid reset token. Request a new link from the forgot password page.
              <div className="mt-4">
                <Link to="/forgot" className="text-copper hover:text-ink font-medium">
                  Forgot password →
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {err && <ErrorBanner message={err} />}
              <div>
                <Label htmlFor="password">New password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" loading={loading} className="w-full">
                Reset password
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
