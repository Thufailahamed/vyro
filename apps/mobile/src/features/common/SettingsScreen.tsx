import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, Compass, FileText, Info, LogOut, Timer, Trash2, Activity } from 'lucide-react-native';
import { Button, Card, ConfirmSheet, Field, IconTile, Input, ListRow, ListSection, Loader, Screen, Sheet, Text, ToggleRow, Touchable, useToast } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, fonts, radii } from '@/theme/tokens';
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
  const dirty = (name != null && name !== (p?.displayName ?? '')) || (phone != null && phone !== (p?.phone ?? ''));
  const unchanged = (name == null || name === p?.displayName) && (phone == null || phone === p?.phone);
  const org = business?.businessName ?? supplier?.supplierName ?? null;
  const timeoutLabel = s ? (TIMEOUTS.find((t) => t.value === String(s.sessionTimeoutMin))?.label ?? `${s.sessionTimeoutMin} minutes`) : undefined;

  return (
    <Screen keyboard back kicker="Workspace" title="Settings" gap={24}>
      {/* Profile header card */}
      <Card kind="elevated" padding={18} radius={radii['2xl']} style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <UserAvatar name={name ?? p?.displayName ?? user?.name} uri={p?.avatarUrl} size={62} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h2" numberOfLines={1}>
              {p?.displayName ?? user?.name ?? '—'}
            </Text>
            <Text variant="bodySm" color="ink4" numberOfLines={1}>
              {user?.email}
            </Text>
            {org ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt }} />
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.6, color: colors.ink3 }} numberOfLines={1}>
                  {org.toUpperCase()}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft }} />
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="overline" color="ink4">
              Profile
            </Text>
            <DirtyPill dirty={dirty} />
          </View>
          <Field label="Display name">
            <Input value={name ?? p?.displayName ?? ''} onChangeText={setName} placeholder="Your name" />
          </Field>
          <Field label="Phone">
            <Input value={phone ?? p?.phone ?? ''} onChangeText={setPhone} placeholder="+94 …" keyboardType="phone-pad" />
          </Field>
          <Button
            title="Save profile"
            variant={unchanged ? 'secondary' : 'primary'}
            full
            loading={patchProfile.isPending}
            disabled={unchanged}
            onPress={() => patchProfile.mutate({ ...(name != null ? { displayName: name } : {}), ...(phone != null ? { phone } : {}) })}
          />
        </View>
      </Card>

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

      <ListSection label="Session">
        <ListRow
          icon={LogOut}
          iconTone="copper"
          title="Sign out"
          chevron={false}
          last
          onPress={async () => {
            await signOut();
            router.replace('/welcome');
          }}
        />
      </ListSection>

      <ListSection footer="Deleting your account schedules permanent removal of your profile and settings. Active orders are not affected.">
        <ListRow icon={Trash2} iconTone="danger" title="Delete account" destructive chevron={false} last onPress={() => setDeleteOpen(true)} />
      </ListSection>

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
