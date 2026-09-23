import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { Text } from '@/ui';
import { colors, fonts } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * 270° utilisation gauge for the credit hero. The gap sits at the bottom;
 * the volt arc sweeps in on mount. Turns rose when `danger`.
 */
export function UtilisationArc({
  value,
  size = 220,
  thickness = 14,
  label,
  caption,
  danger,
  centerValue,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  thickness?: number;
  label?: string;
  caption?: string;
  danger?: boolean;
  centerValue?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2 - 8;
  const C = 2 * Math.PI * r;
  const L = C * 0.75;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(180, withTiming(pct, { duration: 1100, easing: Easing.out(Easing.cubic) }));
  }, [pct, progress]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: L * (1 - progress.value) }));
  const glowProps = useAnimatedProps(() => ({ strokeDashoffset: L * (1 - progress.value) }));

  const accent = danger ? colors.rose : colors.volt;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="arcGrad" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={danger ? colors.rose : colors.voltDeep} />
            <Stop offset="1" stopColor={accent} />
          </LinearGradient>
        </Defs>
        <G rotation={135} origin={`${cx}, ${cy}`}>
          <Circle cx={cx} cy={cy} r={r} stroke={colors.paperLine} strokeWidth={thickness} fill="none" strokeDasharray={`${L} ${C}`} strokeLinecap="round" />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke={accent}
            strokeOpacity={0.18}
            strokeWidth={thickness + 12}
            fill="none"
            strokeDasharray={`${L} ${C}`}
            strokeLinecap="round"
            animatedProps={glowProps}
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={r}
            stroke="url(#arcGrad)"
            strokeWidth={thickness}
            fill="none"
            strokeDasharray={`${L} ${C}`}
            strokeLinecap="round"
            animatedProps={arcProps}
          />
        </G>
        {ticks.map((t) => {
          const a = ((135 + t * 270) * Math.PI) / 180;
          const r1 = r - thickness / 2 - 8;
          const r2 = r1 - 6;
          return (
            <Line
              key={t}
              x1={cx + r1 * Math.cos(a)}
              y1={cy + r1 * Math.sin(a)}
              x2={cx + r2 * Math.cos(a)}
              y2={cy + r2 * Math.sin(a)}
              stroke={t <= pct ? accent : colors.paperFaint}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', paddingHorizontal: 30 }}>
        {label ? (
          <Text variant="overline" color="paperMuted">
            {label}
          </Text>
        ) : null}
        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 40, lineHeight: 44, letterSpacing: -1.6, color: colors.paper, marginTop: 2 }}>
          {centerValue ?? `${Math.round(pct * 100)}%`}
        </Text>
        {caption ? (
          <Text variant="caption" color={danger ? 'rose' : 'volt'} align="center" numberOfLines={2}>
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
