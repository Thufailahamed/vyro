import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/auth/sign-in', { email, password });
      navigate('/');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Sign-in failed');
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-12">
      <h1 className="text-2xl font-bold mb-4">Admin sign in</h1>
      <form onSubmit={submit} className="space-y-3 bg-white border rounded p-4">
        {err && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-2">{err}</div>}
        <input className="w-full border rounded-md px-3 py-2 text-sm" type="email" placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border rounded-md px-3 py-2 text-sm" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="w-full bg-brand-600 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-700">Sign in</button>
      </form>
    </div>
  );
}
