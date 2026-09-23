import { useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Image } from 'expo-image';
import { Package } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { resolveCatalogImage } from '@/lib/catalogImages';
import { assetUrl } from '@/lib/api';
import { Text } from './Text';

/** The VYRO flow mark — three nodes joined by a supply curve. */
export function BrandMark({ size = 32, tone = 'ink' }: { size?: number; tone?: 'ink' | 'volt' | 'paper' }) {
  const bg = tone === 'volt' ? colors.volt : tone === 'paper' ? colors.paper : colors.ink;
  const stroke = tone === 'ink' ? colors.volt : colors.ink;
  const mid = tone === 'ink' ? colors.paper : colors.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect width="32" height="32" rx="7" fill={bg} />
      <Path d="M5 23C9.5 23 10.5 9 16 9C21.5 9 22 17 27 17" stroke={stroke} strokeWidth={1.6} fill="none" />
      <Circle cx="5" cy="23" r="1.8" fill={stroke} />
      <Circle cx="16" cy="9" r="1.8" fill={mid} />
      <Circle cx="27" cy="17" r="1.8" fill={colors.copper} />
    </Svg>
  );
}

export function Wordmark({
  tone = 'ink',
  size = 20,
  eyebrow,
}: {
  tone?: 'ink' | 'paper';
  size?: number;
  eyebrow?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <BrandMark size={size + 8} tone={tone === 'paper' ? 'volt' : 'ink'} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text
          variant="h1"
          color={tone === 'paper' ? 'paper' : 'ink'}
          style={{ fontFamily: 'Syne_800ExtraBold', fontSize: size, lineHeight: size + 2, letterSpacing: -0.8 }}
        >
          VYRO
        </Text>
        {eyebrow ? (
          <Text variant="overline" color={tone === 'paper' ? 'volt' : 'copper'}>
            {eyebrow}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Decorative supply-flow curves used behind ink heroes, like the web's
 * `FlowCanvas`. Pass a seed so each surface gets its own composition.
 */
export function FlowField({
  seed = 'vyro',
  tone = 'paper',
  style,
  opacity = 1,
}: {
  seed?: string;
  tone?: 'paper' | 'ink';
  style?: StyleProp<ViewStyle>;
  opacity?: number;
}) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const o = (h % 60) - 30;
  const a = tone === 'paper' ? colors.volt : colors.voltDeep;
  const b = colors.copper;
  const c = tone === 'paper' ? colors.paper : colors.ink;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
        <Path
          d={`M-30 ${210 + o} C 70 ${210 + o}, 110 ${60 - o}, 200 ${70 + o} S 330 ${240 - o}, 440 ${130 + o}`}
          stroke={a}
          strokeOpacity={0.55}
          strokeWidth={1.3}
          fill="none"
        />
        <Path
          d={`M-40 ${110 - o} C 80 ${120 + o}, 150 ${270 - o}, 260 ${220 + o} S 380 ${60 + o}, 460 ${90 - o}`}
          stroke={b}
          strokeOpacity={0.45}
          strokeWidth={1}
          fill="none"
        />
        <Path
          d={`M-20 ${270 - o} C 120 ${240}, 220 ${300 - o}, 420 ${200 + o}`}
          stroke={c}
          strokeOpacity={0.12}
          strokeWidth={1}
          fill="none"
        />
        <Circle cx={200} cy={70 + o} r={3} fill={a} />
        <Circle cx={260} cy={220 + o} r={2.6} fill={b} />
        <Circle cx={90 + (h % 40)} cy={150} r={2} fill={c} fillOpacity={0.5} />
      </Svg>
    </View>
  );
}

/** Ink tile with seeded flow lines — shown while an image loads or when none exists. */
export function ProductPlaceholder({ seed, style, label }: { seed: string; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <View style={[{ backgroundColor: colors.ink, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      <FlowField seed={seed} opacity={1.4} />
      <Package size={30} color="rgba(250,247,240,0.34)" strokeWidth={1.4} />
      {label ? (
        <View style={{ position: 'absolute', left: 12, bottom: 10, right: 12 }}>
          <Text variant="overline" color="paperMuted" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function ProductImage({
  src,
  seed,
  style,
  label,
  contentFit = 'cover',
}: {
  src?: string | null;
  seed: string;
  style?: StyleProp<ViewStyle>;
  label?: string;
  contentFit?: 'cover' | 'contain';
}) {
  const resolved = resolveCatalogImage(seed, assetUrl(src ?? undefined));
  const [failed, setFailed] = useState(false);
  if (!resolved || failed) return <ProductPlaceholder seed={seed} style={style} label={label} />;
  return (
    <View style={[{ backgroundColor: colors.mist, overflow: 'hidden' }, style]}>
      <Image
        source={{ uri: resolved }}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        transition={260}
        onError={() => setFailed(true)}
        placeholder={{ blurhash: 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4' }}
      />
    </View>
  );
}
