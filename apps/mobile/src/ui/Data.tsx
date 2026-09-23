import { type ReactNode } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { initials } from '@/lib/format';
import { assetUrl } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { Text, Kicker } from './Text';
import { Touchable, LinkText } from './Button';
import { Card } from './Surface';

/** Overline + title + optional action — heads every content block. */
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
    <View style={[{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }, style]}>
      <View style={{ flex: 1, gap: 4 }}>
        {kicker ? <Kicker color={dark ? 'volt' : 'copper'}>{kicker}</Kicker> : null}
        {title ? (
          <Text variant="h1" color={dark ? 'paper' : 'ink'}>
            {title}
          </Text>
        ) : null}
      </View>
      {action ? <LinkText title={action.label} onPress={action.onPress} color={dark ? 'volt' : 'copper'} /> : null}
    </View>
  );
}

/** KPI tile: overline label, mono metric, optional delta and hint. */
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
  return (
    <Card
      kind={dark ? 'ink' : accent ? 'volt' : 'flat'}
      onPress={onPress}
      style={[{ flex: 1, minWidth: 140, gap: 10 }, style]}
      padding={14}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="overline" color={dark ? 'paperMuted' : accent ? 'ink3' : 'ink4'} numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
        {Icon ? <Icon size={15} color={dark ? colors.volt : accent ? colors.ink : colors.copper} strokeWidth={1.8} /> : null}
      </View>
      <Text variant="metricSm" color={fg} numberOfLines={1} adjustsFontSizeToFit>
        {String(value)}
      </Text>
      {delta !== undefined && delta !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {up ? <TrendingUp size={13} color={colors.mint} /> : <TrendingDown size={13} color={colors.rose} />}
          <Text variant="caption" style={{ color: up ? colors.mint : colors.rose }}>
            {up ? '+' : ''}
            {delta.toFixed(1)}%
          </Text>
          {hint ? (
            <Text variant="caption" color={dark ? 'paperFaint' : 'ink5'} numberOfLines={1}>
              {hint}
            </Text>
          ) : null}
        </View>
      ) : hint ? (
        <Text variant="caption" color={dark ? 'paperFaint' : accent ? 'ink3' : 'ink4'} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </Card>
  );
}

/** Two-up grid wrapper for Stat tiles. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
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
        paddingVertical: 11,
        borderBottomWidth: last ? 0 : 1,
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
          ? colors.pearl
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
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: dark ? colors.paperLine : colors.lineSoft,
      }}
    >
      {leading ??
        (Icon ? (
          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} color={iconFg} strokeWidth={1.7} />
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
      {chevron ? <ChevronRight size={18} color={dark ? colors.paperFaint : colors.ink5} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.985}>
      {content}
    </Touchable>
  );
}

/** Groups ListRows inside a paper card. */
export function ListCard({ children, style, dark }: { children: ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  return (
    <Card kind={dark ? 'ink' : 'flat'} padding={0} style={[{ paddingHorizontal: 14 }, style]}>
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
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        height: 34,
        paddingHorizontal: 13,
        borderRadius: radii.pill,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: selected ? 'transparent' : dark ? colors.paperLine : colors.line,
      }}
    >
      {dotColor ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
      ) : null}
      {Icon ? <Icon size={14} color={selected && !dark ? colors.volt : fg} strokeWidth={1.8} /> : null}
      <Text style={{ fontFamily: 'IBMPlexSans_500Medium', fontSize: 13, color: fg }}>{label}</Text>
      {count !== undefined ? (
        <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, color: selected ? (dark ? colors.ink3 : colors.volt) : colors.ink4 }}>{count}</Text>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8, paddingRight: 20 }, style]}>
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

/** iOS-style segmented control in brand colours. */
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
  return (
    <View style={[{ flexDirection: 'row', backgroundColor: colors.mist, borderRadius: radii.lg + 2, padding: 3 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Touchable
            key={o.value}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            scaleTo={0.97}
            style={{
              flex: 1,
              height: 34,
              borderRadius: radii.lg,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.ink : 'transparent',
            }}
          >
            <Text style={{ fontFamily: on ? 'IBMPlexSans_600SemiBold' : 'IBMPlexSans_500Medium', fontSize: 13, color: on ? colors.paper : colors.ink3 }} numberOfLines={1}>
              {o.label}
            </Text>
          </Touchable>
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

/** Menu tile used on portal "More" hubs. */
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
  return (
    <Card kind={tone === 'ink' ? 'ink' : tone === 'volt' ? 'volt' : 'flat'} onPress={onPress} padding={14} style={{ flexBasis: '47%', flexGrow: 1, minHeight: 108, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dark ? 'rgba(198,220,74,0.14)' : tone === 'volt' ? colors.ink : colors.bone,
          }}
        >
          <Icon size={18} color={dark ? colors.volt : tone === 'volt' ? colors.volt : colors.ink} strokeWidth={1.7} />
        </View>
        {badge !== undefined && badge !== 0 ? (
          <View style={{ backgroundColor: dark ? colors.volt : colors.ink, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, color: dark ? colors.ink : colors.volt }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2, marginTop: 12 }}>
        <Text variant="h3" color={dark ? 'paper' : 'ink'} numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color={dark ? 'paperMuted' : tone === 'volt' ? 'ink3' : 'ink4'} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

export function MenuGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}
