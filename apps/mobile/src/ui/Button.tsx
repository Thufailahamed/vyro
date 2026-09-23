import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii, shadow } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gently compresses on touch — the tactile base for cards and rows. */
export function Touchable({
  children,
  style,
  scaleTo = 0.975,
  hapticOnPress = false,
  onPress,
  disabled,
  ...rest
}: PressableProps & { style?: StyleProp<ViewStyle>; scaleTo?: number; hapticOnPress?: boolean; children?: ReactNode }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write is the correct idiom
        s.value = withSpring(scaleTo, { damping: 18, stiffness: 420 });
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write is the correct idiom
        s.value = withSpring(1, { damping: 14, stiffness: 320 });
        rest.onPressOut?.(e);
      }}
      onPress={(e) => {
        if (hapticOnPress) haptic.tap();
        onPress?.(e);
      }}
      style={[anim, style]}
    >
      {children}
    </AnimatedPressable>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'volt' | 'paper' | 'danger' | 'copper' | 'ghostPaper' | 'outlinePaper';
export type ButtonSize = 'sm' | 'md' | 'lg';

const V: Record<ButtonVariant, { bg: string; fg: string; border?: string; spinner: string }> = {
  primary: { bg: colors.ink, fg: colors.paper, spinner: colors.volt },
  secondary: { bg: 'transparent', fg: colors.ink, border: colors.lineStrong, spinner: colors.ink },
  ghost: { bg: 'transparent', fg: colors.ink, spinner: colors.ink },
  volt: { bg: colors.volt, fg: colors.ink, spinner: colors.ink },
  paper: { bg: colors.paper, fg: colors.ink, spinner: colors.ink },
  danger: { bg: colors.rose, fg: colors.paper, spinner: colors.paper },
  copper: { bg: colors.copper, fg: colors.paper, spinner: colors.paper },
  ghostPaper: { bg: 'transparent', fg: colors.paper, spinner: colors.paper },
  outlinePaper: { bg: 'transparent', fg: colors.paper, border: 'rgba(250,247,240,0.28)', spinner: colors.paper },
};

const S: Record<ButtonSize, { h: number; px: number; font: number; icon: number }> = {
  sm: { h: 36, px: 14, font: 13.5, icon: 15 },
  md: { h: 48, px: 18, font: 15, icon: 17 },
  lg: { h: 56, px: 22, font: 16.5, icon: 19 },
};

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * Primary buttons carry the web's signature: a volt underline that sweeps
 * across the bottom edge while pressed.
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  full,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const v = V[variant];
  const sz = S[size];
  const sweep = useSharedValue(0.18);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: sweep.value }] }));
  const isDisabled = disabled || loading;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        haptic.light();
        onPress?.();
      }}
      onPressIn={() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write is the correct idiom
        sweep.value = withTiming(1, { duration: 240 });
      }}
      onPressOut={() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value write is the correct idiom
        sweep.value = withTiming(0.18, { duration: 320 });
      }}
      style={[
        {
          height: sz.h,
          paddingHorizontal: sz.px,
          backgroundColor: v.bg,
          borderRadius: radii.lg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          overflow: 'hidden',
          opacity: isDisabled && !loading ? 0.45 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        variant === 'volt' ? shadow.volt : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} size="small" />
      ) : (
        <>
          {Icon ? <Icon size={sz.icon} color={v.fg} strokeWidth={1.8} /> : null}
          <Text style={{ fontFamily: 'Syne_700Bold', fontSize: sz.font, letterSpacing: -0.3, color: v.fg }} numberOfLines={1}>
            {title}
          </Text>
          {IconRight ? <IconRight size={sz.icon} color={v.fg} strokeWidth={1.8} /> : null}
        </>
      )}
      {variant === 'primary' ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: colors.volt, transformOrigin: 'left' },
            sweepStyle,
          ]}
        />
      ) : null}
    </Touchable>
  );
}

export function IconButton({
  icon: Icon,
  onPress,
  variant = 'ghost',
  size = 40,
  color,
  badge,
  accessibilityLabel,
  style,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  variant?: 'ghost' | 'surface' | 'ink' | 'volt' | 'glass';
  size?: number;
  color?: string;
  badge?: number | boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === 'surface'
      ? colors.paper
      : variant === 'ink'
        ? colors.ink
        : variant === 'volt'
          ? colors.volt
          : variant === 'glass'
            ? 'rgba(250,247,240,0.14)'
            : 'transparent';
  const fg = color ?? (variant === 'ink' || variant === 'glass' ? colors.paper : colors.ink);
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      scaleTo={0.9}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          borderWidth: variant === 'surface' ? 1 : 0,
          borderColor: colors.lineSoft,
        },
        style,
      ]}
    >
      <Icon size={size * 0.47} color={fg} strokeWidth={1.8} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: typeof badge === 'number' ? -3 : size * 0.14,
            right: typeof badge === 'number' ? -5 : size * 0.14,
            minWidth: typeof badge === 'number' ? 19 : 9,
            height: typeof badge === 'number' ? 19 : 9,
            borderRadius: 10,
            paddingHorizontal: typeof badge === 'number' ? 5 : 0,
            backgroundColor: colors.volt,
            borderWidth: 1.5,
            borderColor: variant === 'ink' ? colors.ink : colors.bone,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {typeof badge === 'number' ? (
            <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 9.5, lineHeight: 12, color: colors.ink }}>
              {badge > 99 ? '99+' : badge}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Touchable>
  );
}

/** Inline text action, copper by default — the web's `.vyro-link`. */
export function LinkText({ title, onPress, color = 'copper' }: { title: string; onPress?: () => void; color?: 'copper' | 'ink' | 'volt' | 'paper' }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="link">
      {({ pressed }) => (
        <Text variant="bodySm" weight="semibold" color={pressed ? 'ink' : color}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
