import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radii, shadow } from '@/theme/tokens';
import { Touchable } from './Button';
import { FlowField } from './Brand';

export type SurfaceKind = 'flat' | 'elevated' | 'floating' | 'ink' | 'volt' | 'outline' | 'bone' | 'copper';

const KIND: Record<SurfaceKind, ViewStyle> = {
  flat: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineSoft },
  elevated: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineSoft, ...shadow.md },
  floating: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, ...shadow.lg },
  ink: { backgroundColor: colors.ink },
  volt: { backgroundColor: colors.volt },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  bone: { backgroundColor: colors.pearl, borderWidth: 1, borderColor: colors.lineSoft },
  copper: { backgroundColor: colors.copperSoft, borderWidth: 1, borderColor: 'rgba(184,122,78,0.25)' },
};

export interface CardProps {
  kind?: SurfaceKind;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  onPress?: () => void;
  /** Adds the seeded flow-line art (ink cards only). */
  flow?: string;
  radius?: number;
}

/** The web's Surface: flat / elevated / floating / ink panels, 12px radius. */
export function Card({ kind = 'flat', children, style, padding = 16, onPress, flow, radius = radii.xl }: CardProps) {
  const base: StyleProp<ViewStyle> = [{ borderRadius: radius, padding, overflow: kind === 'ink' || flow ? 'hidden' : 'visible' }, KIND[kind], style];
  const inner = (
    <>
      {flow ? <FlowField seed={flow} tone={kind === 'ink' ? 'paper' : 'ink'} opacity={kind === 'ink' ? 0.9 : 0.5} /> : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <Touchable onPress={onPress} hapticOnPress style={base}>
        {inner}
      </Touchable>
    );
  }
  return <View style={base}>{inner}</View>;
}

/** Full-bleed ink hero with grain-like gradient and flow art. */
export function InkHero({ children, seed = 'hero', style }: { children: ReactNode; seed?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: colors.ink, borderRadius: radii['2xl'], overflow: 'hidden', padding: 20 }, style]}>
      <LinearGradient
        colors={['rgba(198,220,74,0.10)', 'rgba(12,14,11,0)', 'rgba(184,122,78,0.14)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      <FlowField seed={seed} />
      {children}
    </View>
  );
}

export function Divider({ style, inset = 0, color = colors.lineSoft }: { style?: StyleProp<ViewStyle>; inset?: number; color?: string }) {
  return <View style={[{ height: 1, backgroundColor: color, marginLeft: inset }, style]} />;
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
