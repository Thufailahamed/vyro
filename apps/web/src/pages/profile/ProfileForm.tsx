import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';

type Settings = {
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
};

type Payload = { displayName?: string; avatarUrl?: string; phone?: string };

export function ProfileForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['profile-settings'],
    queryFn: () => api.get<{ settings: Settings }>('/settings/me'),
  });

  const initial: Settings = q.data?.settings ?? { displayName: null, avatarUrl: null, phone: null };
  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    if (q.data) setDraft(q.data.settings);
  }, [q.data]);

  const dirty =
    draft.displayName !== initial.displayName ||
    draft.avatarUrl !== initial.avatarUrl ||
    draft.phone !== initial.phone;

  const save = useMutation({
    mutationFn: () => {
      const payload: Payload = {};
      if (draft.displayName !== initial.displayName) payload.displayName = draft.displayName ?? '';
      if (draft.avatarUrl !== initial.avatarUrl) payload.avatarUrl = draft.avatarUrl ?? '';
      if (draft.phone !== initial.phone) payload.phone = draft.phone ?? '';
      return api.patch('/settings/me', payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-settings'] });
      toast.success('Profile updated');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <ProfileSettingsSection
      title="Profile"
      sub="How you appear across the marketplace."
      saving={save.isPending}
      dirty={dirty}
      onSave={() => save.mutate()}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={draft.displayName ?? ''}
            onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
            placeholder="Your name"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="avatarUrl">Avatar URL</Label>
          <Input
            id="avatarUrl"
            value={draft.avatarUrl ?? ''}
            onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={draft.phone ?? ''}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            placeholder="+94…"
          />
        </div>
        <button type="submit" hidden />
      </form>
    </ProfileSettingsSection>
  );
}
