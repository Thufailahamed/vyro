import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBanner, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ArrowRightIcon, ShieldCheckIcon } from '@/components/icons';

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
    <div className="max-w-md mx-auto py-8 sm:py-12">
      <Card className="p-8 sm:p-10 border-slate-200/90 shadow-soft-lg space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-brand-700 via-brand-600 to-sky-400 flex items-center justify-center text-white mx-auto shadow-soft-sm font-black text-2xl">
            V
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Create Your VYRO Account
          </h1>
          <p className="text-xs text-slate-500">
            Connect directly with verified suppliers across Sri Lanka
          </p>
        </div>

        <ErrorBanner message={err} />

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              placeholder="e.g. Kasun Perera"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="email">Business or Personal Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="kasun@company.lk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="password">Password (minimum 8 characters)</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="flex items-start gap-2 pt-1 text-xs text-slate-500">
            <ShieldCheckIcon size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>Encrypted credentials & secure role-based permissions.</span>
          </div>

          <Button
            type="submit"
            disabled={loading}
            loading={loading}
            size="lg"
            className="w-full font-bold shadow-soft-sm justify-center"
          >
            <span>Create Account</span>
            <ArrowRightIcon size={16} />
          </Button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-600 space-y-2">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="font-bold text-brand-700 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
