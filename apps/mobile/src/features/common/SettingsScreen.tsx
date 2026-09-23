import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Avatar, Banner, Button, ConfirmSheet, Field, Gutter, Input, Loader, Screen, ScreenHeader, Select, Text, ToggleRow, useToast } from '@/ui';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Section } from '../buyer/orders/kit';

interface ProfileSettings {
  displayName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
}
interface NotifySettings {
  notifyOrderUpdates: boolean;
  notifyMessages: boolean;
  notifyMarketing: boolean;
  marketingOptIn: boolean;
}
interface SecuritySettings {
  twoFactorEnabled: boolean;
  sessionTimeoutMin: number;
}

const TIMEOUTS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' },
  { value: '1440', label: '24 hours' },
];

/** Shared settings hub — profile, notification prefs, security, account. */
export function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  const profile = useQuery({ queryKey: ['settings', 'me'], queryFn: () => api.get<{ settings: ProfileSettings }>('/settings/me') });
  const notify = useQuery({ queryKey: ['settings', 'notifications'], queryFn: () => api.get<NotifySettings>('/settings/me/notifications') });
  const security = useQuery({ queryKey: ['settings', 'security'], queryFn: () => api.get<SecuritySettings>('/settings/me/security') });

  const patchProfile = useMutation({
    mutationFn: (patch: Partial<ProfileSettings>) => api.patch('/settings/me', patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'me'] });
      toast.success('Profile saved');
    },
    onError: (e) => toast.error('Save failed', errorMessage(e)),
  });
  const patchNotify = useMutation({
    mutationFn: (patch: Partial<NotifySettings>) => api.patch('/settings/me/notifications', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
    onError: (e) => toast.error('Save failed', errorMessage(e)),
  });
  const patchSecurity = useMutation({
    mutationFn: (patch: Partial<SecuritySettings>) => api.patch('/settings/me/security', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'security'] }),
    onError: (e) => toast.error('Save failed', errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.post('/settings/me/delete'),
    onSuccess: async () => {
      toast.success('Account deletion scheduled');
      await signOut();
      router.replace('/welcome');
    },
    onError: (e) => toast.error('Could not schedule deletion', errorMessage(e)),
  });

  const p = profile.data?.settings;
  const n = notify.data;
  const s = security.data;

  return (
    <Screen keyboard>
      <ScreenHeader back kicker="Workspace" title="Settings" subtitle={user?.email} />
      <Gutter style={{ gap: 14 }}>
        <Section kicker="Identity" title="Profile">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={name ?? p?.displayName ?? user?.name} uri={assetUrl(p?.avatarUrl)} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="semibold">
                {p?.displayName ?? user?.name ?? '—'}
              </Text>
              <Text variant="caption" color="ink4">
                {user?.email}
              </Text>
            </View>
          </View>
          <Field label="Display name">
            <Input value={name ?? p?.displayName ?? ''} onChangeText={setName} placeholder="Your name" />
          </Field>
          <Field label="Phone">
            <Input value={phone ?? p?.phone ?? ''} onChangeText={setPhone} placeholder="+94 …" keyboardType="phone-pad" />
          </Field>
          <Button
            title="Save profile"
            variant="secondary"
            size="sm"
            loading={patchProfile.isPending}
            disabled={(name == null || name === p?.displayName) && (phone == null || phone === p?.phone)}
            onPress={() => patchProfile.mutate({ ...(name != null ? { displayName: name } : {}), ...(phone != null ? { phone } : {}) })}
          />
        </Section>

        <Section kicker="Delivery" title="Notifications">
          {n ? (
            <>
              <ToggleRow label="Order updates" description="PO status, dispatch and delivery events" value={n.notifyOrderUpdates} onValueChange={(v) => patchNotify.mutate({ notifyOrderUpdates: v })} />
              <ToggleRow label="Messages" description="Supplier replies and RFQ quotes" value={n.notifyMessages} onValueChange={(v) => patchNotify.mutate({ notifyMessages: v })} />
              <ToggleRow label="VYRO AI insights" description="Price moves and savings alerts" value={n.notifyMarketing} onValueChange={(v) => patchNotify.mutate({ notifyMarketing: v })} />
              <ToggleRow label="Marketing email" description="Product news — separate from trade alerts" value={n.marketingOptIn} onValueChange={(v) => patchNotify.mutate({ marketingOptIn: v })} last />
            </>
          ) : (
            <Loader label="Loading…" />
          )}
        </Section>

        <Section kicker="Access" title="Security">
          {s ? (
            <>
              <ToggleRow label="Two-factor authentication" description={s.twoFactorEnabled ? 'TOTP required at sign-in' : 'Add a second factor to your sign-in'} value={s.twoFactorEnabled} onValueChange={(v) => patchSecurity.mutate({ twoFactorEnabled: v })} />
              <Field label="Session timeout">
                <Select
                  value={String(s.sessionTimeoutMin)}
                  options={TIMEOUTS}
                  onChange={(v) => patchSecurity.mutate({ sessionTimeoutMin: Number(v) })}
                  title="Session timeout"
                />
              </Field>
            </>
          ) : (
            <Loader label="Loading…" />
          )}
        </Section>

        <Section kicker="Account" title="Session">
          <Button
            title="Sign out"
            variant="secondary"
            full
            onPress={async () => {
              await signOut();
              router.replace('/welcome');
            }}
          />
          <Banner tone="warning" message="Deleting your account schedules permanent removal of your profile and settings. Active orders are not affected." />
          <Button title="Delete account" variant="danger" full onPress={() => setDeleteOpen(true)} />
        </Section>
      </Gutter>

      <ConfirmSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => del.mutate()}
        title="Delete account?"
        message="This schedules permanent deletion. You will be signed out immediately."
        confirmLabel="Delete my account"
        variant="danger"
        loading={del.isPending}
      />
    </Screen>
  );
}
