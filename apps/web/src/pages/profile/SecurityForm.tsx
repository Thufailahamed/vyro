import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';

type Settings = {
  twoFactorEnabled: boolean;
  sessionTimeoutMin: number;
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
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const dirty =
    draft.twoFactorEnabled !== initial.twoFactorEnabled ||
    draft.sessionTimeoutMin !== initial.sessionTimeoutMin;

  const save = useMutation({
    mutationFn: () => api.patch('/settings/me/security', draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-security'] });
      toast.success('Security settings saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  return (
    <ProfileSettingsSection
      title="Security"
      sub="Two-factor authentication and session lifetime."
      saving={save.isPending}
      dirty={dirty}
      onSave={() => save.mutate()}
    >
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={draft.twoFactorEnabled}
          onChange={(e) => setDraft({ ...draft, twoFactorEnabled: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-medium">Two-factor authentication</span>
          <span className="block text-xs text-ink-4">
            Require a second factor at sign-in. (Enrollment coming soon — toggle persists.)
          </span>
        </span>
      </label>

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
