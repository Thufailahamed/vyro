import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, Extrapolation, interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii, shadow } from '@/theme/tokens';
import { Touchable } from './Button';
import { AnimatedFlowField } from './Brand';
import { useScreenScrollY } from './Screen';

export type SurfaceKind = 'flat' | 'elevated' | 'floating' | 'ink' | 'volt' | 'outline' | 'bone' | 'copper';

/**
 * Card surfaces. Light cards float on the bone canvas with layered shadows and
 * a hairline edge; ink and volt cards carry a subtle material sheen.
 */
const KIND: Record<SurfaceKind, ViewStyle> = {
  flat: { backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(12,14,11,0.06)', ...shadow.card },
  elevated: { backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(12,14,11,0.05)', ...shadow.md },
  floating: { backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(12,14,11,0.06)', ...shadow.lg },
  ink: { backgroundColor: colors.ink, borderWidth: 1, borderColor: 'rgba(250,247,240,0.07)', ...shadow.ink },
  volt: { backgroundColor: colors.volt, ...shadow.volt },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  bone: { backgroundColor: colors.pearl, borderWidth: 1, borderColor: 'rgba(12,14,11,0.05)' },
  copper: { backgroundColor: colors.copperSoft, borderWidth: 1, borderColor: 'rgba(184,122,78,0.22)' },
};

/** Material sheen layered under the content of ink / volt cards. */
function Sheen({ kind }: { kind: SurfaceKind }) {
  if (kind === 'ink') {
    return (
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(250,247,240,0.07)', 'rgba(250,247,240,0)', 'rgba(198,220,74,0.06)']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  if (kind === 'volt') {
    return (
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return null;
}

/** Slowly breathing gradient edge on premium volt cards. */
function GlowBorder({ radius }: { radius: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, reduced]);
  const anim = useAnimatedStyle(() => ({
    borderColor: interpolateColor(t.value, [0, 0.5, 1], ['rgba(184,122,78,0)', 'rgba(184,122,78,0.55)', 'rgba(184,122,78,0)']),
    shadowColor: colors.copper,
    shadowOpacity: t.value * 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, borderCurve: 'continuous', borderWidth: 1.5, borderColor: 'transparent' }, anim]}
    />
  );
}

export interface CardProps {
  kind?: SurfaceKind;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  onPress?: () => void;
  /** Adds the seeded flow-line art. */
  flow?: string;
  radius?: number;
}

/** The app's card: 20px continuous corners, soft depth, tactile press. */
export function Card({ kind = 'flat', children, style, padding = 16, onPress, flow, radius = radii.xl }: CardProps) {
  const clip = kind === 'ink' || kind === 'volt' || !!flow;
  const base: StyleProp<ViewStyle> = [
    { borderRadius: radius, borderCurve: 'continuous', padding, overflow: clip ? 'hidden' : 'visible' },
    KIND[kind],
    style,
  ];
  const inner = (
    <>
      <Sheen kind={kind} />
      {kind === 'volt' ? <GlowBorder radius={radius} /> : null}
      {flow ? <AnimatedFlowField seed={flow} tone={kind === 'ink' ? 'paper' : 'ink'} opacity={kind === 'ink' ? 0.8 : 0.45} /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Touchable onPress={onPress} hapticOnPress scaleTo={0.98} style={base}>
        {inner}
      </Touchable>
    );
  }
  return <View style={base}>{inner}</View>;
}

/**
 * Ink hero: deep material panel with a soft diagonal gradient and animated
 * flow lines — the signature surface at the top of every dashboard.
 */
export function InkHero({ children, seed = 'hero', style }: { children: ReactNode; seed?: string; style?: StyleProp<ViewStyle> }) {
  const scrollY = useScreenScrollY();
  const reduced = useReducedMotion();
  const mesh = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      mesh.value = 0.4;
      return;
    }
    mesh.value = withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [mesh, reduced]);
  const meshStyle = useAnimatedStyle(() => ({ opacity: 0.35 + mesh.value * 0.45 }));
  const parallax = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? 0 : (scrollY?.value ?? 0) * 0.22 }],
    opacity: reduced ? 1 : interpolate(scrollY?.value ?? 0, [0, 160], [1, 0.15], Extrapolation.CLAMP),
  }));
  return (
    <View
      style={[
        {
          backgroundColor: colors.ink,
          borderRadius: radii['2xl'],
          borderCurve: 'continuous',
          overflow: 'hidden',
          padding: 20,
          borderWidth: 1,
          borderColor: 'rgba(250,247,240,0.07)',
        },
        shadow.ink,
        style,
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={['#2C3124', '#1B1E17', colors.ink]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, meshStyle]}>
        <LinearGradient
          colors={['rgba(198,220,74,0.10)', 'rgba(198,220,74,0)', 'rgba(184,122,78,0.12)']}
          locations={[0, 0.55, 1]}
          start={{ x: 1, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, parallax]}>
        <AnimatedFlowField seed={seed} opacity={0.6} />
      </Animated.View>
      {children}
    </View>
  );
}

/** Tinted rounded-square icon holder used by rows, tiles and section heads. */
export function IconTile({
  icon: Icon,
  tone = 'ink',
  size = 40,
  style,
}: {
  icon: LucideIcon;
  tone?: 'ink' | 'volt' | 'copper' | 'paper' | 'danger' | 'success' | 'warning' | 'glass';
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const map = {
    ink: { bg: colors.ink, fg: colors.volt },
    volt: { bg: colors.volt, fg: colors.ink },
    copper: { bg: colors.copperSoft, fg: colors.copperDeep },
    paper: { bg: colors.bone, fg: colors.ink },
    danger: { bg: colors.roseSoft, fg: colors.rose },
    success: { bg: colors.mintSoft, fg: colors.mint },
    warning: { bg: colors.amberSoft, fg: colors.amber },
    glass: { bg: 'rgba(250,247,240,0.09)', fg: colors.volt },
  }[tone];
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          borderCurve: 'continuous',
          backgroundColor: map.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon size={size * 0.45} color={map.fg} strokeWidth={1.8} />
    </View>
  );
}

export function Divider({ style, inset = 0, color = colors.lineSoft }: { style?: StyleProp<ViewStyle>; inset?: number; color?: string }) {
  return <View style={[{ height: StyleSheet.hairlineWidth * 2, backgroundColor: color, marginLeft: inset }, style]} />;
}

export function Row({
  children,
  gap = 8,
  align = 'center',
  justify = 'flex-start',
  wrap,
  style,
}: {
  children?: ReactNode;
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: align, justifyContent: justify, gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>
      {children}
    </View>
  );
}

export function VStack({ children, gap = 12, style }: { children?: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Spacer({ size = 16, flex }: { size?: number; flex?: boolean }) {
  return <View style={flex ? { flex: 1 } : { height: size, width: size }} />;
}
