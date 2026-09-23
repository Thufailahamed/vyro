import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertTriangle, ArrowRight, Bell, ChevronRight, GraduationCap, SearchX, X, type LucideIcon } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth, type OrgRole } from '@/lib/auth';
import { Badge, Button, Card, IconButton, Pulse, Text, Touchable } from '@/ui';
import { colors, fonts, radii, type Tone } from '@/theme/tokens';

/* --------------------------------- Context -------------------------------- */

/** Active supplier org. The supplier layout already gates on membership. */
export function useSupplier(): { supplierId: string; supplierName: string; role: OrgRole | undefined } {
  const { supplier } = useAuth();
  return { supplierId: supplier?.supplierId ?? '', supplierName: supplier?.supplierName ?? 'Supplier', role: supplier?.role };
}

/** Navigate to any app path. Routes are owned by several areas, so we cast. */
export function go(path: string) {
  router.push(path as never);
}

/* --------------------------------- Motion --------------------------------- */

/** Staggered FadeInDown entrance used on every section / list item. */
export function Enter({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(i, 10) * 55).duration(420)} style={style}>
      {children}
    </Animated.View>
  );
}

/* -------------------------------- Surfaces -------------------------------- */

/** Paper section with an ink icon tile, title and optional right-side action. */
export function Section({
  icon: Icon,
  kicker,
  title,
  sub,
  action,
  right,
  children,
  padding = 16,
  kind = 'flat',
  style,
}: {
  icon?: LucideIcon;
  kicker?: string;
  title: string;
  sub?: string;
  action?: { label: string; onPress: () => void };
  right?: ReactNode;
  children?: ReactNode;
  padding?: number;
  kind?: 'flat' | 'elevated' | 'bone';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card kind={kind} padding={padding} style={[{ gap: 14 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {Icon ? (
          <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={17} color={colors.volt} strokeWidth={1.8} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          {kicker ? (
            <Text variant="overline" color="copper" style={{ fontSize: 9.5, letterSpacing: 1.3 }} numberOfLines={1}>
              {kicker}
            </Text>
          ) : null}
          <Text variant="h2" numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <Text variant="caption" color="ink4" numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
        {action ? (
          <Touchable
            onPress={action.onPress}
            hapticOnPress
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              height: 30,
              paddingLeft: 11,
              paddingRight: 7,
              borderRadius: radii.pill,
              backgroundColor: colors.pearl,
              borderWidth: 1,
              borderColor: colors.line,
              flexShrink: 0,
            }}
          >
            <Text variant="caption" weight="semibold" color="ink2" numberOfLines={1}>
              {action.label}
            </Text>
            <ChevronRight size={14} color={colors.ink4} />
          </Touchable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

/** Large mono metric on ink surfaces. */
export function HeroMetric({
  label,
  value,
  sub,
  tone = 'paper',
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'volt' | 'paper' | 'mint' | 'amber' | 'rose' | 'copper';
  style?: StyleProp<ViewStyle>;
}) {
  const c =
    tone === 'volt'
      ? colors.volt
      : tone === 'mint'
        ? colors.mintSoft
        : tone === 'amber'
          ? colors.amberSoft
          : tone === 'rose'
            ? colors.roseSoft
            : tone === 'copper'
              ? colors.copperSoft
              : colors.paper;
  return (
    <View style={[{ gap: 4, minWidth: 0 }, style]}>
      <Text variant="overline" color="paperMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 22, lineHeight: 26, letterSpacing: -0.8, color: c }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" color="paperFaint" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Stage tile row — used for fulfilment / escrow pipelines. */
export function StageTile({
  n,
  label,
  value,
  hint,
  active,
  tone = 'volt',
  dark,
  onPress,
}: {
  n?: string | number;
  label: string;
  value: string | number;
  hint?: string;
  active?: boolean;
  tone?: 'volt' | 'amber' | 'copper' | 'mint' | 'rose';
  dark?: boolean;
  onPress?: () => void;
}) {
  const dot = tone === 'amber' ? colors.amber : tone === 'copper' ? colors.copper : tone === 'mint' ? colors.mint : tone === 'rose' ? colors.rose : colors.volt;
  const body = (
    <View
      style={{
        flex: 1,
        minWidth: 132,
        padding: 12,
        borderRadius: radii.xl,
        gap: 6,
        backgroundColor: dark ? 'rgba(250,247,240,0.05)' : active ? colors.pearl : colors.paper,
        borderWidth: 1,
        borderColor: dark ? colors.paperLine : active ? colors.lineStrong : colors.lineSoft,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="overline" color={dark ? 'paperMuted' : 'ink4'} numberOfLines={1} style={{ flex: 1 }}>
          {n !== undefined ? `${n}. ` : ''}
          {label}
        </Text>
        {active ? <Pulse color={dot} size={6} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dark ? colors.paperLine : colors.ink6 }} />}
      </View>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 20, lineHeight: 24, color: dark ? (active ? dot : colors.paper) : colors.ink }}>{String(value)}</Text>
      {hint ? (
        <Text variant="caption" color={dark ? 'paperFaint' : 'ink4'} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Touchable onPress={onPress} hapticOnPress style={{ flex: 1, minWidth: 132 }}>
      {body}
    </Touchable>
  );
}

/** "Live · 30s" indicator. */
export function LivePill({ label = 'Live sync · 30s', dark, fetching }: { label?: string; dark?: boolean; fetching?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        height: 26,
        borderRadius: radii.pill,
        backgroundColor: dark ? 'rgba(250,247,240,0.08)' : colors.mintSoft,
        borderWidth: 1,
        borderColor: dark ? colors.paperLine : 'rgba(61,139,110,0.25)',
      }}
    >
      <Pulse color={dark ? colors.volt : colors.mint} size={5} />
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: dark ? colors.paperMuted : colors.mint }}>{fetching ? 'Syncing…' : label}</Text>
    </View>
  );
}

/** Row of big numbered "how it works" steps. */
export function StepStrip({ steps }: { steps: { title: string; hint: string }[] }) {
  return (
    <View style={{ gap: 8 }}>
      {steps.map((s, i) => (
        <View key={s.title} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: radii.xl, backgroundColor: colors.pearl, borderWidth: 1, borderColor: colors.lineSoft }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.volt }}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodySm" weight="semibold">
              {s.title}
            </Text>
            <Text variant="caption" color="ink4">
              {s.hint}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** "No results for your search" block. */
export function SearchEmpty({ query, onClear, message }: { query: string; onClear: () => void; message?: string }) {
  return (
    <Card kind="bone" padding={24} style={{ alignItems: 'center', gap: 8 }}>
      <SearchX size={28} color={colors.ink4} strokeWidth={1.6} />
      <Text variant="h3" align="center">
        No matches for “{query}”
      </Text>
      <Text variant="caption" color="ink4" align="center">
        {message ?? 'Try another search or switch filters.'}
      </Text>
      <Button title="Clear search" variant="ghost" size="sm" onPress={onClear} style={{ alignSelf: 'center' }} />
    </Card>
  );
}

/* --------------------------------- Badges --------------------------------- */

/** A status badge with an explicit tone map (falls back to neutral). */
export function ToneBadge({ status, map, size }: { status?: string | null; map: Record<string, Tone>; size?: 'sm' | 'md' }) {
  const s = (status ?? 'unknown').toLowerCase();
  return <Badge label={s.replace(/_/g, ' ')} tone={map[s] ?? 'neutral'} dot size={size} />;
}

/** RFQ status pill — same tone buckets as the web's StatusPill. */
export function RfqPill({ status, size }: { status?: string | null; size?: 'sm' | 'md' }) {
  const s = (status ?? 'open').toLowerCase();
  const tone: Tone = ['awarded', 'converted_to_order', 'accepted'].includes(s)
    ? 'success'
    : ['cancelled', 'expired', 'closed', 'rejected', 'withdrawn'].includes(s)
      ? 'neutral'
      : s === 'negotiating'
        ? 'copper'
        : 'warning';
  return <Badge label={s.replace(/_/g, ' ')} tone={tone} dot size={size} />;
}

/** Accounts ledger status pill — the web's accounts/shared StatusPill map. */
const LEDGER_TONE: Record<string, Tone> = {
  pending: 'warning',
  pending_verification: 'warning',
  proof_submitted: 'warning',
  correction_requested: 'warning',
  processing: 'copper',
  authorized: 'copper',
  approved: 'copper',
  confirmed: 'success',
  paid: 'success',
  completed: 'success',
  verified: 'success',
  matched: 'success',
  reconciled: 'success',
  resolved: 'success',
  failed: 'danger',
  rejected: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  chargeback: 'danger',
  refunded: 'copper',
  partially_refunded: 'copper',
  eligible: 'success',
  settled: 'copper',
  held: 'warning',
  ineligible: 'neutral',
  open: 'warning',
  partial: 'warning',
  collected: 'success',
  unreconciled: 'warning',
  requested: 'warning',
  exception: 'danger',
};
export function LedgerPill({ status, size }: { status?: string | null; size?: 'sm' | 'md' }) {
  return <ToneBadge status={status} map={LEDGER_TONE} size={size} />;
}

/* ------------------------------ Header pieces ----------------------------- */

/** Bell with unread count — same query as the web supplier shell. */
export function NotificationsBell({ dark }: { dark?: boolean }) {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ['notifications-me'],
    queryFn: () => api.get<{ unreadCount: number }>('/notifications/me?limit=1'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const unread = q.data?.unreadCount ?? 0;
  return (
    <IconButton
      icon={Bell}
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      variant={dark ? 'glass' : 'surface'}
      badge={unread > 0 ? unread : undefined}
      onPress={() => go('/notifications')}
    />
  );
}

type KycRow = { status: string; reviewNotes?: string | null } | null;

/** Seller KYC status (same endpoint + key as the web's useSellerKyc). */
export function useSellerKyc() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['seller-kyc'],
    queryFn: () => api.get<{ kyc: KycRow }>('/kyc/my'),
    enabled: !!user,
  });
}

/** The web shell's dismissible verification banner. */
export function VerificationBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data } = useSellerKyc();
  const status = data?.kyc?.status ?? null;
  if (dismissed || !status || status === 'approved') return null;
  const rejected = status === 'rejected';
  const message = rejected
    ? 'Facility verification was rejected. Please review submission remarks.'
    : status === 'needs_more_info'
      ? 'Additional compliance documentation is requested for your facility verification.'
      : 'Supplier facility verification is currently pending review.';
  return (
    <Enter>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          padding: 12,
          borderRadius: radii.xl,
          backgroundColor: rejected ? colors.roseSoft : colors.amberSoft,
          borderWidth: 1,
          borderColor: rejected ? 'rgba(196,90,74,0.3)' : 'rgba(196,132,58,0.3)',
        }}
      >
        <AlertTriangle size={17} color={rejected ? colors.rose : colors.amber} strokeWidth={1.9} />
        <Touchable onPress={() => go('/supplier/verification')} style={{ flex: 1, gap: 2 }}>
          <Text variant="bodySm" weight="medium" color="ink2">
            {message}
          </Text>
          <Text variant="caption" weight="semibold" color={rejected ? 'rose' : 'copperDeep'}>
            {rejected ? 'Review and resubmit →' : 'Open verification →'}
          </Text>
        </Touchable>
        <IconButton icon={X} accessibilityLabel="Dismiss verification banner" size={30} onPress={() => setDismissed(true)} />
      </View>
    </Enter>
  );
}

type Gate = { required: boolean; missing: { slug: string; title: string }[] };

/** Training nudge — the web's LearningCta (banner / inline). */
export function LearningCta({ variant = 'banner' }: { variant?: 'banner' | 'inline' }) {
  const { supplierId } = useSupplier();
  const { data } = useQuery({
    queryKey: ['learning', 'gate', supplierId],
    queryFn: () => api.get<Gate>(`/supplier/learning/gate?supplierId=${encodeURIComponent(supplierId)}`),
    enabled: !!supplierId,
  });
  if (!data?.required) return null;
  if (variant === 'inline') {
    return (
      <Touchable onPress={() => go('/supplier/learning')} hapticOnPress style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
        <GraduationCap size={15} color={colors.amber} />
        <Text variant="bodySm" weight="medium" color="ink2" style={{ flex: 1 }}>
          Complete training to publish ({data.missing.length} pending)
        </Text>
        <Text variant="caption" weight="semibold" color="copper">
          Open training →
        </Text>
      </Touchable>
    );
  }
  const total = data.missing.length;
  return (
    <Enter i={1}>
      <Card kind="flat" padding={16} style={{ gap: 14, backgroundColor: colors.amberSoft, borderColor: 'rgba(196,132,58,0.3)' }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(196,132,58,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap size={20} color={colors.amber} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3">Finish training to publish</Text>
            <Text variant="caption" color="copperDeep">
              {plural(total, 'lesson')} pending · required before going live
            </Text>
          </View>
        </View>
        <View style={{ borderRadius: radii.xl, backgroundColor: colors.paper, borderWidth: 1, borderColor: 'rgba(196,132,58,0.2)', overflow: 'hidden' }}>
          {data.missing.slice(0, 3).map((m, i) => (
            <Touchable
              key={m.slug}
              onPress={() => go(`/supplier/learning/${m.slug}`)}
              hapticOnPress
              scaleTo={0.99}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: colors.lineSoft }}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.amber, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 14, color: colors.amber }}>{i + 1}</Text>
              </View>
              <Text variant="bodySm" weight="medium" color="ink2" numberOfLines={1} style={{ flex: 1 }}>
                {m.title}
              </Text>
              <ChevronRight size={16} color={colors.ink5} />
            </Touchable>
          ))}
        </View>
        <Button
          title={total > 3 ? `View all ${total} lessons` : 'Open training'}
          iconRight={ArrowRight}
          full
          onPress={() => go('/supplier/learning')}
        />
      </Card>
    </Enter>
  );
}

/* --------------------------------- Files --------------------------------- */

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}

/**
 * Download an authenticated API file (the session cookie rides on `api.raw`)
 * into the cache and hand it to the OS share sheet.
 */
export async function shareApiFile(path: string, fileName: string, mimeType = 'application/octet-stream') {
  const res = await api.raw(path.replace(/^\/api(?=\/)/, ''));
  const buf = new Uint8Array(await res.arrayBuffer());
  const file = new File(Paths.cache, safeName(fileName));
  if (file.exists) file.delete();
  file.create();
  file.write(buf);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: res.headers.get('content-type') ?? mimeType, dialogTitle: fileName });
}

/** Parse "1,250.50" → cents. Empty → 0. */
export function toCents(v: string): number {
  const n = Number(String(v).replace(/,/g, '').trim() || 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
