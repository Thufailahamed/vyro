import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';

type Settings = {
  twoFactorEnabled: boolean;
  sessionTimeoutMin: number;
};

type EnrollResponse = {
  totpURI?: string;
  secret?: string;
  backupCodes?: string[];
};

const TIMEOUT_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '1 day' },
];

export function SecurityForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['profile-security'],
    queryFn: () => api.get<Settings>('/settings/me/security'),
  });

  const initial: Settings = q.data ?? { twoFactorEnabled: false, sessionTimeoutMin: 60 };
  const [draft, setDraft] = useState<Settings>(initial);
  const [enroll, setEnroll] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const dirty =
    draft.twoFactorEnabled !== initial.twoFactorEnabled ||
    draft.sessionTimeoutMin !== initial.sessionTimeoutMin;

  const enable = useMutation({
    mutationFn: () => api.post<EnrollResponse>('/auth/2fa/enable', { password: '' }),
    onSuccess: (data) => {
      setEnroll(data);
      toast.success('Scan the QR code with your authenticator app');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to start enrollment'),
  });

  const verify = useMutation({
    mutationFn: () => api.post('/auth/2fa/verify', { code }),
    onSuccess: () => {
      setEnroll(null);
      setCode('');
      void qc.invalidateQueries({ queryKey: ['profile-security'] });
      toast.success('Two-factor authentication enabled');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Invalid code'),
  });

  const disable = useMutation({
    mutationFn: () => api.post('/auth/2fa/disable', { password: '' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-security'] });
      setDraft((d) => ({ ...d, twoFactorEnabled: false }));
      toast.success('Two-factor authentication disabled');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to disable'),
  });

  const save = useMutation({
    mutationFn: () => api.patch('/settings/me/security', draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-security'] });
      toast.success('Security settings saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  async function handleToggle(next: boolean) {
    setDraft({ ...draft, twoFactorEnabled: next });
    if (next && !initial.twoFactorEnabled) enable.mutate();
    if (!next && initial.twoFactorEnabled) disable.mutate();
  }

  return (
    <ProfileSettingsSection
      title="Security"
      sub="Two-factor authentication and session lifetime."
      saving={save.isPending}
      dirty={dirty && !enroll}
      onSave={() => save.mutate()}
    >
      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft.twoFactorEnabled}
            disabled={enable.isPending || disable.isPending || !!enroll}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">Two-factor authentication</span>
            <span className="block text-xs text-ink-4">
              Require a second factor at sign-in via an authenticator app.
            </span>
          </span>
        </label>

        {enroll && (
          <div className="border border-line p-4 bg-mist/40 space-y-3">
            <div className="text-sm font-medium">Scan with your authenticator</div>
            {enroll.totpURI && (
              <p className="text-xs text-ink-4 break-all font-mono">{enroll.totpURI}</p>
            )}
            {enroll.secret && (
              <p className="text-xs text-ink-3">
                Or enter this secret manually:{' '}
                <code className="font-mono text-ink-1">{enroll.secret}</code>
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1">
                <Label htmlFor="totp-code">6-digit code</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <Button onClick={() => verify.mutate()} loading={verify.isPending} disabled={code.length !== 6}>
                Verify
              </Button>
              <Button variant="ghost" onClick={() => { setEnroll(null); setCode(''); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="sessionTimeout">Session timeout</Label>
        <select
          id="sessionTimeout"
          value={draft.sessionTimeoutMin}
          onChange={(e) => setDraft({ ...draft, sessionTimeoutMin: Number(e.target.value) })}
          className="flex h-9 w-full rounded-xs border border-line bg-paper text-ink-1 px-3 text-body"
        >
          {TIMEOUT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </ProfileSettingsSection>
  );
}
