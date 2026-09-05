import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';

type Settings = {
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
};

type Payload = { displayName?: string; avatarUrl?: string; phone?: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function ProfileForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
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

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await fileToBase64(file);
      const res = await api.post<{ avatarUrl: string }>('/settings/me/avatar', {
        filename: file.name,
        contentType: file.type || 'image/png',
        base64,
      });
      return res.avatarUrl;
    },
    onSuccess: (avatarUrl) => {
      setDraft((d) => ({ ...d, avatarUrl }));
      void qc.invalidateQueries({ queryKey: ['profile-settings'] });
      toast.success('Avatar uploaded');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Upload failed'),
  });

  const onPick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Avatar must be under 2MB');
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast.error('Use PNG, JPEG, WEBP, or GIF');
      return;
    }
    upload.mutate(file);
  };

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
        <div className="flex items-center gap-4">
          {draft.avatarUrl ? (
            <img
              src={draft.avatarUrl}
              alt="Avatar"
              className="h-14 w-14 rounded-full object-cover border border-line"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-mist border border-line" />
          )}
          <div className="flex flex-col gap-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              Upload avatar
            </Button>
            <p className="text-xs text-ink-4">PNG/JPEG/WEBP/GIF, ≤ 2MB.</p>
          </div>
        </div>
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
