import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';
import { ShieldCheckIcon, ClockIcon, CheckIcon, AlertCircleIcon } from '@/components/icons';

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
  { value: 15, label: '15 minutes (Strict Banking Standard)' },
  { value: 30, label: '30 minutes (Recommended)' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours (Full Business Day)' },
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
  const [copied, setCopied] = useState(false);

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
      toast.success('Authenticator secret generated. Scan QR or enter secret.');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to start enrollment'),
  });

  const verify = useMutation({
    mutationFn: () => api.post('/auth/2fa/verify', { code }),
    onSuccess: () => {
      setEnroll(null);
      setCode('');
      void qc.invalidateQueries({ queryKey: ['profile-security'] });
      toast.success('Two-factor authentication successfully enabled');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Invalid 6-digit code'),
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

  const copySecret = () => {
    if (!enroll?.secret) return;
    navigator.clipboard.writeText(enroll.secret);
    setCopied(true);
    toast.success('Secret copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ProfileSettingsSection
      title="Security & Session Authentication"
      sub="Configure two-factor TOTP authentication, session timeouts, and verified enterprise access controls."
      saving={save.isPending}
      dirty={dirty && !enroll}
      onSave={() => save.mutate()}
    >
      <div className="space-y-6">
        {/* 2FA Toggle Card */}
        <div
          className={`p-5 border transition-all duration-200 ${
            draft.twoFactorEnabled
              ? 'border-ink bg-paper shadow-sm'
              : 'border-ink/15 bg-paper/50'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`size-10 shrink-0 flex items-center justify-center border ${
                  draft.twoFactorEnabled
                    ? 'bg-ink text-volt border-ink'
                    : 'bg-mist text-ink-3 border-line'
                }`}
              >
                <ShieldCheckIcon size={20} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink">Two-Factor Authentication (TOTP)</h3>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
                      draft.twoFactorEnabled
                        ? 'bg-mint/15 text-mint border border-mint/30'
                        : 'bg-mist text-ink-4 border border-line'
                    }`}
                  >
                    {draft.twoFactorEnabled ? 'Active & Enforced' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-ink-3 max-w-lg leading-relaxed">
                  Require an authenticator code (Google Authenticator, 1Password, or Authy) upon signing into your VYRO operator account.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant={draft.twoFactorEnabled ? 'danger' : 'secondary'}
              size="sm"
              loading={enable.isPending || disable.isPending}
              disabled={!!enroll}
              onClick={() => handleToggle(!draft.twoFactorEnabled)}
              className="self-start sm:self-center font-bold uppercase tracking-wider text-xs"
            >
              {draft.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
            </Button>
          </div>

          {/* 2FA Enrollment Box */}
          {enroll && (
            <div className="mt-5 pt-5 border-t border-ink/10 space-y-4 animate-fade-in">
              <div className="p-4 bg-mist/60 border border-ink/15 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <span className="size-5 rounded-full bg-ink text-volt flex items-center justify-center text-[10px]">1</span>
                  <span>Add secret to your Authenticator App</span>
                </div>

                {enroll.secret && (
                  <div className="flex items-center gap-2 p-3 bg-paper border border-ink/10">
                    <code className="flex-1 font-mono text-xs text-ink select-all font-bold tracking-wider">
                      {enroll.secret}
                    </code>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={copySecret}
                      className="text-xs shrink-0"
                    >
                      {copied ? 'Copied!' : 'Copy Secret'}
                    </Button>
                  </div>
                )}

                {enroll.totpURI && (
                  <div className="text-[11px] text-ink-4 break-all font-mono">
                    URI: {enroll.totpURI}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp-code" className="flex items-center gap-2">
                  <span className="size-5 rounded-full bg-ink text-volt flex items-center justify-center text-[10px]">2</span>
                  <span>Enter 6-digit confirmation code</span>
                </Label>
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                  <Input
                    id="totp-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="max-w-xs font-mono text-center tracking-widest text-lg font-bold"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => verify.mutate()}
                      loading={verify.isPending}
                      disabled={code.length !== 6}
                      className="text-xs uppercase tracking-wider font-bold"
                    >
                      Verify & Activate
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setEnroll(null);
                        setCode('');
                      }}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Timeout Selector */}
        <div className="p-5 border border-ink/15 bg-paper/50 space-y-3">
          <div className="flex items-start gap-4">
            <div className="size-10 shrink-0 flex items-center justify-center bg-mist text-ink-3 border border-line">
              <ClockIcon size={20} />
            </div>
            <div className="space-y-1 flex-1">
              <Label htmlFor="sessionTimeout" className="text-sm font-semibold text-ink normal-case tracking-normal">
                Operator Session Inactivity Lifetime
              </Label>
              <p className="text-xs text-ink-3 leading-relaxed">
                For security compliance on shared workstations or commercial office terminals, sessions automatically terminate after this duration of inactivity.
              </p>
              <div className="pt-2 max-w-sm">
                <select
                  id="sessionTimeout"
                  value={draft.sessionTimeoutMin}
                  onChange={(e) => setDraft({ ...draft, sessionTimeoutMin: Number(e.target.value) })}
                  className="w-full h-10 border border-ink/20 bg-paper text-ink px-3 text-sm focus:outline-none focus:border-ink font-medium"
                >
                  {TIMEOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProfileSettingsSection>
  );
}
