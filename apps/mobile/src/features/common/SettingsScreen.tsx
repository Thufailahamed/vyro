import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Activity, Check, ChevronRight, Compass, FileText, Info, LogOut, Phone, Timer, Trash2, UserRound } from 'lucide-react-native';
import { Button, Card, ConfirmSheet, Field, IconTile, Input, ListRow, ListSection, Loader, Screen, Sheet, Text, ToggleRow, Touchable, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, radii } from '@/theme/tokens';
import { DirtyPill, UserAvatar } from '../settings/components';

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
  const { user, business, supplier, signOut } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  const profile = useQuery({ queryKey: ['settings', 'me'], queryFn: () => api.get<{ settings: ProfileSettings }>('/settings/me') });
  const notify = useQuery({ queryKey: ['settings', 'notifications'], queryFn: () => api.get<NotifySettings>('/settings/me/notifications') });
  const security = useQuery({ queryKey: ['settings', 'security'], queryFn: () => api.get<SecuritySettings>('/settings/me/security') });

  const patchProfile = useMutation({
    mutationFn: (patch: Partial<ProfileSettings>) => api.patch('/settings/me', patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'me'] });
      setEditOpen(false);
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
  const dirty = (name != null && name !== (p?.displayName ?? '')) || (phone != null && phone !== (p?.phone ?? ''));
  const unchanged = (name == null || name === p?.displayName) && (phone == null || phone === p?.phone);
  const org = business?.businessName ?? supplier?.supplierName ?? null;
  const timeoutLabel = s ? (TIMEOUTS.find((t) => t.value === String(s.sessionTimeoutMin))?.label ?? `${s.sessionTimeoutMin} minutes`) : undefined;

  return (
    <Screen back title="Settings" gap={24}>
      {/* Profile */}
      <Card onPress={() => setEditOpen(true)} padding={16} radius={radii['2xl']} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <UserAvatar name={p?.displayName ?? user?.name} uri={p?.avatarUrl} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h2" numberOfLines={1}>
            {p?.displayName ?? user?.name ?? '—'}
          </Text>
          <Text variant="bodySm" color="ink4" numberOfLines={1}>
            {user?.email}
          </Text>
          {org ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.mint }} />
              <Text variant="caption" color="ink3" numberOfLines={1}>
                {org}
              </Text>
            </View>
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.ink5} />
      </Card>

      <ListSection label="Personal details">
        <ListRow icon={UserRound} iconTone="paper" title="Display name" subtitle={p?.displayName || user?.name || 'Not set'} onPress={() => setEditOpen(true)} />
        <ListRow icon={Phone} iconTone="paper" title="Phone" subtitle={p?.phone || 'Add a phone number'} onPress={() => setEditOpen(true)} last />
      </ListSection>

      <ListSection label="Notifications">
        {n ? (
          <>
            <ToggleRow label="Order updates" description="PO status, dispatch and delivery events" value={n.notifyOrderUpdates} onValueChange={(v) => patchNotify.mutate({ notifyOrderUpdates: v })} />
            <ToggleRow label="Messages" description="Supplier replies and RFQ quotes" value={n.notifyMessages} onValueChange={(v) => patchNotify.mutate({ notifyMessages: v })} />
            <ToggleRow label="VYRO AI insights" description="Price moves and savings alerts" value={n.notifyMarketing} onValueChange={(v) => patchNotify.mutate({ notifyMarketing: v })} />
            <ToggleRow label="Marketing email" description="Product news — separate from trade alerts" value={n.marketingOptIn} onValueChange={(v) => patchNotify.mutate({ marketingOptIn: v })} last />
          </>
        ) : (
          <View style={{ paddingVertical: 12 }}>
            <Loader label="Loading…" />
          </View>
        )}
      </ListSection>

      <ListSection label="Security">
        {s ? (
          <>
            <ToggleRow
              label="Two-factor authentication"
              description={s.twoFactorEnabled ? 'TOTP required at sign-in' : 'Add a second factor to your sign-in'}
              value={s.twoFactorEnabled}
              onValueChange={(v) => patchSecurity.mutate({ twoFactorEnabled: v })}
            />
            <ListRow icon={Timer} iconTone="paper" title="Session timeout" subtitle={timeoutLabel} onPress={() => setTimeoutOpen(true)} last />
          </>
        ) : (
          <View style={{ paddingVertical: 12 }}>
            <Loader label="Loading…" />
          </View>
        )}
      </ListSection>

      <ListSection label="About VYRO">
        <ListRow icon={Info} iconTone="paper" title="About" onPress={() => router.push('/about')} />
        <ListRow icon={Compass} iconTone="paper" title="How it works" onPress={() => router.push('/how-it-works')} />
        <ListRow icon={Activity} iconTone="paper" title="Platform status" onPress={() => router.push('/status')} />
        <ListRow icon={FileText} iconTone="paper" title="Terms & privacy" onPress={() => router.push('/legal/terms')} last />
      </ListSection>

      <View style={{ gap: 10 }}>
        <Touchable
          onPress={async () => {
            await signOut();
            router.replace('/welcome');
          }}
          hapticOnPress
          scaleTo={0.97}
          accessibilityLabel="Sign out"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.paper }}
        >
          <LogOut size={17} color={colors.ink} strokeWidth={2.1} />
          <Text variant="body" weight="semibold">
            Sign out
          </Text>
        </Touchable>
        <Touchable onPress={() => setDeleteOpen(true)} hapticOnPress accessibilityLabel="Delete account" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44 }}>
          <Trash2 size={15} color={colors.rose} strokeWidth={2} />
          <Text variant="bodySm" weight="semibold" color="rose">
            Delete account
          </Text>
        </Touchable>
        <Text variant="caption" color="ink5" align="center" style={{ paddingHorizontal: 12 }}>
          Deleting your account schedules permanent removal of your profile and settings. Active orders are not affected.
        </Text>
      </View>

      <Sheet
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        subtitle={user?.email}
        footer={
          <Button
            title="Save changes"
            full
            loading={patchProfile.isPending}
            disabled={unchanged}
            onPress={() => patchProfile.mutate({ ...(name != null ? { displayName: name } : {}), ...(phone != null ? { phone } : {}) })}
          />
        }
      >
        <View style={{ gap: 16 }}>
          <View style={{ alignItems: 'center', gap: 8 }}>
            <UserAvatar name={name ?? p?.displayName ?? user?.name} uri={p?.avatarUrl} size={72} />
            <DirtyPill dirty={dirty} />
          </View>
          <Field label="Display name">
            <Input value={name ?? p?.displayName ?? ''} onChangeText={setName} placeholder="Your name" />
          </Field>
          <Field label="Phone">
            <Input value={phone ?? p?.phone ?? ''} onChangeText={setPhone} placeholder="+94 …" keyboardType="phone-pad" />
          </Field>
        </View>
      </Sheet>

      <Sheet visible={timeoutOpen} onClose={() => setTimeoutOpen(false)} title="Session timeout" subtitle="Sign out automatically after inactivity.">
        <View style={{ gap: 8 }}>
          {TIMEOUTS.map((t) => {
            const on = s ? String(s.sessionTimeoutMin) === t.value : false;
            return (
              <Touchable
                key={t.value}
                hapticOnPress
                scaleTo={0.98}
                onPress={() => {
                  setTimeoutOpen(false);
                  if (!on) patchSecurity.mutate({ sessionTimeoutMin: Number(t.value) });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 14,
                  height: 56,
                  borderRadius: radii.lg,
                  borderCurve: 'continuous',
                  backgroundColor: on ? colors.ink : colors.pearl,
                }}
              >
                <IconTile icon={Timer} tone={on ? 'glass' : 'paper'} size={32} />
                <Text variant="body" weight="medium" color={on ? 'paper' : 'ink'} style={{ flex: 1 }}>
                  {t.label}
                </Text>
                {on ? <Check size={18} color={colors.volt} strokeWidth={2.4} /> : null}
              </Touchable>
            );
          })}
        </View>
      </Sheet>

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
