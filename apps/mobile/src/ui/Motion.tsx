import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fonts } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const defaultFmt = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Numeric text that tweens toward `value` — used for hero metrics, stat cards
 * and KPI numbers. Pass `format` for LKR/percent strings.
 *
 * NOTE: `format` runs on the JS thread via runOnJS — the Reanimated UI runtime
 * has no Intl/toLocaleString, so formatting inside the worklet would crash.
 */
export function CountUp({
  value,
  format = defaultFmt,
  duration = 850,
  delay = 0,
  style,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const sv = useSharedValue(0);
  const fmtRef = useRef(format);
  const [text, setText] = useState(() => format(value));
  useEffect(() => {
    fmtRef.current = format;
  }, [format]);
  useEffect(() => {
    sv.value = withDelay(delay, withTiming(value, { duration, easing: Easing.out(Easing.cubic) }));
  }, [value, duration, delay, sv]);
  const update = useCallback((v: number) => setText(fmtRef.current(v)), []);
  useAnimatedReaction(
    () => sv.value,
    (v) => runOnJS(update)(v),
  );
  return (
    <Text
      numberOfLines={1}
      style={[{ fontFamily: fonts.monoMedium, color: colors.ink, fontVariant: ['tabular-nums'] }, style]}
    >
      {text}
    </Text>
  );
}

/**
 * Draw-on success check: mint circle sweeps in, the tick draws, and the whole
 * glyph pops with a spring + success haptic. Drop into result/empty states.
 */
export function SuccessCheck({ size = 56, silent, style }: { size?: number; silent?: boolean; style?: StyleProp<ViewStyle> }) {
  const draw = useSharedValue(0);
  const pop = useSharedValue(0.55);
  useEffect(() => {
    if (!silent) haptic.success();
    draw.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });
    pop.value = withSpring(1, { damping: 12, stiffness: 280, mass: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot celebration on mount
  }, []);
  const r = size / 2 - 4;
  const C = 2 * Math.PI * r;
  const circ = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - draw.value) }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: size * (1 - draw.value) }));
  const wrap = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, wrap, style]}>
      <Svg width={size} height={size}>
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.mint}
          strokeWidth={3}
          fill={colors.mintSoft}
          strokeDasharray={`${C} ${C}`}
          strokeLinecap="round"
          animatedProps={circ}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <AnimatedPath
          d={`M ${size * 0.28} ${size * 0.53} L ${size * 0.45} ${size * 0.68} L ${size * 0.74} ${size * 0.35}`}
          stroke={colors.mint}
          strokeWidth={size * 0.065}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${size} ${size}`}
          animatedProps={tick}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Compact circular progress ring — full-circle sibling of the 270°
 * `UtilisationArc` gauge. Sweeps in on mount and tweens on change.
 */
export function ProgressRing({
  value,
  size = 64,
  thickness = 6,
  color = colors.volt,
  track = 'rgba(250,247,240,0.14)',
  label,
  dark = true,
  style,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  track?: string;
  /** Centre text; defaults to the rounded percentage. */
  label?: string;
  /** Dark = paper text on ink surfaces. */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const cx = size / 2;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(pct, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pct, progress]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - progress.value) }));
  return (
    <Animated.View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cx} r={r} stroke={track} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={cx}
          cy={cx}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${C} ${C}`}
          strokeLinecap="round"
          animatedProps={arc}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text variant="mono" color={dark ? 'paper' : 'ink'} style={{ fontSize: size * 0.22, fontFamily: fonts.monoMedium }}>
          {label ?? `${Math.round(pct * 100)}%`}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

/* --------------------------- interaction effects -------------------------- */

/**
 * Horizontal wobble for validation feedback. Bump `signal` (e.g. a counter or
 * the error string) to retrigger; pair with an error haptic at the call site.
 */
export function Shake({ signal, children, style }: { signal: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (!signal) return;
    x.value = withSequence(
      withTiming(-9, { duration: 55 }),
      withTiming(8, { duration: 65 }),
      withTiming(-6, { duration: 65 }),
      withTiming(4, { duration: 65 }),
      withSpring(0, { damping: 14, stiffness: 400 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- retrigger on signal change only
  }, [signal]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
}

/** Endless horizontal ticker — announcements, flash deals, status strips. */
export function Marquee({
  children,
  speed = 40,
  gap = 48,
  style,
}: {
  children: ReactNode;
  /** Points per second. */
  speed?: number;
  /** Gap between repeated copies. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const [contentW, setContentW] = useState(0);
  const x = useSharedValue(0);
  const span = contentW + gap;
  useEffect(() => {
    if (reduced || !span) return;
    x.value = 0;
    x.value = withRepeat(withTiming(-span, { duration: (span / speed) * 1000, easing: Easing.linear }), -1, false);
  }, [span, speed, reduced, x]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Animated.View style={[{ flexDirection: 'row' }, anim]}>
        <View
          onLayout={(e) => setContentW(Math.round(e.nativeEvent.layout.width))}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          {children}
        </View>
        <View style={{ width: gap }} />
        {contentW ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>{children}</View> : null}
      </Animated.View>
    </View>
  );
}

const CONFETTI_COLORS = [colors.volt, colors.copper, colors.mint, colors.amber, colors.rose, colors.paper];

/**
 * One-shot particle burst — drops into celebration moments (order placed,
 * verification passed, all bulk actions succeeded). Cheap SVG + worklets.
 */
export function ConfettiBurst({ count = 16, size = 90, style }: { count?: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      t.value = 1;
      return;
    }
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount
  }, []);
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + (i % 3) * 0.22,
        dist: size * (0.45 + ((i * 37) % 50) / 100),
        r: 2.2 + ((i * 13) % 3),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [count, size],
  );
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }, style]}>
      {bits.map((b, i) => (
        <ConfettiBit key={i} t={t} angle={b.angle} dist={b.dist} r={b.r} color={b.color} />
      ))}
    </View>
  );
}

function ConfettiBit({ t, angle, dist, r, color }: { t: SharedValue<number>; angle: number; dist: number; r: number; color: string }) {
  const anim = useAnimatedStyle(() => {
    const ease = t.value;
    return {
      transform: [
        { translateX: Math.cos(angle) * dist * ease },
        { translateY: Math.sin(angle) * dist * ease + ease * ease * 26 },
        { rotate: `${angle * ease * 3}rad` },
        { scale: 1 - ease * 0.55 },
      ],
      opacity: 1 - ease * ease,
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: r * 2, height: r * 2.6, borderRadius: r * 0.6, backgroundColor: color }, anim]} />;
}

/** Typewriter reveal for streamed-feeling text (AI replies, announcements). */
export function Typewriter({
  text,
  speed = 24,
  variant,
  color,
  style,
  onDone,
}: {
  text: string;
  /** Characters per second. */
  speed?: number;
  variant?: ComponentProps<typeof Text>['variant'];
  color?: ComponentProps<typeof Text>['color'];
  style?: StyleProp<TextStyle>;
  onDone?: () => void;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) return;
    // Keep pace with streaming text — never reset, just catch up to `text.length`.
    const id = setInterval(() => {
      setShown((s) => (s >= text.length ? s : s + 2));
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [text, speed, reduced]);
  const done = reduced || shown >= text.length;
  useEffect(() => {
    if (done && text.length) onDone?.();
  }, [done, text.length, onDone]);
  return (
    <Text variant={variant} color={color} style={style}>
      {reduced ? text : text.slice(0, shown)}
    </Text>
  );
}
