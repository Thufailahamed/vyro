import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { LucideIcon } from 'lucide-react-native';
import { Card, IconTile, Kicker, Text } from '@/ui';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';

/** Navigate to any app path. Routes are owned by several areas, so we cast. */
export function go(path: string, replace = false) {
  if (replace) router.replace(path as never);
  else router.push(path as never);
}

export async function copyToClipboard(value: string) {
  try {
    await Clipboard.setStringAsync(value);
    haptic.success();
    return true;
  } catch {
    return false;
  }
}

/** Staggered entrance used on every list / section. */
export function Enter({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(i, 10) * 60).duration(420)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Numbered editorial section card — the web's SectionCard. */
export function Section({
  step,
  kicker,
  title,
  sub,
  right,
  icon: Icon,
  children,
  kind = 'flat',
  padding = 16,
}: {
  step?: number | string;
  kicker?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  kind?: 'flat' | 'elevated' | 'bone';
  padding?: number;
}) {
  return (
    <Card kind={kind} padding={padding} radius={radii['2xl']} style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {step !== undefined ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              borderCurve: 'continuous',
              backgroundColor: colors.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.volt }}>{step}</Text>
          </View>
        ) : Icon ? (
          <IconTile icon={Icon} tone="ink" size={36} />
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          {kicker ? <Kicker>{kicker}</Kicker> : null}
          <Text variant="h2">{title}</Text>
          {sub ? (
            <Text variant="caption" color="ink4">
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </Card>
  );
}

/** Small mono tag, e.g. "12 units" / "v3". */
export function MonoTag({ label, tone = 'ink', style }: { label: string; tone?: 'ink' | 'volt' | 'copper' | 'mint' | 'amber' | 'rose' | 'paper'; style?: StyleProp<ViewStyle> }) {
  const map = {
    ink: { bg: colors.mist, fg: colors.ink3 },
    volt: { bg: colors.voltSoft, fg: colors.voltDeep },
    copper: { bg: colors.copperSoft, fg: colors.copperDeep },
    mint: { bg: colors.mintSoft, fg: colors.mint },
    amber: { bg: colors.amberSoft, fg: colors.amber },
    rose: { bg: colors.roseSoft, fg: colors.rose },
    paper: { bg: 'rgba(250,247,240,0.1)', fg: colors.paper },
  }[tone];
  return (
    <View style={[{ alignSelf: 'flex-start', backgroundColor: map.bg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 }, style]}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 0.4, color: map.fg, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

/** Label/value pair laid out in a 2-col grid. */
export function InfoGrid({ items, dark }: { items: { label: string; value: string; mono?: boolean }[]; dark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
      {items.map((it) => (
        <View key={it.label} style={{ width: '50%', paddingRight: 10, gap: 3 }}>
          <Text variant="overline" color={dark ? 'paperFaint' : 'ink5'}>
            {it.label}
          </Text>
          <Text
            variant={it.mono ? 'mono' : 'bodySm'}
            weight={it.mono ? undefined : 'semibold'}
            color={dark ? 'paper' : 'ink'}
            numberOfLines={2}
            style={it.mono ? { fontFamily: fonts.monoMedium } : undefined}
          >
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Chat bubble shared by PO messages, RFQ messages and conversational ordering. */
export function Bubble({ mine, children, meta, dark }: { mine: boolean; children: ReactNode; meta?: string; dark?: boolean }) {
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={[
          {
            maxWidth: '84%',
            paddingHorizontal: 15,
            paddingVertical: 11,
            borderRadius: 20,
            borderCurve: 'continuous',
            borderBottomRightRadius: mine ? 6 : 20,
            borderBottomLeftRadius: mine ? 20 : 6,
            backgroundColor: mine ? colors.ink : dark ? colors.ink2 : colors.paper,
            gap: 4,
          },
          dark && !mine ? null : shadow.sm,
        ]}
      >
        {children}
        {meta ? (
          <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: mine ? colors.paperFaint : colors.ink5, textAlign: 'right' }}>{meta}</Text>
        ) : null}
      </View>
    </View>
  );
}
