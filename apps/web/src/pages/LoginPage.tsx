import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { MailIcon, ArrowRightIcon } from '@/components/icons';

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
    <div className="max-w-md mx-auto py-8 sm:py-12">
      <Card className="p-8 sm:p-10 border-slate-200/90 shadow-soft-lg space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-700 via-brand-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-soft-sm font-black text-2xl">
            V
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Sign in to VYRO
          </h1>
          <p className="text-xs text-slate-500">
            Sri Lanka's wholesale & B2B procurement network
          </p>
        </div>

        <ErrorBanner message={err} />

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">Business Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.lk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="password">Password</Label>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            loading={loading}
            size="lg"
            className="w-full font-bold shadow-soft-sm justify-center"
          >
            <span>Sign In</span>
            <ArrowRightIcon size={16} />
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-600 space-y-2">
          <p>
            Don't have a VYRO account yet?{' '}
            <Link to="/signup" className="font-bold text-brand-700 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
