import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ShieldCheckIcon, AlertCircleIcon } from './icons';

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
      navigate('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign-in failed. Please check administrator credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-8 sm:mt-16">
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 sm:p-10 shadow-soft-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-slate-900 to-brand-700 text-white flex items-center justify-center font-black text-2xl mx-auto shadow-soft-sm">
            V
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200 uppercase tracking-wide">
            Platform Administration
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Admin Portal Access
          </h1>
          <p className="text-xs text-slate-500">
            Secure sign-in for VYRO operations and compliance officers
          </p>
        </div>

        {err && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl p-3.5 shadow-soft-sm">
            <AlertCircleIcon size={16} className="text-rose-600 shrink-0 mt-0.5" />
            <div className="font-medium">{err}</div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Admin Email
            </label>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-soft-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              type="email"
              placeholder="admin@vyro.lk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Secret Password
            </label>
            <input
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-soft-sm transition-all focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-slate-800 active:scale-[0.99] transition-all shadow-soft-sm disabled:opacity-50"
          >
            {loading ? 'Authenticating…' : 'Sign in to Admin Console'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheckIcon size={14} className="text-emerald-600" />
          <span>Restricted Area · 256-bit Encrypted Session</span>
        </div>
      </div>
    </div>
  );
}
