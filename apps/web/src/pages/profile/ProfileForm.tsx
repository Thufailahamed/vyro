import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';
import { UserIcon, PhoneIcon, ShieldCheckIcon } from '@/components/icons';

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
      toast.success('Profile credentials updated');
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
      toast.success('Avatar uploaded successfully');
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

  const initials = (draft.displayName || 'OP').slice(0, 2).toUpperCase();

  return (
    <ProfileSettingsSection
      title="Operator Profile Credentials"
      sub="Manage your public identity, contact details, and organization representation across the VYRO marketplace."
      saving={save.isPending}
      dirty={dirty}
      onSave={() => save.mutate()}
    >
      <form onSubmit={submit} className="space-y-6">
        {/* Avatar Section */}
        <div className="p-5 bg-paper/60 border border-ink/10 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative">
            {draft.avatarUrl ? (
              <img
                src={draft.avatarUrl}
                alt="Avatar"
                className="size-20 rounded-full object-cover border-2 border-ink shadow-sm"
              />
            ) : (
              <div className="size-20 rounded-full bg-ink text-volt text-2xl font-display font-bold flex items-center justify-center border-2 border-volt/40 shadow-sm">
                {initials}
              </div>
            )}
            <span className="absolute bottom-0 right-0 size-4 rounded-full bg-mint border-2 border-paper" title="Active Account" />
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
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
                className="text-xs uppercase tracking-wider font-semibold"
              >
                Upload Photo
              </Button>
              {draft.avatarUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDraft({ ...draft, avatarUrl: '' })}
                  className="text-xs text-rose hover:bg-rose/10"
                >
                  Remove Photo
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-4">
              Supported formats: PNG, JPEG, WEBP or GIF (Maximum file size 2MB).
            </p>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="displayName" className="flex items-center gap-1.5">
              <UserIcon size={13} className="text-copper" />
              <span>Full Operator Name</span>
            </Label>
            <Input
              id="displayName"
              value={draft.displayName ?? ''}
              onChange={(e) => setDraft({ ...draft, displayName: e.target.value })}
              placeholder="e.g. Thufail Ahamed"
              className="bg-paper"
            />
            <p className="text-[11px] text-ink-4">
              Appears on generated Purchase Orders and supplier correspondence.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone" className="flex items-center gap-1.5">
              <PhoneIcon size={13} className="text-copper" />
              <span>Direct Phone Number</span>
            </Label>
            <Input
              id="phone"
              value={draft.phone ?? ''}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="+94 77 123 4567"
              className="bg-paper font-mono"
            />
            <p className="text-[11px] text-ink-4">
              Sri Lanka contact number for delivery dock verification & driver manifests.
            </p>
          </div>
        </div>

        {/* Avatar URL Direct Override */}
        <div className="space-y-1.5 pt-2 border-t border-ink/10">
          <Label htmlFor="avatarUrl" className="text-ink-4">External Avatar URL (Optional)</Label>
          <Input
            id="avatarUrl"
            value={draft.avatarUrl ?? ''}
            onChange={(e) => setDraft({ ...draft, avatarUrl: e.target.value })}
            placeholder="https://images.unsplash.com/..."
            className="bg-paper font-mono text-xs"
          />
          <p className="text-[11px] text-ink-4">
            If you host your company logo or profile image on a remote CDN, you can specify its HTTPS URL directly.
          </p>
        </div>

        <button type="submit" hidden />
      </form>
    </ProfileSettingsSection>
  );
}
