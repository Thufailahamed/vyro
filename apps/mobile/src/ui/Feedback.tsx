import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react-native';
import { colors, radii, shadow, tones, type Tone } from '@/theme/tokens';
import { humanize } from '@/lib/format';
import { toneForStatus } from '@/lib/status';
import { Text } from './Text';
import { Button } from './Button';
import { FlowField } from './Brand';

export function Badge({
  label,
  tone = 'neutral',
  dot,
  icon: Icon,
  size = 'md',
  style,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
  icon?: LucideIcon;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 5,
          backgroundColor: t.bg,
          borderRadius: radii.pill,
          paddingHorizontal: size === 'sm' ? 7 : 9,
          paddingVertical: size === 'sm' ? 2 : 3.5,
          borderWidth: 1,
          borderColor: t.border,
        },
        style,
      ]}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.dot }} /> : null}
      {Icon ? <Icon size={size === 'sm' ? 11 : 12} color={t.fg} strokeWidth={2} /> : null}
      <Text
        style={{
          fontFamily: 'IBMPlexSans_600SemiBold',
          fontSize: size === 'sm' ? 10.5 : 11.5,
          lineHeight: size === 'sm' ? 14 : 16,
          letterSpacing: 0.2,
          color: t.fg,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** Badge whose tone and label come straight from an API status string. */
export function StatusBadge({ status, size, label }: { status?: string | null; size?: 'sm' | 'md'; label?: string }) {
  return <Badge label={label ?? humanize(status)} tone={toneForStatus(status)} dot size={size} />;
}

const BANNER_ICON: Record<'info' | 'success' | 'warning' | 'danger', LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function Banner({
  tone = 'info',
  title,
  message,
  action,
  style,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  const Icon = BANNER_ICON[tone];
  return (
    <View
      style={[
        { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radii.lg + 2, borderCurve: 'continuous', backgroundColor: t.bg, borderWidth: 1, borderColor: t.border },
        style,
      ]}
    >
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={t.dot} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <Text variant="bodySm" weight="semibold" style={{ color: t.fg }}>
            {title}
          </Text>
        ) : null}
        {message ? (
          <Text variant="bodySm" style={{ color: t.fg }}>
            {message}
          </Text>
        ) : null}
        {action ? (
          <Text variant="bodySm" weight="semibold" color="ink" onPress={action.onPress} style={{ marginTop: 6, textDecorationLine: 'underline' }}>
            {action.label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  seed = 'empty',
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
  seed?: string;
  compact?: boolean;
}) {
  return (
    <View
      style={[
        {
          alignItems: 'center',
          paddingVertical: compact ? 30 : 48,
          paddingHorizontal: 24,
          borderRadius: radii['2xl'],
          borderCurve: 'continuous',
          backgroundColor: colors.paper,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(12,14,11,0.06)',
          overflow: 'hidden',
        },
        shadow.card,
      ]}
    >
      <FlowField seed={seed} tone="ink" opacity={0.3} />
      {Icon ? (
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(198,220,74,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
          <View style={[{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, shadow.ink]}>
            <Icon size={25} color={colors.volt} strokeWidth={1.6} />
          </View>
        </View>
      ) : null}
      <Text variant="h2" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="bodySm" color="ink4" align="center" style={{ marginTop: 6, maxWidth: 280 }}>
          {message}
        </Text>
      ) : null}
      {action ? <Button title={action.label} onPress={action.onPress} style={{ marginTop: 20, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.roseSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
        <AlertTriangle size={26} color={colors.rose} strokeWidth={1.8} />
      </View>
      <Text variant="h3" align="center">
        Couldn't load this
      </Text>
      <Text variant="bodySm" color="ink4" align="center" style={{ maxWidth: 300 }}>
        {message ?? 'Please check your connection and try again.'}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" size="sm" onPress={onRetry} style={{ alignSelf: 'center', marginTop: 6 }} /> : null}
    </View>
  );
}

/** Shimmering placeholder block. */
export function Skeleton({ width = '100%', height = 16, radius = radii.md, style }: { width?: ViewStyle['width']; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(0.5);
  useEffect(() => {
    o.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.mist }, anim, style]} />;
}

/** A stack of skeleton cards used as the default list loading state. */
export function SkeletonList({ rows = 5, height = 76 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} radius={radii.xl} />
      ))}
    </View>
  );
}

export function Loader({ label, dark }: { label?: string; dark?: boolean }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
      <ActivityIndicator color={dark ? colors.volt : colors.ink} />
      {label ? (
        <Text variant="bodySm" color={dark ? 'paperMuted' : 'ink4'}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'volt',
  height = 6,
  track = colors.mist,
  style,
}: {
  value: number;
  max?: number;
  tone?: 'volt' | 'ink' | 'copper' | 'danger' | 'success' | 'warning';
  height?: number;
  track?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const fill =
    tone === 'ink'
      ? colors.ink
      : tone === 'copper'
        ? colors.copper
        : tone === 'danger'
          ? colors.rose
          : tone === 'success'
            ? colors.mint
            : tone === 'warning'
              ? colors.amber
              : colors.volt;
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [pct, w]);
  const anim = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }, style]}>
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: fill }, anim]} />
    </View>
  );
}

export function Pulse({ color = colors.volt, size = 8 }: { color?: string; size?: number }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withTiming(1.8, { duration: 1200 }), -1, false);
  }, [s]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 2 - s.value }));
  return (
    <View style={{ width: size * 2, height: size * 2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color }, ring]} />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <Text variant="caption" color="ink4">
      {children}
    </Text>
  );
}
