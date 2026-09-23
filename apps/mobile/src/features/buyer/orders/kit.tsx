import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { LucideIcon } from 'lucide-react-native';
import { Card, Kicker, Text } from '@/ui';
import { colors, fonts, radii } from '@/theme/tokens';
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
    <Card kind={kind} padding={padding} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {step !== undefined ? (
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.volt }}>{step}</Text>
          </View>
        ) : Icon ? (
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={colors.volt} strokeWidth={1.8} />
          </View>
        ) : null}
        <View style={{ flex: 1, gap: 3 }}>
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
    <View style={[{ alignSelf: 'flex-start', backgroundColor: map.bg, borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 2 }, style]}>
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
        style={{
          maxWidth: '86%',
          paddingHorizontal: 13,
          paddingVertical: 10,
          borderRadius: 16,
          borderBottomRightRadius: mine ? 4 : 16,
          borderBottomLeftRadius: mine ? 16 : 4,
          backgroundColor: mine ? colors.ink : dark ? colors.ink2 : colors.paper,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.lineSoft,
          gap: 4,
        }}
      >
        {children}
        {meta ? (
          <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: mine ? colors.paperFaint : colors.ink5, textAlign: 'right' }}>{meta}</Text>
        ) : null}
      </View>
    </View>
  );
}
