import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { AlertTriangle, ArrowRight, Bell, ChevronRight, GraduationCap, SearchX, X, type LucideIcon } from 'lucide-react-native';
import { api } from '@/lib/api';
import { useAuth, type OrgRole } from '@/lib/auth';
import { Badge, Button, Card, IconButton, IconTile, PillAction, Pulse, Text, Touchable } from '@/ui';
import { colors, fonts, radii, shadow, type Tone } from '@/theme/tokens';

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
    <Card kind={kind === 'bone' ? 'flat' : kind} padding={padding} style={[{ gap: 16 }, kind === 'bone' ? { backgroundColor: colors.pearl } : null, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {Icon ? <IconTile icon={Icon} tone="ink" size={40} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {kicker ? (
            <Text variant="overline" color="copper" style={{ fontSize: 9.5, letterSpacing: 1.4 }} numberOfLines={1}>
              {kicker}
            </Text>
          ) : null}
          <Text variant="h2" numberOfLines={1} style={{ fontSize: 17.5, lineHeight: 22 }}>
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
          <View style={{ flexShrink: 0 }}>
            <PillAction label={action.label} onPress={action.onPress} />
          </View>
        ) : null}
      </View>
      {children}
    </Card>
  );
}

type TileTone = 'ink' | 'volt' | 'copper' | 'paper' | 'danger' | 'success' | 'warning' | 'glass';

/**
 * Native list item card: IconTile (or custom leading) · title / subtitle /
 * meta · trailing status badge over a mono amount. Optional body and a pearl
 * action footer separated by a hairline.
 */
export function ItemCard({
  icon,
  iconTone = 'ink',
  leading,
  title,
  subtitle,
  meta,
  badge,
  amount,
  amountSub,
  onPress,
  children,
  footer,
  style,
}: {
  icon?: LucideIcon;
  iconTone?: TileTone;
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: ReactNode;
  amount?: string;
  amountSub?: string;
  onPress?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card kind="flat" padding={0} onPress={onPress} style={[{ overflow: 'hidden' }, style]}>
      <View style={{ padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {leading ?? (icon ? <IconTile icon={icon} tone={iconTone} size={44} /> : null)}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" color="ink4" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
            {meta ? (
              <Text variant="caption" color="ink5" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          {badge || amount ? (
            <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0, maxWidth: '45%' }}>
              {badge}
              {amount ? (
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14.5, lineHeight: 18, letterSpacing: -0.4, color: colors.ink }} numberOfLines={1}>
                  {amount}
                </Text>
              ) : null}
              {amountSub ? (
                <Text variant="caption" color="ink5" numberOfLines={1} style={{ fontSize: 10.5 }}>
                  {amountSub}
                </Text>
              ) : null}
            </View>
          ) : onPress ? (
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bone }}>
              <ChevronRight size={15} color={colors.ink4} strokeWidth={2} />
            </View>
          ) : null}
        </View>
        {children}
      </View>
      {footer ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: colors.pearl,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: colors.lineSoft,
          }}
        >
          {footer}
        </View>
      ) : null}
    </Card>
  );
}

/** Small footer link used inside ItemCard footers ("Open order ›"). */
export function FooterLink({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon?: LucideIcon }) {
  return (
    <Touchable onPress={onPress} hapticOnPress hitSlop={8} scaleTo={0.95} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
      {Icon ? <Icon size={13} color={colors.copper} strokeWidth={2} /> : null}
      <Text variant="caption" weight="semibold" color="copper">
        {label}
      </Text>
      <ChevronRight size={13} color={colors.copper} strokeWidth={2} />
    </Touchable>
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
      style={[
        {
          flex: 1,
          minWidth: 132,
          padding: 14,
          borderRadius: radii.xl,
          borderCurve: 'continuous',
          gap: 8,
          overflow: 'hidden',
          backgroundColor: dark ? (active ? 'rgba(250,247,240,0.1)' : 'rgba(250,247,240,0.05)') : active ? colors.paper : colors.pearl,
        },
        dark ? null : active ? shadow.card : shadow.sm,
      ]}
    >
      {active ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 3, borderRadius: 2, backgroundColor: dot }} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {n !== undefined ? (
          <View
            style={{
              minWidth: 20,
              height: 20,
              paddingHorizontal: 5,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? (dark ? dot : colors.ink) : dark ? 'rgba(250,247,240,0.08)' : colors.mist,
            }}
          >
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, lineHeight: 12, color: active ? (dark ? colors.ink : colors.volt) : dark ? colors.paperMuted : colors.ink4 }}>
              {String(n)}
            </Text>
          </View>
        ) : null}
        <Text variant="overline" color={dark ? 'paperMuted' : 'ink4'} numberOfLines={1} style={{ flex: 1, fontSize: 9.5, letterSpacing: 1.2 }}>
          {label}
        </Text>
        {active ? <Pulse color={dot} size={6} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dark ? colors.paperLine : colors.ink6 }} />}
      </View>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 22, lineHeight: 26, letterSpacing: -0.8, color: dark ? (active ? dot : colors.paper) : colors.ink }}>{String(value)}</Text>
      {hint ? (
        <Text variant="caption" color={dark ? 'paperFaint' : 'ink4'} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.96} style={{ flex: 1, minWidth: 132 }}>
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
        backgroundColor: dark ? 'rgba(250,247,240,0.09)' : colors.mintSoft,
      }}
    >
      <Pulse color={dark ? colors.volt : colors.mint} size={5} />
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: dark ? colors.paperMuted : colors.mint }}>{fetching ? 'Syncing…' : label}</Text>
    </View>
  );
}

/** Numbered "how it works" steps joined by a vertical flow line. */
export function StepStrip({ steps }: { steps: { title: string; hint: string }[] }) {
  return (
    <View style={{ borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.pearl, paddingHorizontal: 14, paddingVertical: 4 }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={s.title} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 28, paddingTop: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 10, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, lineHeight: 14, color: colors.volt }}>{i + 1}</Text>
              </View>
              {!last ? <View style={{ flex: 1, width: 1.5, marginTop: 4, backgroundColor: colors.line }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2, paddingVertical: 12 }}>
              <Text variant="bodySm" weight="semibold">
                {s.title}
              </Text>
              <Text variant="caption" color="ink4">
                {s.hint}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** "No results for your search" block. */
export function SearchEmpty({ query, onClear, message }: { query: string; onClear: () => void; message?: string }) {
  return (
    <Card kind="flat" padding={26} style={{ alignItems: 'center', gap: 8 }}>
      <IconTile icon={SearchX} tone="paper" size={52} style={{ marginBottom: 4 }} />
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
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            paddingRight: 8,
            borderRadius: radii.xl,
            borderCurve: 'continuous',
            backgroundColor: colors.paper,
          },
          shadow.card,
        ]}
      >
        <IconTile icon={AlertTriangle} tone={rejected ? 'danger' : 'warning'} size={40} />
        <Touchable onPress={() => go('/supplier/verification')} style={{ flex: 1, gap: 3 }}>
          <Text variant="bodySm" weight="medium" color="ink2">
            {message}
          </Text>
          <Text variant="caption" weight="semibold" color={rejected ? 'rose' : 'copperDeep'}>
            {rejected ? 'Review and resubmit →' : 'Open verification →'}
          </Text>
        </Touchable>
        <IconButton icon={X} accessibilityLabel="Dismiss verification banner" size={32} onPress={() => setDismissed(true)} />
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
      <Touchable
        onPress={() => go('/supplier/learning')}
        hapticOnPress
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.amberSoft }}
      >
        <IconTile icon={GraduationCap} tone="warning" size={30} style={{ backgroundColor: 'rgba(255,253,249,0.6)' }} />
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
      <Card kind="flat" padding={18} style={{ gap: 16, overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, top: -110, right: -60, backgroundColor: colors.amber, opacity: 0.12 }} />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <IconTile icon={GraduationCap} tone="warning" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h2" style={{ fontSize: 17.5, lineHeight: 22 }}>
              Finish training to publish
            </Text>
            <Text variant="caption" color="copperDeep">
              {plural(total, 'lesson')} pending · required before going live
            </Text>
          </View>
        </View>
        <View style={{ borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl, overflow: 'hidden' }}>
          {data.missing.slice(0, 3).map((m, i) => (
            <Touchable
              key={m.slug}
              onPress={() => go(`/supplier/learning/${m.slug}`)}
              hapticOnPress
              scaleTo={0.99}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderTopWidth: i ? StyleSheet.hairlineWidth * 2 : 0,
                borderTopColor: colors.lineSoft,
              }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 9, borderCurve: 'continuous', backgroundColor: colors.amberSoft, alignItems: 'center', justifyContent: 'center' }}>
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
