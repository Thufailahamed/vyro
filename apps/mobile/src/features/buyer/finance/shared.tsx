import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Card, Text } from '@/ui';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatLKR } from '@/lib/format';

/** Typed-routes escape hatch for paths built at runtime. */
export function go(path: string) {
  router.push(path as Href);
}

/* ------------------------------ Payment methods ----------------------------- */

type MethodTone = 'volt' | 'copper' | 'mint' | 'amber' | 'ink';

const METHOD_META: Record<string, { label: string; tone: MethodTone }> = {
  online: { label: 'PayHere Online', tone: 'volt' },
  payhere: { label: 'PayHere Online', tone: 'volt' },
  card: { label: 'Card', tone: 'volt' },
  bank_transfer: { label: 'Bank Transfer', tone: 'copper' },
  bank: { label: 'Bank Transfer', tone: 'copper' },
  wire: { label: 'Bank Wire', tone: 'copper' },
  cash: { label: 'Cash on Delivery', tone: 'mint' },
  cod: { label: 'Cash on Delivery', tone: 'mint' },
  escrow: { label: 'Escrow', tone: 'amber' },
  credit: { label: 'VYRO Credit', tone: 'ink' },
};

export function methodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  return METHOD_META[method.toLowerCase()]?.label ?? method.replace(/_/g, ' ');
}

export function methodColor(method: string | null | undefined): string {
  const tone = METHOD_META[(method ?? '').toLowerCase()]?.tone ?? 'ink';
  return tone === 'volt'
    ? colors.voltDeep
    : tone === 'copper'
      ? colors.copper
      : tone === 'mint'
        ? colors.mint
        : tone === 'amber'
          ? colors.amber
          : colors.ink4;
}

/** Chart colour for a method (brighter volt so it reads on a donut). */
export function methodChartColor(method: string): string {
  const tone = METHOD_META[method.toLowerCase()]?.tone ?? 'ink';
  return tone === 'volt' ? colors.volt : methodColor(method);
}

export function MethodDot({ method, label = true }: { method: string; label?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: methodColor(method) }} />
      {label ? (
        <Text variant="caption" color="ink3" numberOfLines={1}>
          {methodLabel(method)}
        </Text>
      ) : null}
    </View>
  );
}

/* --------------------------------- Credit ---------------------------------- */

export const CREDIT_STARTING_LIMIT_CENTS = 10_000_000;

export function termsLabel(terms: string): string {
  if (terms === 'net14') return 'Net 14';
  if (terms === 'net30') return 'Net 30';
  return terms;
}

export function drawdownStatusLabel(status: string): string {
  if (status === 'active') return 'Open';
  if (status === 'overdue') return 'Overdue';
  if (status === 'repaid') return 'Repaid';
  return status;
}

export function unlockSlotState(index: number, paidOrderCount: number): 'done' | 'current' | 'todo' {
  if (index < paidOrderCount) return 'done';
  if (index === paidOrderCount) return 'current';
  return 'todo';
}

export function remainingCents(amountCents: number, repaidCents: number): number {
  return Math.max(0, amountCents - repaidCents);
}

/* --------------------------------- Pieces ---------------------------------- */

export type Accent = 'mint' | 'amber' | 'rose' | 'volt' | 'copper' | 'ink';

const ACCENT_FG: Record<Accent, string> = {
  volt: colors.voltDeep,
  mint: colors.mint,
  amber: colors.amber,
  rose: colors.rose,
  copper: colors.copperDeep,
  ink: colors.ink,
};
const ACCENT_BG: Record<Accent, string> = {
  volt: colors.voltSoft,
  mint: colors.mintSoft,
  amber: colors.amberSoft,
  rose: colors.roseSoft,
  copper: colors.copperSoft,
  ink: colors.mist,
};

/** The web's KpiTile: overline, tinted icon chip, mono figure coloured by accent. */
export function KpiTile({
  label,
  cents,
  value,
  sub,
  accent,
  icon: Icon,
  style,
}: {
  label: string;
  cents?: number;
  value?: number | string;
  sub: string;
  accent: Accent;
  icon: LucideIcon;
  style?: StyleProp<ViewStyle>;
}) {
  const display = value !== undefined ? String(value) : formatLKR(cents ?? 0);
  return (
    <Card padding={14} style={[{ flexBasis: '47%', flexGrow: 1, gap: 8 }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Text variant="overline" color="ink4" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: ACCENT_BG[accent], alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={14} color={ACCENT_FG[accent]} strokeWidth={1.9} />
        </View>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: fonts.monoMedium, fontSize: 19, lineHeight: 24, letterSpacing: -0.6, color: ACCENT_FG[accent] }}>
        {display}
      </Text>
      <Text variant="caption" color="ink4" numberOfLines={1}>
        {sub}
      </Text>
    </Card>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

/** Paper panel with an icon-chip header — the web's Surface section header. */
export function Panel({
  title,
  subtitle,
  icon: Icon,
  iconTone = 'ink',
  right,
  children,
  padding = 16,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconTone?: 'ink' | 'copper';
  right?: ReactNode;
  children: ReactNode;
  padding?: number;
}) {
  return (
    <Card padding={0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.lineSoft }}>
        {Icon ? (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: radii.lg,
              backgroundColor: iconTone === 'ink' ? colors.ink : colors.copperSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={15} color={iconTone === 'ink' ? colors.volt : colors.copperDeep} strokeWidth={1.8} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text variant="h3">{title}</Text>
          {subtitle ? (
            <Text variant="caption" color="ink4">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      <View style={{ padding }}>{children}</View>
    </Card>
  );
}

/** Mono money with an optional sign/colour. */
export function MoneyText({
  cents,
  sign,
  size = 14,
  color = 'ink',
}: {
  cents: number | null | undefined;
  sign?: '+' | '−';
  size?: number;
  color?: 'ink' | 'mint' | 'rose' | 'paper' | 'volt' | 'ink3';
}) {
  if (cents === null || cents === undefined) {
    return (
      <Text variant="mono" color="ink4">
        —
      </Text>
    );
  }
  return (
    <Text style={{ fontFamily: fonts.monoMedium, fontSize: size, lineHeight: size + 5, letterSpacing: -0.3, color: colors[color] }}>
      {sign ?? ''}
      {formatLKR(cents)}
    </Text>
  );
}

/** Month-bucketed series from timestamped rows, oldest → newest. */
export function monthlySeries<T>(rows: T[], ts: (r: T) => number, value: (r: T) => number, months = 6) {
  const now = new Date();
  const buckets: { key: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString('en-GB', { month: 'short' }), value: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of rows) {
    const d = new Date(ts(r));
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i !== undefined) buckets[i].value += value(r);
  }
  return buckets.map(({ label, value: v }) => ({ label, value: v }));
}
