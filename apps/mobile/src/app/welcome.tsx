import { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { ArrowRight, BadgeCheck, Building2, Lock, Search, Store, Zap } from 'lucide-react-native';
import { Button, Text, Wordmark, Kicker } from '@/ui';
import { colors, GUTTER, radii } from '@/theme/tokens';

const TRUST = [
  { icon: BadgeCheck, label: 'Verified suppliers' },
  { icon: Lock, label: 'Escrow-protected' },
  { icon: Zap, label: 'Live offers' },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Animated supply line: buyer → catalog → supplier, drawn on arrival. */
function HeroFlow({ width }: { width: number }) {
  const h = 260;
  const draw = useSharedValue(900);
  const drift = useSharedValue(0);
  useEffect(() => {
    draw.value = withTiming(0, { duration: 1800, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    drift.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [draw, drift]);
  const lineProps = useAnimatedStyle(() => ({ opacity: 1 }));
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drift.value * -8 }] }));
  return (
    <Animated.View style={[{ width, height: h }, floatStyle, lineProps]}>
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`}>
        <Path
          d={`M-20 ${h - 30} C ${width * 0.3} ${h - 20}, ${width * 0.28} 30, ${width * 0.55} 50 S ${width * 0.8} ${h - 60}, ${width + 30} ${h * 0.45}`}
          stroke={colors.copper}
          strokeOpacity={0.4}
          strokeWidth={1}
          fill="none"
        />
        <AnimatedPath
          d={`M24 ${h - 50} C ${width * 0.25} ${h - 50}, ${width * 0.32} 60, ${width * 0.5} 60 S ${width * 0.72} ${h * 0.55}, ${width - 24} ${h * 0.55}`}
          stroke={colors.volt}
          strokeWidth={2}
          fill="none"
          strokeDasharray="900"
          animatedProps={{ strokeDashoffset: draw } as never}
        />
        <Circle cx={24} cy={h - 50} r={6} fill={colors.volt} />
        <Circle cx={width * 0.5} cy={60} r={6} fill={colors.paper} />
        <Circle cx={width - 24} cy={h * 0.55} r={6} fill={colors.copper} />
      </Svg>
      <View style={{ position: 'absolute', left: 12, top: h - 36 }}>
        <Text variant="overline" color="volt">
          Business
        </Text>
      </View>
      <View style={{ position: 'absolute', left: width * 0.5 - 28, top: 22 }}>
        <Text variant="overline" color="paper">
          Catalog
        </Text>
      </View>
      <View style={{ position: 'absolute', right: 12, top: h * 0.55 + 14 }}>
        <Text variant="overline" color="copper">
          Supplier
        </Text>
      </View>
    </Animated.View>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(198,220,74,0.12)', 'rgba(12,14,11,0)', 'rgba(184,122,78,0.18)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View style={{ flex: 1, paddingTop: insets.top + 12, paddingHorizontal: GUTTER }}>
        <Animated.View entering={FadeInDown.duration(600)}>
          <Wordmark tone="paper" eyebrow="Sri Lanka wholesale" />
        </Animated.View>

        <View style={{ flex: 1, justifyContent: 'center', marginHorizontal: -GUTTER }}>
          <HeroFlow width={width} />
        </View>

        <Animated.View entering={FadeInDown.delay(250).duration(700)} style={{ gap: 12 }}>
          <Kicker color="volt">Procurement operating layer</Kicker>
          <Text variant="displayXl" color="paper">
            Wholesale,{'\n'}in flow.
          </Text>
          <Text variant="bodyLg" color="paperMuted" style={{ maxWidth: 360 }}>
            Source from verified suppliers, compare live offers, run RFQs and settle payments — from your pocket.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).duration(700)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          {TRUST.map((t) => (
            <View
              key={t.label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 30,
                paddingHorizontal: 11,
                borderRadius: 15,
                backgroundColor: 'rgba(250,247,240,0.07)',
                borderWidth: 1,
                borderColor: colors.paperLine,
              }}
            >
              <t.icon size={13} color={colors.volt} strokeWidth={2} />
              <Text variant="caption" weight="semibold" color="paper">
                {t.label}
              </Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(450).duration(700)}
          style={{
            gap: 10,
            marginTop: 22,
            marginBottom: insets.bottom + 10,
            marginHorizontal: -8,
            padding: 12,
            borderRadius: radii['2xl'] + 4,
            borderCurve: 'continuous',
            backgroundColor: 'rgba(250,247,240,0.06)',
            borderWidth: 1,
            borderColor: colors.paperLine,
          }}
        >
          <Button title="Sign in" variant="volt" size="lg" full iconRight={ArrowRight} onPress={() => router.push('/login')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="For buyers"
              variant="paper"
              icon={Building2}
              style={{ flex: 1 }}
              full
              onPress={() => router.push({ pathname: '/signup', params: { intent: 'buyer' } })}
            />
            <Button
              title="For suppliers"
              variant="paper"
              icon={Store}
              style={{ flex: 1 }}
              full
              onPress={() => router.push({ pathname: '/signup', params: { intent: 'supplier' } })}
            />
          </View>
          <Button title="Browse the catalog" variant="ghostPaper" icon={Search} full size="sm" onPress={() => router.push('/buyer/catalog')} style={{ opacity: 0.9 }} />
        </Animated.View>
      </View>
    </View>
  );
}
