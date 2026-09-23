import { useEffect } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
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
function HeroFlow({ width, height: h = 136 }: { width: number; height?: number }) {
  const draw = useSharedValue(900);
  const drift = useSharedValue(0);

  useEffect(() => {
    draw.value = withTiming(0, { duration: 1800, easing: Easing.bezier(0.22, 1, 0.36, 1) });
    drift.value = withRepeat(withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [draw, drift]);

  const lineProps = useAnimatedStyle(() => ({ opacity: 1 }));
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drift.value * -4 }] }));

  const x1 = 30;
  const y1 = Math.round(h * 0.72);

  const x2 = Math.round(width * 0.5);
  const y2 = Math.round(h * 0.28);

  const x3 = width - 30;
  const y3 = Math.round(h * 0.56);

  return (
    <Animated.View style={[{ width, height: h }, floatStyle, lineProps]}>
      <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`}>
        <Path
          d={`M -20 ${y1 + 10} C ${width * 0.28} ${y1 + 10}, ${width * 0.28} ${y2 - 8}, ${width * 0.54} ${y2 - 6} S ${width * 0.8} ${y3 + 12}, ${width + 30} ${y3}`}
          stroke={colors.copper}
          strokeOpacity={0.4}
          strokeWidth={1}
          fill="none"
        />
        <AnimatedPath
          d={`M ${x1} ${y1} C ${width * 0.24} ${y1}, ${width * 0.34} ${y2}, ${x2} ${y2} S ${width * 0.74} ${y3}, ${x3} ${y3}`}
          stroke={colors.volt}
          strokeWidth={2}
          fill="none"
          strokeDasharray="900"
          animatedProps={{ strokeDashoffset: draw } as never}
        />
        <Circle cx={x1} cy={y1} r={5.5} fill={colors.volt} />
        <Circle cx={x2} cy={y2} r={5.5} fill={colors.paper} />
        <Circle cx={x3} cy={y3} r={5.5} fill={colors.copper} />
      </Svg>
      <View style={{ position: 'absolute', left: 12, top: y1 + 10 }}>
        <Text variant="overline" color="volt">
          Business
        </Text>
      </View>
      <View style={{ position: 'absolute', left: x2 - 32, width: 64, alignItems: 'center', top: Math.max(2, y2 - 24) }}>
        <Text variant="overline" color="paper" align="center">
          Catalog
        </Text>
      </View>
      <View style={{ position: 'absolute', right: 12, top: y3 + 10 }}>
        <Text variant="overline" color="copper">
          Supplier
        </Text>
      </View>
    </Animated.View>
  );
}

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  // Dynamically size the hero graphic so it always fits comfortably between the header and text
  const heroHeight = Math.max(110, Math.min(145, Math.round(height * 0.16)));

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['rgba(198,220,74,0.12)', 'rgba(12,14,11,0)', 'rgba(184,122,78,0.18)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: insets.top + 8,
          paddingBottom: Math.max(insets.bottom, 14) + 8,
          paddingHorizontal: GUTTER,
        }}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={{ gap: 6 }}>
          <Animated.View entering={FadeInDown.duration(600)}>
            <Wordmark tone="paper" eyebrow="Sri Lanka wholesale" />
          </Animated.View>

          <View style={{ height: heroHeight, justifyContent: 'center', marginHorizontal: -GUTTER, marginVertical: 4 }}>
            <HeroFlow width={width} height={heroHeight} />
          </View>

          <Animated.View entering={FadeInDown.delay(250).duration(700)} style={{ gap: 8 }}>
            <Kicker color="volt">Procurement operating layer</Kicker>
            <Text
              variant="displayXl"
              color="paper"
              style={{
                fontSize: Math.min(40, Math.round(width * 0.098)),
                lineHeight: Math.min(42, Math.round(width * 0.102)),
              }}
            >
              Wholesale{'\n'}in flow.
            </Text>
            <Text variant="body" color="paperMuted" style={{ maxWidth: 360, lineHeight: 22 }}>
              Source from verified suppliers, compare live offers, run RFQs and settle payments — from your pocket.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(350).duration(700)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {TRUST.map((t) => (
              <View
                key={t.label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  height: 28,
                  paddingHorizontal: 10,
                  borderRadius: 14,
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
        </View>

        <Animated.View
          entering={FadeInDown.delay(450).duration(700)}
          style={{
            gap: 10,
            marginTop: 16,
            marginHorizontal: -4,
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
      </ScrollView>
    </View>
  );
}
