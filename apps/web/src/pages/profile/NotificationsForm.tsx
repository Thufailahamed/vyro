import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';

type Settings = {
  notifyOrderUpdates: boolean;
  notifyMessages: boolean;
  notifyMarketing: boolean;
};

const TOGGLES: Array<{
  key: keyof Settings;
  label: string;
  hint: string;
}> = [
  { key: 'notifyOrderUpdates', label: 'Order updates', hint: 'Status changes for orders you placed.' },
  { key: 'notifyMessages', label: 'Messages', hint: 'New chat messages.' },
  { key: 'notifyMarketing', label: 'Marketing', hint: 'Occasional product news and platform updates.' },
];

export function NotificationsForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['profile-notifications'],
    queryFn: () => api.get<Settings>('/settings/me/notifications'),
  });

  const initial: Settings = q.data ?? {
    notifyOrderUpdates: true,
    notifyMessages: true,
    notifyMarketing: false,
  };
  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const dirty =
    draft.notifyOrderUpdates !== initial.notifyOrderUpdates ||
    draft.notifyMessages !== initial.notifyMessages ||
    draft.notifyMarketing !== initial.notifyMarketing;

  const save = useMutation({
    mutationFn: () => api.patch('/settings/me/notifications', draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-notifications'] });
      toast.success('Notification preferences saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  return (
    <ProfileSettingsSection
      title="Notifications"
      sub="Choose which updates hit your inbox."
      saving={save.isPending}
      dirty={dirty}
      onSave={() => save.mutate()}
    >
      {TOGGLES.map((t) => (
        <label key={t.key} className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft[t.key]}
            onChange={(e) => setDraft({ ...draft, [t.key]: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">{t.label}</span>
            <span className="block text-xs text-ink-4">{t.hint}</span>
          </span>
        </label>
      ))}
    </ProfileSettingsSection>
  );
}
