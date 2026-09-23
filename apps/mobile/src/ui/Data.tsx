import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { ArrowUpRight, ChevronRight, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { colors, radii, shadow } from '@/theme/tokens';
import { initials } from '@/lib/format';
import { assetUrl } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { Text, Kicker } from './Text';
import { Touchable } from './Button';
import { Card } from './Surface';

/** Overline + title + optional "See all" pill — heads every content block. */
export function SectionHeader({
  kicker,
  title,
  action,
  style,
  dark,
}: {
  kicker?: string;
  title?: string;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12, paddingHorizontal: 2 }, style]}>
      <View style={{ flex: 1, gap: 3 }}>
        {kicker ? <Kicker color={dark ? 'volt' : 'copper'}>{kicker}</Kicker> : null}
        {title ? (
          <Text variant="h1" color={dark ? 'paper' : 'ink'} style={{ fontSize: 20, lineHeight: 25 }}>
            {title}
          </Text>
        ) : null}
      </View>
      {action ? <PillAction label={action.label} onPress={action.onPress} dark={dark} /> : null}
    </View>
  );
}

/** Compact "See all" capsule used as a section / card action. */
export function PillAction({ label, onPress, dark }: { label: string; onPress: () => void; dark?: boolean }) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      hitSlop={8}
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          height: 30,
          paddingLeft: 12,
          paddingRight: 8,
          borderRadius: radii.pill,
          backgroundColor: dark ? 'rgba(250,247,240,0.09)' : colors.paper,
        },
        dark ? null : shadow.sm,
      ]}
    >
      <Text variant="caption" weight="semibold" color={dark ? 'paper' : 'ink2'} numberOfLines={1}>
        {label}
      </Text>
      <ChevronRight size={14} color={dark ? colors.volt : colors.copper} strokeWidth={2} />
    </Touchable>
  );
}

/** KPI tile: tinted icon, big mono metric, label and a delta chip. */
export function Stat({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  dark,
  onPress,
  style,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Percentage change; positive renders green/up. */
  delta?: number | null;
  icon?: LucideIcon;
  dark?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  const fg = dark ? 'paper' : 'ink';
  const up = (delta ?? 0) >= 0;
  const hasDelta = delta !== undefined && delta !== null;
  return (
    <Card kind={dark ? 'ink' : accent ? 'volt' : 'flat'} onPress={onPress} style={[{ flex: 1, minWidth: 140, gap: 12 }, style]} padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {Icon ? (
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              borderCurve: 'continuous',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: dark ? 'rgba(198,220,74,0.14)' : accent ? colors.ink : colors.bone,
            }}
          >
            <Icon size={16} color={dark || accent ? colors.volt : colors.ink} strokeWidth={1.9} />
          </View>
        ) : (
          <View />
        )}
        {hasDelta ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 7,
              height: 22,
              borderRadius: 11,
              backgroundColor: up ? (dark ? 'rgba(61,139,110,0.22)' : colors.mintSoft) : dark ? 'rgba(196,90,74,0.22)' : colors.roseSoft,
            }}
          >
            {up ? <TrendingUp size={11} color={dark ? colors.voltGlow : colors.mint} /> : <TrendingDown size={11} color={colors.rose} />}
            <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 10.5, color: up ? (dark ? colors.voltGlow : colors.mint) : colors.rose }}>
              {up ? '+' : ''}
              {delta.toFixed(1)}%
            </Text>
          </View>
        ) : onPress ? (
          <ChevronRight size={16} color={dark ? colors.paperFaint : accent ? colors.ink3 : colors.ink5} />
        ) : null}
      </View>
      <View style={{ gap: 3 }}>
        <Text variant="metricSm" color={fg} numberOfLines={1} adjustsFontSizeToFit>
          {String(value)}
        </Text>
        <Text variant="caption" weight="semibold" color={dark ? 'paperMuted' : accent ? 'ink2' : 'ink3'} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color={dark ? 'paperFaint' : accent ? 'ink3' : 'ink5'} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** Two-up grid wrapper for Stat tiles. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>;
}

/** Label / value line used in detail screens. */
export function KeyValue({
  label,
  value,
  mono,
  last,
  emphasize,
  children,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  last?: boolean;
  emphasize?: boolean;
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 12,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth * 2,
        borderBottomColor: colors.lineSoft,
      }}
    >
      <Text variant="bodySm" color="ink4">
        {label}
      </Text>
      {children ?? (
        <Text
          variant={mono ? 'mono' : emphasize ? 'h3' : 'bodySm'}
          weight={mono || emphasize ? undefined : 'medium'}
          style={{ flexShrink: 1, textAlign: 'right' }}
          numberOfLines={2}
        >
          {value === null || value === undefined || value === '' ? '—' : (value as ReactNode)}
        </Text>
      )}
    </View>
  );
}

/** Tappable list row with leading icon/avatar, title, subtitle and trailing slot. */
export function ListRow({
  title,
  subtitle,
  meta,
  icon: Icon,
  iconTone = 'ink',
  leading,
  trailing,
  onPress,
  chevron = !!onPress,
  last,
  dark,
  destructive,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  icon?: LucideIcon;
  iconTone?: 'ink' | 'volt' | 'copper' | 'paper' | 'danger';
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  dark?: boolean;
  destructive?: boolean;
}) {
  const iconBg =
    iconTone === 'volt'
      ? colors.volt
      : iconTone === 'copper'
        ? colors.copperSoft
        : iconTone === 'paper'
          ? colors.bone
          : iconTone === 'danger'
            ? colors.roseSoft
            : dark
              ? 'rgba(250,247,240,0.08)'
              : colors.ink;
  const iconFg =
    iconTone === 'volt'
      ? colors.ink
      : iconTone === 'copper'
        ? colors.copperDeep
        : iconTone === 'paper'
          ? colors.ink
          : iconTone === 'danger'
            ? colors.rose
            : colors.volt;
  const hasLead = !!leading || !!Icon;
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, minHeight: 60 }}>
      {leading ??
        (Icon ? (
          <View style={{ width: 38, height: 38, borderRadius: 12, borderCurve: 'continuous', backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={iconFg} strokeWidth={1.8} />
          </View>
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium" color={destructive ? 'rose' : dark ? 'paper' : 'ink'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySm" color={dark ? 'paperMuted' : 'ink4'} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {trailing}
      {chevron ? (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dark ? 'rgba(250,247,240,0.06)' : colors.bone,
          }}
        >
          <ChevronRight size={15} color={dark ? colors.paperMuted : colors.ink4} strokeWidth={2} />
        </View>
      ) : null}
      {!last ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: hasLead ? 52 : 0,
            right: 0,
            bottom: 0,
            height: StyleSheet.hairlineWidth * 2,
            backgroundColor: dark ? colors.paperLine : colors.lineSoft,
          }}
        />
      ) : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.985}>
      {content}
    </Touchable>
  );
}

/** Inset-grouped list — rows share one rounded card with hairline separators. */
export function ListCard({ children, style, dark }: { children: ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  return (
    <Card kind={dark ? 'ink' : 'flat'} padding={0} style={[{ paddingHorizontal: 16, paddingVertical: 2 }, style]}>
      {children}
    </Card>
  );
}

export function Avatar({ name, uri, size = 40, tone = 'ink' }: { name?: string | null; uri?: string | null; size?: number; tone?: 'ink' | 'volt' | 'copper' }) {
  const bg = tone === 'volt' ? colors.volt : tone === 'copper' ? colors.copper : colors.ink;
  const fg = tone === 'ink' ? colors.volt : colors.ink;
  const src = assetUrl(uri);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {src ? (
        <Image source={{ uri: src }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ fontFamily: 'Syne_700Bold', fontSize: size * 0.38, color: fg, letterSpacing: -0.5 }}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon: Icon,
  count,
  dark,
  dotColor,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  count?: number;
  dark?: boolean;
  dotColor?: string;
}) {
  const bg = selected ? (dark ? colors.volt : colors.ink) : dark ? 'rgba(250,247,240,0.08)' : colors.paper;
  const fg = selected ? (dark ? colors.ink : colors.paper) : dark ? colors.paper : colors.ink;
  return (
    <Touchable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      scaleTo={0.94}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: 36,
          paddingHorizontal: 14,
          borderRadius: radii.pill,
          backgroundColor: bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: selected ? 'transparent' : dark ? colors.paperLine : 'rgba(12,14,11,0.08)',
        },
        !selected && !dark ? shadow.sm : null,
      ]}
    >
      {dotColor ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
      ) : null}
      {Icon ? <Icon size={14} color={selected && !dark ? colors.volt : fg} strokeWidth={1.8} /> : null}
      <Text style={{ fontFamily: 'IBMPlexSans_500Medium', fontSize: 13, color: fg }}>{label}</Text>
      {count !== undefined ? (
        <View
          style={{
            minWidth: 20,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? (dark ? 'rgba(12,14,11,0.12)' : 'rgba(198,220,74,0.18)') : dark ? 'rgba(250,247,240,0.08)' : colors.bone,
          }}
        >
          <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 10.5, lineHeight: 13, color: selected ? (dark ? colors.ink : colors.volt) : dark ? colors.paperMuted : colors.ink4 }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Touchable>
  );
}

/** Horizontally scrolling filter chips. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  dark,
  style,
}: {
  options: { value: T; label: string; count?: number; icon?: LucideIcon; dotColor?: string }[];
  value: T;
  onChange: (v: T) => void;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingRight: 20, paddingVertical: 4 }, style]}
      style={{ overflow: 'visible' }}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          count={o.count}
          icon={o.icon}
          dotColor={o.dotColor}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
          dark={dark}
        />
      ))}
    </ScrollView>
  );
}

/** iOS-style segmented control: a paper thumb springs between options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const seg = options.length ? (w - 6) / options.length : 0;
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withSpring(idx * seg, { damping: 20, stiffness: 260, mass: 0.7 });
  }, [idx, seg, x]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ flexDirection: 'row', backgroundColor: 'rgba(12,14,11,0.06)', borderRadius: radii.pill, padding: 3 }, style]}
    >
      {w > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', top: 3, left: 3, bottom: 3, width: seg, borderRadius: radii.pill, backgroundColor: colors.paper },
            shadow.sm,
            thumb,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              haptic.tap();
              onChange(o.value);
            }}
            style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}
          >
            <Text
              style={{ fontFamily: on ? 'IBMPlexSans_600SemiBold' : 'IBMPlexSans_500Medium', fontSize: 13, color: on ? colors.ink : colors.ink4 }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export type TimelineStep = { label: string; hint?: string; state: 'done' | 'active' | 'idle' };

/** Vertical flow line — order / delivery / RFQ progress. The web's FlowLine, turned upright. */
export function Timeline({ steps, dark }: { steps: TimelineStep[]; dark?: boolean }) {
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dotColor = s.state === 'done' ? (dark ? colors.volt : colors.ink) : s.state === 'active' ? colors.volt : dark ? colors.paperLine : colors.mist;
        return (
          <View key={`${s.label}-${i}`} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 18 }}>
              <View
                style={{
                  width: s.state === 'active' ? 16 : 12,
                  height: s.state === 'active' ? 16 : 12,
                  borderRadius: 8,
                  backgroundColor: dotColor,
                  borderWidth: s.state === 'active' ? 3 : 0,
                  borderColor: dark ? colors.ink : colors.ink,
                  marginTop: s.state === 'active' ? 2 : 4,
                }}
              />
              {!last ? (
                <View style={{ flex: 1, width: 1.5, marginVertical: 3, backgroundColor: s.state === 'done' ? (dark ? colors.volt : colors.ink) : dark ? colors.paperLine : colors.line }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
              <Text variant="body" weight={s.state === 'idle' ? 'regular' : 'semibold'} color={dark ? (s.state === 'idle' ? 'paperFaint' : 'paper') : s.state === 'idle' ? 'ink5' : 'ink'}>
                {s.label}
              </Text>
              {s.hint ? (
                <Text variant="caption" color={dark ? 'paperMuted' : 'ink4'} style={{ marginTop: 2 }}>
                  {s.hint}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Horizontal step indicator for short flows (e.g. checkout, onboarding). */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {steps.map((s, i) => (
        <View key={s} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: i <= current ? (i === current ? colors.volt : colors.ink) : colors.mist }} />
          <Text variant="caption" color={i === current ? 'ink' : 'ink5'} numberOfLines={1}>
            {s}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Menu tile used on portal hubs: tinted icon, arrow, label and hint. */
export function MenuTile({
  icon: Icon,
  label,
  hint,
  onPress,
  badge,
  tone = 'paper',
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
  badge?: string | number;
  tone?: 'paper' | 'ink' | 'volt';
}) {
  const dark = tone === 'ink';
  const volt = tone === 'volt';
  return (
    <Card
      kind={dark ? 'ink' : volt ? 'volt' : 'flat'}
      onPress={onPress}
      padding={16}
      style={{ flexBasis: '46%', flexGrow: 1, minHeight: 124, justifyContent: 'space-between' }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dark ? 'rgba(198,220,74,0.14)' : colors.ink,
          }}
        >
          <Icon size={19} color={colors.volt} strokeWidth={1.8} />
        </View>
        {badge !== undefined && badge !== 0 ? (
          <View style={{ backgroundColor: dark ? colors.volt : colors.copper, borderRadius: 11, minWidth: 22, height: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, lineHeight: 14, color: dark ? colors.ink : colors.paper }}>{badge}</Text>
          </View>
        ) : (
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: dark ? 'rgba(250,247,240,0.08)' : volt ? 'rgba(12,14,11,0.08)' : colors.bone,
            }}
          >
            <ArrowUpRight size={14} color={dark ? colors.paperMuted : volt ? colors.ink : colors.ink4} strokeWidth={2} />
          </View>
        )}
      </View>
      <View style={{ gap: 2, marginTop: 16 }}>
        <Text variant="h3" color={dark ? 'paper' : 'ink'} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color={dark ? 'paperMuted' : volt ? 'ink3' : 'ink4'} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export function MenuGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>;
}

/** Round action button with a caption — the quick-action row on dashboards. */
export function QuickAction({
  icon: Icon,
  label,
  onPress,
  tone = 'paper',
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** `paper` on bone canvas, `glass` on ink heroes, `volt` for the primary action. */
  tone?: 'paper' | 'glass' | 'volt' | 'ink';
  badge?: number;
}) {
  const bg = tone === 'glass' ? 'rgba(250,247,240,0.09)' : tone === 'volt' ? colors.volt : tone === 'ink' ? colors.ink : colors.paper;
  const fg = tone === 'volt' ? colors.ink : tone === 'paper' ? colors.ink : colors.volt;
  const labelColor = tone === 'glass' ? 'paperMuted' : 'ink3';
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.92} accessibilityRole="button" accessibilityLabel={label} style={{ flex: 1, alignItems: 'center', gap: 8, minWidth: 64 }}>
      <View
        style={[
          {
            width: 56,
            height: 56,
            borderRadius: 20,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: bg,
            borderWidth: tone === 'glass' ? 1 : 0,
            borderColor: 'rgba(250,247,240,0.1)',
          },
          tone === 'paper' ? shadow.card : tone === 'volt' ? shadow.volt : null,
        ]}
      >
        <Icon size={22} color={fg} strokeWidth={1.8} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              paddingHorizontal: 5,
              backgroundColor: colors.copper,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: tone === 'glass' ? colors.ink : colors.bone,
            }}
          >
            <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 10, lineHeight: 12, color: colors.paper }}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text variant="caption" weight="semibold" color={labelColor} numberOfLines={1} style={{ fontSize: 11.5 }}>
        {label}
      </Text>
    </Touchable>
  );
}

/** Evenly spaced row of QuickActions. */
export function QuickActions({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, style]}>{children}</View>;
}

/** iOS-style inset-grouped section: small caps label above a ListCard. */
export function ListSection({
  label,
  footer,
  children,
  dark,
  style,
}: {
  label?: string;
  footer?: string;
  children: ReactNode;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {label ? (
        <Text variant="overline" color={dark ? 'paperMuted' : 'ink4'} style={{ marginLeft: 6 }}>
          {label}
        </Text>
      ) : null}
      <ListCard dark={dark}>{children}</ListCard>
      {footer ? (
        <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'} style={{ marginHorizontal: 6 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
