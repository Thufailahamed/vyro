/**
 * Shared building blocks for the admin Money / Platform / Content screens.
 * Generic pieces only — screen logic lives next to each screen.
 */
import { useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import { usePermission } from '@/features/admin/common/permissions';
import { Button, Card, ConfirmSheet, EmptyState, Field, Input, Kicker, Skeleton, Text, type ButtonVariant } from '@/ui';

/** Navigate to any route (typed routes can't see routes other agents are still creating). */
export function go(href: string) {
  router.push(href as never);
}

/** Staggered entrance used for every list/card block. */
export function Appear({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(i, 12) * 55).duration(420)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Renders children only when the operator's role grants `perm` (any of, when an array). */
export function Can({ perm, children, fallback = null }: { perm: string | string[]; children: ReactNode; fallback?: ReactNode }) {
  const list = Array.isArray(perm) ? perm : [perm];
  // Hooks must run unconditionally and in a stable order.
  const a = usePermission(list[0] ?? '');
  const b = usePermission(list[1] ?? '');
  const c = usePermission(list[2] ?? '');
  const d = usePermission(list[3] ?? '');
  const ok = [a, b, c, d].slice(0, list.length).some(Boolean);
  return <>{ok ? children : fallback}</>;
}

export type FlowTone = 'in' | 'out' | 'neutral' | 'warn';

/** Mono money figure with in/out tone. */
export function MoneyText({
  cents,
  tone = 'neutral',
  size = 'md',
  compact,
  dark,
  signed,
  style,
}: {
  cents: number | null | undefined;
  tone?: FlowTone;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  compact?: boolean;
  dark?: boolean;
  signed?: boolean;
  style?: StyleProp<import('react-native').TextStyle>;
}) {
  const fontSize = size === 'sm' ? 13 : size === 'md' ? 15 : size === 'lg' ? 22 : 32;
  const color =
    tone === 'in' ? colors.mint : tone === 'out' ? colors.rose : tone === 'warn' ? colors.amber : dark ? colors.paper : colors.ink;
  const v = cents ?? 0;
  const body = compact ? formatCompactLKR(Math.abs(v)) : formatLKR(Math.abs(v));
  const sign = signed ? (tone === 'out' || v < 0 ? '− ' : tone === 'in' ? '+ ' : '') : v < 0 ? '− ' : '';
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[{ fontFamily: fonts.monoMedium, fontSize, lineHeight: fontSize * 1.2, letterSpacing: size === 'xl' ? -1.2 : -0.3, color }, style]}
    >
      {sign}
      {body}
    </Text>
  );
}

/** KPI cell inside an ink hero (label / mono value / hint). */
export function HeroMetric({ label, value, hint, accent, style }: { label: string; value: string; hint?: string; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexBasis: '46%', flexGrow: 1, gap: 4 }, style]}>
      <Text variant="overline" color="paperMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="metricSm" color={accent ? 'volt' : 'paper'} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" color="paperFaint" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function HeroGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 14, marginTop: 18 }}>{children}</View>;
}

/**
 * Confirmation sheet with an optional (or required) free-text reason.
 * `onConfirm` receives the trimmed reason.
 */
export function ReasonSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'primary',
  loading,
  reasonLabel = 'Reason',
  placeholder = 'Why are you doing this? This is written to the audit log.',
  requireReason = true,
  minLength = 3,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  reasonLabel?: string;
  placeholder?: string;
  requireReason?: boolean;
  minLength?: number;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const close = () => {
    setReason('');
    setErr(null);
    onClose();
  };
  return (
    <ConfirmSheet
      visible={visible}
      onClose={close}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      variant={variant}
      loading={loading}
      onConfirm={() => {
        const r = reason.trim();
        if (requireReason && r.length < minLength) {
          setErr(`Add a reason (at least ${minLength} characters).`);
          return;
        }
        setErr(null);
        onConfirm(r);
        setReason('');
      }}
    >
      <View style={{ gap: 14 }}>
        {children}
        <Field label={reasonLabel} required={requireReason} error={err}>
          <Input value={reason} onChangeText={setReason} placeholder={placeholder} multiline />
        </Field>
      </View>
    </ConfirmSheet>
  );
}

/** Skeleton for a dashboard: hero block + tiles. */
export function DashboardSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <View style={{ gap: 12 }}>
      <Skeleton height={190} radius={radii['2xl']} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {Array.from({ length: tiles }).map((_, i) => (
          <Skeleton key={i} height={92} radius={radii.xl} style={{ flexBasis: '47%', flexGrow: 1 }} />
        ))}
      </View>
      <Skeleton height={140} radius={radii.xl} />
    </View>
  );
}

/** Small uppercase label + content block inside a card. */
export function Block({ kicker, title, right, children, style }: { kicker?: string; title?: string; right?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Card kind="flat" padding={18} style={[{ gap: 14 }, style]}>
      {kicker || title || right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
          <View style={{ flex: 1, gap: 3 }}>
            {kicker ? <Kicker>{kicker}</Kicker> : null}
            {title ? (
              <Text variant="h2" numberOfLines={2}>
                {title}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/** Compact empty state for inside cards/sections. */
export function InlineEmpty({ title, message, icon }: { title: string; message?: string; icon?: LucideIcon }) {
  return <EmptyState compact title={title} message={message} icon={icon} />;
}

/** Monospace block for JSON payloads / metadata / raw ids. */
export function CodeBlock({ value, maxLines = 18 }: { value: unknown; maxLines?: number }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <View style={{ backgroundColor: colors.ink, borderRadius: radii.lg, borderCurve: 'continuous', padding: 14 }}>
      <Text numberOfLines={maxLines} style={{ fontFamily: fonts.mono, fontSize: 11.5, lineHeight: 16, color: colors.paper }}>
        {text ?? '—'}
      </Text>
    </View>
  );
}

/** "Load more" footer for cursor-paginated lists. */
export function LoadMore({ hasMore, loading, onPress }: { hasMore?: boolean; loading?: boolean; onPress: () => void }) {
  if (!hasMore) return null;
  return <Button title="Load more" variant="secondary" loading={loading} onPress={onPress} style={{ marginTop: 6, alignSelf: 'center', minWidth: 180 }} />;
}

/** Thin coloured left rule used to tag a card as money in / out / alert. */
export function ToneRule({ tone }: { tone: FlowTone | 'volt' }) {
  const bg = tone === 'in' ? colors.mint : tone === 'out' ? colors.rose : tone === 'warn' ? colors.amber : tone === 'volt' ? colors.volt : colors.ink6;
  return <View style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: bg }} />;
}

/** Parse a rupee string typed by an operator into integer cents. */
export function rupeesToCents(input: string): number | null {
  const n = Number(String(input).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}
