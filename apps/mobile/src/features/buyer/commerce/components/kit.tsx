import { Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BadgeCheck, CalendarDays, Megaphone, Plus, ShieldCheck, ShieldHalf, Star, Timer, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatLKR } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { Badge, Text, Touchable, ProductImage, Skeleton } from '@/ui';
import { go, productHref, useProductOffers, useSupplierReviewSummary } from '../data';
import type { SponsoredPlacement, TrustSignalView } from '../types';

/* --------------------------------- money -------------------------------- */

/** Mono price with a quieter unit suffix: `Rs. 4,200.00 / bag`. */
export function Price({
  cents,
  unit,
  size = 'md',
  color = 'ink',
  style,
}: {
  cents: number | null | undefined;
  unit?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'ink' | 'paper' | 'volt';
  style?: StyleProp<TextStyle>;
}) {
  const fs = size === 'sm' ? 13.5 : size === 'md' ? 16.5 : size === 'lg' ? 22 : 30;
  return (
    <Text numberOfLines={1} style={style}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: fs, letterSpacing: size === 'xl' ? -1.2 : -0.5, color: colors[color] }}>
        {cents === null || cents === undefined ? 'Quote only' : formatLKR(cents)}
      </Text>
      {unit && cents !== null && cents !== undefined ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: Math.max(11, fs * 0.62), color: color === 'ink' ? colors.ink4 : colors.paperMuted }}> / {unit}</Text>
      ) : null}
    </Text>
  );
}

/* ------------------------------- flow line ------------------------------ */

export type FlowState = 'done' | 'active' | 'idle';

/** The web's horizontal FlowLine: nodes joined by a supply rail. */
export function FlowSteps({ nodes, dark }: { nodes: { label: string; state: FlowState }[]; dark?: boolean }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {nodes.map((n, i) => {
          const fill = n.state === 'done' ? (dark ? colors.paper : colors.ink) : n.state === 'active' ? colors.volt : 'transparent';
          const border = n.state === 'idle' ? (dark ? colors.paperFaint : colors.ink6) : n.state === 'active' ? (dark ? colors.volt : colors.ink) : fill;
          const next = nodes[i + 1];
          return (
            <Fragment key={`${n.label}-${i}`}>
              <View
                style={{
                  width: n.state === 'active' ? 14 : 10,
                  height: n.state === 'active' ? 14 : 10,
                  borderRadius: 7,
                  backgroundColor: fill,
                  borderWidth: n.state === 'active' ? 3 : 1.5,
                  borderColor: border,
                }}
              />
              {next ? (
                <View
                  style={{
                    flex: 1,
                    height: 1.5,
                    marginHorizontal: 4,
                    backgroundColor: n.state === 'done' ? (dark ? colors.paper : colors.ink) : dark ? colors.paperLine : colors.line,
                  }}
                />
              ) : null}
            </Fragment>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}>
        {nodes.map((n, i) => (
          <Text
            key={`${n.label}-l-${i}`}
            variant="caption"
            numberOfLines={2}
            color={dark ? (n.state === 'idle' ? 'paperFaint' : 'paper') : n.state === 'idle' ? 'ink5' : 'ink'}
            style={{
              flex: 1,
              fontSize: 10.5,
              textAlign: i === 0 ? 'left' : i === nodes.length - 1 ? 'right' : 'center',
              fontFamily: n.state === 'active' ? fonts.sansSemi : fonts.sansMedium,
            }}
          >
            {n.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/* --------------------------------- stars -------------------------------- */

export function Stars({ value, size = 13, gap = 1.5 }: { value: number | null | undefined; size?: number; gap?: number }) {
  const rounded = Math.round(value ?? 0);
  return (
    <View style={{ flexDirection: 'row', gap }} accessibilityLabel={value ? `${value.toFixed(1)} out of 5` : 'No rating'}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} color={i <= rounded ? colors.amber : colors.ink6} fill={i <= rounded ? colors.amber : 'transparent'} strokeWidth={1.6} />
      ))}
    </View>
  );
}

/** reviews/RatingStars.tsx */
export function RatingStars({ avg, count, dark }: { avg: number | null; count: number; dark?: boolean }) {
  if (!count || avg === null || avg === undefined) {
    return (
      <Text variant="caption" color={dark ? 'paperMuted' : 'ink4'}>
        No reviews yet
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Stars value={avg} />
      <Text variant="mono" color={dark ? 'paper' : 'ink'} style={{ fontFamily: fonts.monoMedium }}>
        {avg.toFixed(1)}
      </Text>
      <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'}>
        ({count})
      </Text>
    </View>
  );
}

/** reviews/SupplierStarsLine.tsx — renders nothing until there are reviews. */
export function SupplierStarsLine({ supplierId }: { supplierId: string }) {
  const s = useSupplierReviewSummary(supplierId);
  if (s.isLoading || s.count === 0 || s.avg === null) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Star size={11} color={colors.amber} fill={colors.amber} />
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.ink3 }}>{s.avg.toFixed(1)}</Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink5 }}>({s.count})</Text>
    </View>
  );
}

/* ------------------------------ trust badges ---------------------------- */

export function TrustSealBadge({ active, memberSinceYear }: { active: boolean; memberSinceYear?: number | null }) {
  if (!active) return null;
  return <Badge tone="warning" icon={ShieldCheck} size="sm" label={`TrustSEAL${memberSinceYear ? ` · since ${memberSinceYear}` : ''}`} />;
}

export function MemberSinceBadge({ sinceYear, memberYears }: { sinceYear?: number | null; memberYears?: number | null }) {
  if (sinceYear === null || sinceYear === undefined) return null;
  const suffix = memberYears === null || memberYears === undefined ? '' : memberYears <= 0 ? ' · New' : ` · ${memberYears} yrs`;
  return <Badge tone="neutral" icon={CalendarDays} size="sm" label={`Member since ${sinceYear}${suffix}`} />;
}

/** components/TrustSignalBadges.tsx + the four TrustBadge* pills. */
export function TrustSignalBadges({ view, dark }: { view: TrustSignalView | null | undefined; dark?: boolean }) {
  if (!view) return null;
  const meetsSample = view.onTimeSampleSize >= 5;
  const items: { icon: LucideIcon; label: string; tone: 'success' | 'info' | 'warning' | 'volt' }[] = [];
  if (view.kyc) items.push({ icon: BadgeCheck, label: 'Verified business', tone: 'success' });
  if (view.memberSinceYear) items.push({ icon: CalendarDays, label: `Member since ${view.memberSinceYear}`, tone: 'info' });
  if (view.onTimePct !== null && view.onTimePct !== undefined && meetsSample)
    items.push({ icon: Timer, label: `On-time ${view.onTimePct}% · ${view.onTimeSampleSize} orders`, tone: 'warning' });
  if (view.disputeFree) items.push({ icon: ShieldHalf, label: 'Dispute-free', tone: 'volt' });
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityLabel="Supplier trust signals">
      {items.map((b) => (
        <Badge key={b.label} icon={b.icon} label={b.label} tone={dark ? 'ink' : b.tone} />
      ))}
    </View>
  );
}

/* ------------------------------ image pills ----------------------------- */

/** Small overlay chip for product imagery. */
export function Pill({
  label,
  icon: Icon,
  tone = 'ink',
  style,
}: {
  label: string;
  icon?: LucideIcon;
  tone?: 'ink' | 'paper' | 'volt' | 'mint';
  style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'ink' ? 'rgba(12,14,11,0.86)' : tone === 'paper' ? 'rgba(250,247,240,0.92)' : tone === 'volt' ? colors.volt : 'rgba(12,14,11,0.78)';
  const fg = tone === 'ink' ? colors.paper : tone === 'mint' ? colors.voltGlow : colors.ink;
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: radii.md, backgroundColor: bg, alignSelf: 'flex-start' },
        style,
      ]}
    >
      {tone === 'mint' ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.volt }} /> : null}
      {Icon ? <Icon size={10.5} color={tone === 'ink' || tone === 'mint' ? colors.volt : colors.ink} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.4, color: fg, textTransform: 'uppercase' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Round volt "add" button used on product cards. */
export function AddButton({ onPress, loading, disabled, size = 36 }: { onPress: () => void; loading?: boolean; disabled?: boolean; size?: number }) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel="Add to cart"
      disabled={disabled || loading}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      scaleTo={0.88}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: disabled ? colors.mist : colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading ? <ActivityIndicator size="small" color={colors.volt} /> : <Plus size={size * 0.5} color={disabled ? colors.ink5 : colors.volt} strokeWidth={2.2} />}
    </Touchable>
  );
}

/** Quick quantity presets: MOQ, +10, +25… */
export function QtyPresets({
  moq,
  value,
  onChange,
  steps = [10, 25, 50],
}: {
  moq: number;
  value: number;
  onChange: (v: number) => void;
  steps?: number[];
}) {
  const chip = (label: string, on: boolean, fn: () => void) => (
    <Pressable
      key={label}
      onPress={() => {
        haptic.tap();
        fn();
      }}
      hitSlop={4}
      style={{
        paddingHorizontal: 9,
        height: 26,
        justifyContent: 'center',
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: on ? colors.ink : colors.line,
        backgroundColor: on ? colors.ink : colors.paper,
      }}
    >
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: on ? colors.volt : colors.ink3 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      {chip(`MOQ ${moq}`, value === moq, () => onChange(moq))}
      {steps.map((s) => chip(`+${s}`, false, () => onChange(Math.max(moq, value + s))))}
    </View>
  );
}

/* ------------------------------- sponsored ------------------------------ */

/** components/SponsoredSlot.tsx — paid placements are always labelled. */
export function SponsoredSlot({ campaignId, children }: { campaignId: string | null; children: ReactNode }) {
  if (!campaignId) return <>{children}</>;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Badge tone="warning" icon={Megaphone} size="sm" label="Sponsored" />
        <Text variant="caption" color="copper" onPress={() => go('/sponsored-disclosure')} style={{ textDecorationLine: 'underline' }}>
          Ad disclosure
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Sponsored product tile — hydrates the slot's product from the offers endpoint. */
export function SponsoredProductCard({ slot, width = 220 }: { slot: SponsoredPlacement; width?: number }) {
  const q = useProductOffers(slot.productId ?? undefined);
  const p = q.data?.product;
  return (
    <View style={{ width }}>
      <SponsoredSlot campaignId={slot.campaignId}>
        <Touchable
          hapticOnPress
          onPress={() => slot.productId && go(productHref(slot.productId))}
          style={{ backgroundColor: colors.paper, borderRadius: radii.xl, borderWidth: 1, borderColor: 'rgba(196,132,58,0.35)', overflow: 'hidden' }}
        >
          <ProductImage src={p?.imageUrl ?? p?.images?.[0]?.url} seed={slot.productId ?? slot.slotId} style={{ height: 110 }} />
          <View style={{ padding: 12, gap: 4 }}>
            {q.isLoading ? (
              <>
                <Skeleton width="80%" height={14} />
                <Skeleton width="50%" height={12} />
              </>
            ) : (
              <>
                <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                  {p?.name ?? 'Sponsored product'}
                </Text>
                {q.data?.priceStats?.count ? (
                  <Price cents={q.data.priceStats.min} unit={p?.unit} size="sm" />
                ) : (
                  <Text variant="caption" color="ink4">
                    Slot #{slot.position}
                  </Text>
                )}
              </>
            )}
          </View>
        </Touchable>
      </SponsoredSlot>
    </View>
  );
}
