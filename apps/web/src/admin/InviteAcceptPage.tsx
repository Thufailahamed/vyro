import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorBanner, Input, PageHeader, Surface } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export function InviteAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!token) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-bone text-ink p-6">
        <Surface className="max-w-md w-full p-6">
          <h1 className="text-lg font-semibold mb-2">Invalid invite</h1>
          <p className="text-sm text-ink-500">
            Missing token. Use the link from your invitation email.
          </p>
        </Surface>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    setPending(true);
    try {
      await api.post('/admin/invites/accept', {
        token,
        ...(name ? { name } : {}),
        ...(password ? { password } : {}),
      });
      navigate('/admin');
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError('Failed to accept invite');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bone text-ink p-6">
      <Surface className="max-w-md w-full p-6 space-y-4">
        <PageHeader title="Accept admin invite" subtitle="Set optional credentials to finish onboarding." />
        {error ? <ErrorBanner message={error} /> : null}
        <label className="block">
          <span className="text-sm">Display name (optional)</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-sm">Password (optional)</span>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min 8 characters"
          />
        </label>
        <div className="flex justify-end">
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Accepting…' : 'Accept invite'}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
