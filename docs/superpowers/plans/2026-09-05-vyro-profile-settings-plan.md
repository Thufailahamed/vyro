# VYRO Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 3 existing user-settings endpoints into `/profile` as editable forms.

**Architecture:** 4 new files (1 shared chrome + 3 forms) under `apps/web/src/pages/profile/`. `ProfilePage.tsx` mounts all 3 below existing business/supplier panels. No API changes.

**Tech Stack:** React + React Query + zod (validation via existing schemas), `Surface`/`PageHeader`/`Button`/`Input`/`Label` from existing ui barrel, `useToast` from `@vyro/ui`.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- Save buttons disabled while `draft === initial` or `isPending`
- All errors surface via `useToast()`; inline field errors under offending input
- `errorEnvelope(err)` parsing not needed client-side — `ApiError.message` carries it
- Match sub-project C visual tokens: `ink-*`, `font-semibold`, `PageHeader`, `Surface kind="elevated"`

---

### Task D1: ProfileSettingsSection shared chrome

**Files:**
- Create: `apps/web/src/pages/profile/ProfileSettingsSection.tsx`

- [ ] **Step 1: Create the section component**

```tsx
import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';

export interface ProfileSettingsSectionProps {
  title: string;
  sub?: string;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  children: ReactNode;
}

export function ProfileSettingsSection({
  title,
  sub,
  saving,
  dirty,
  onSave,
  children,
}: ProfileSettingsSectionProps) {
  return (
    <Surface kind="elevated" className="p-6 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="vyro-display text-lg">{title}</h2>
          {sub && <p className="text-xs text-ink-4 mt-1">{sub}</p>}
        </div>
        <Button
          variant="primary"
          onClick={onSave}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </header>
      <div className="space-y-4">{children}</div>
    </Surface>
  );
}
```

- [ ] **Step 2: Verify typecheck**
Run: `cd apps/web && pnpm typecheck`
Expected: clean (file not yet imported anywhere, but must compile)

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/pages/profile/ProfileSettingsSection.tsx
git commit -m "feat(profile): ProfileSettingsSection shared chrome"
```

---

### Task D2: ProfileForm (PATCH /me)

**Files:**
- Create: `apps/web/src/pages/profile/ProfileForm.tsx`

- [ ] **Step 1: Create the form**

```tsx
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
  useEffect(() => { setDraft(initial); }, [q.data]);

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

  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

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
```

- [ ] **Step 2: Verify typecheck**
Run: `cd apps/web && pnpm typecheck`
Expected: clean

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/pages/profile/ProfileForm.tsx
git commit -m "feat(profile): ProfileForm — displayName/avatarUrl/phone"
```

---

### Task D3: NotificationsForm (PATCH /me/notifications)

**Files:**
- Create: `apps/web/src/pages/profile/NotificationsForm.tsx`

- [ ] **Step 1: Create the form**

```tsx
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
  useEffect(() => { setDraft(initial); }, [q.data]);

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
      {([
        ['notifyOrderUpdates', 'Order updates', 'Status changes for orders you placed.'],
        ['notifyMessages', 'Messages', 'New chat messages from suppliers and admins.'],
        ['notifyMarketing', 'Marketing', 'Occasional product news and platform updates.'],
      ] as const).map(([key, label, hint]) => (
        <label key={key} className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
          />
          <span>
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-xs text-ink-4">{hint}</span>
          </span>
        </label>
      ))}
    </ProfileSettingsSection>
  );
}
```

- [ ] **Step 2: Verify typecheck**
Run: `cd apps/web && pnpm typecheck`
Expected: clean

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/pages/profile/NotificationsForm.tsx
git commit -m "feat(profile): NotificationsForm — 3 prefs toggles"
```

---

### Task D4: SecurityForm (PATCH /me/security)

**Files:**
- Create: `apps/web/src/pages/profile/SecurityForm.tsx`

- [ ] **Step 1: Create the form**

```tsx
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

const TIMEOUT_OPTIONS: { value: number; label: string }[] = [
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
  useEffect(() => { setDraft(initial); }, [q.data]);

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
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </ProfileSettingsSection>
  );
}
```

- [ ] **Step 2: Verify typecheck**
Run: `cd apps/web && pnpm typecheck`
Expected: clean

- [ ] **Step 3: Commit**
```bash
git add apps/web/src/pages/profile/SecurityForm.tsx
git commit -m "feat(profile): SecurityForm — 2FA toggle + timeout"
```

---

### Task D5: wire forms into ProfilePage

**Files:**
- Modify: `apps/web/src/pages/ProfilePage.tsx`

- [ ] **Step 1: Read existing file to confirm structure**

Run: `cat apps/web/src/pages/ProfilePage.tsx`

Note where the existing surfaces end (likely just before `</div>` of the page wrapper). The 3 new sections must be added AFTER the existing business/supplier panels but inside the outer `<div className="space-y-8 max-w-3xl">`.

- [ ] **Step 2: Add imports + render the 3 sections**

In the existing import block, add:
```tsx
import { ProfileForm } from './profile/ProfileForm';
import { NotificationsForm } from './profile/NotificationsForm';
import { SecurityForm } from './profile/SecurityForm';
```

Just before the closing `</div>` of the page wrapper, add:
```tsx
<ProfileForm />
<NotificationsForm />
<SecurityForm />
```

- [ ] **Step 3: Verify typecheck**
Run: `cd apps/web && pnpm typecheck`
Expected: clean

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/pages/ProfilePage.tsx
git commit -m "feat(profile): mount 3 settings sections on /profile"
```

---

### Task D6: smoke + final

- [ ] **Step 1: Run full test suite**
Run: `cd apps/api && pnpm exec vitest run`
Expected: 89 passed, 1 skipped (unchanged from sub-project C)

- [ ] **Step 2: Run monorepo typecheck**
Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 3: Run web build**
Run: `cd apps/web && pnpm build`
Expected: built without errors

- [ ] **Step 4: Report**
Report commit list for sub-project D.

---

## Execution Choice

User selected **Inline Execution**. Begin with D1.
