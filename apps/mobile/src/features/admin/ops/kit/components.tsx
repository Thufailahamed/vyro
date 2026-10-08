import { useEffect, useState, type ReactNode } from 'react';
import { Linking, Share, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell, Check, CheckCircle2, ChevronDown, Mail, MapPin, Phone, Search, X, XCircle, type LucideIcon } from 'lucide-react-native';
import { Avatar, Badge, Button, Card, ConfirmSheet, ConfettiBurst, CountUp, Field, IconButton, IconTile, Input, Kicker, ListRow, ScreenHeader, Sheet, SuccessCheck, Text, Touchable, type ButtonVariant } from '@/ui';
import { colors, GUTTER, radii, shadow } from '@/theme/tokens';
import { useAuth } from '@/lib/auth';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';
import { TAB_BAR_SPACE } from '@/ui';
import { usePermission } from '@/features/admin/common/permissions';
import { useAdminUnreadCount, type BulkResult } from './hooks';

/* ------------------------------- Gestures --------------------------------- */

export { SwipeableRow } from '@/ui';
export type { SwipeAction } from '@/ui';

export interface ActionMenuItem {
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
}

/** Long-press context menu — a bottom sheet of row actions. */
export function ActionMenu({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: ActionMenuItem[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View style={{ gap: 2 }}>
        {actions.map((a) => (
          <ListRow
            key={a.label}
            title={a.label}
            icon={a.icon}
            iconTone={a.destructive ? 'danger' : 'ink'}
            destructive={a.destructive}
            chevron={false}
            last
            onPress={() => {
              onClose();
              a.onPress();
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}

/** FadeInDown stagger wrapper for list items / sections. */
export function Reveal({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 45).duration(420).springify().damping(18)} style={style}>
      {children}
    </Animated.View>
  );
}

/** Header right cluster used on admin tab screens: global search + bell. */
export function AdminHeaderActions({ dark }: { dark?: boolean }) {
  const canNotif = usePermission('notification:read');
  const unread = useAdminUnreadCount();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <IconButton icon={Search} accessibilityLabel="Search the platform" variant={dark ? 'glass' : 'surface'} onPress={() => router.push('/admin/search' as never)} />
      {canNotif ? (
        <IconButton
          icon={Bell}
          accessibilityLabel="Admin notifications"
          variant={dark ? 'glass' : 'surface'}
          badge={unread.data ? unread.data : undefined}
          onPress={() => router.push('/admin/notifications' as never)}
        />
      ) : null}
    </View>
  );
}

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * Header for the admin tab roots: operator identity (opens the workspace
 * switcher) on the left, search + notifications on the right, then the large
 * editorial title. `extra` slots more icon buttons before search.
 */
export function AdminTabHeader({ kicker, title, subtitle, extra }: { kicker?: string; title: string; subtitle?: string; extra?: ReactNode }) {
  const { user } = useAuth();
  const first = (user?.name ?? '').trim().split(/\s+/)[0] || 'Operator';
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: GUTTER, paddingTop: 6, minHeight: 46 }}>
        <PortalSwitcher
          current="admin"
          trigger={({ open }) => (
            <Touchable onPress={open} hapticOnPress scaleTo={0.96} accessibilityLabel="Switch workspace" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
              <View>
                <Avatar name={user?.name ?? 'VYRO'} size={40} tone="volt" />
                <View style={{ position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.mint, borderWidth: 2.5, borderColor: colors.bone }} />
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text variant="caption" color="ink4" numberOfLines={1}>
                  {greeting()}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text variant="h3" numberOfLines={1} style={{ fontFamily: 'Display-Bold', flexShrink: 1 }}>
                    {first}
                  </Text>
                  <ChevronDown size={15} color={colors.ink4} strokeWidth={2.2} />
                </View>
              </View>
            </Touchable>
          )}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {extra}
          <AdminHeaderActions />
        </View>
      </View>
      <View style={{ height: 12 }} />
      <ScreenHeader kicker={kicker} title={title} subtitle={subtitle} />
    </View>
  );
}

/**
 * Proportional pipeline for ink heroes: a segmented bar plus a legend row of
 * counts. Zero-value segments keep their legend slot but leave the bar.
 */
export function HeroPipeline({ segments, style }: { segments: { label: string; value: number; color: string }[]; style?: StyleProp<ViewStyle> }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <View style={[{ marginTop: 20, gap: 14 }, style]}>
      <View style={{ flexDirection: 'row', height: 8, gap: 3 }}>
        {total ? (
          segments
            .filter((x) => x.value > 0)
            .map((x) => <View key={x.label} style={{ flex: x.value, minWidth: 8, borderRadius: 4, backgroundColor: x.color }} />)
        ) : (
          <View style={{ flex: 1, borderRadius: 4, backgroundColor: 'rgba(250,247,240,0.1)' }} />
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {segments.map((x) => (
          <View key={x.label} style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: x.color }} />
              <Text variant="caption" color="paperMuted" numberOfLines={1} style={{ fontSize: 11, flexShrink: 1 }}>
                {x.label}
              </Text>
            </View>
            <Text style={{ fontFamily: 'Display-Bold', fontSize: 20, lineHeight: 24, letterSpacing: -0.6, color: x.value ? colors.paper : colors.paperFaint }} numberOfLines={1}>
              {x.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export interface GlassStat {
  label: string;
  value: number | string;
  hint?: string;
  /** Number → display string when `value` is numeric. */
  format?: (n: number) => string;
  /** Amber dot + warm figure — something here wants attention. */
  warn?: boolean;
}

/** Two-column glass panel of KPIs for ink heroes, with hairline cell dividers. */
export function GlassStats({ items, style }: { items: GlassStat[]; style?: StyleProp<ViewStyle> }) {
  const rows = Math.ceil(items.length / 2);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          marginTop: 18,
          borderRadius: radii.xl,
          borderCurve: 'continuous',
          backgroundColor: 'rgba(250,247,240,0.045)',
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.paperLine,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {items.map((it, i) => {
        const right = i % 2 === 1;
        const bottom = Math.floor(i / 2) === rows - 1;
        const fig = { fontFamily: 'Display-Bold', fontSize: 21, lineHeight: 26, letterSpacing: -0.7, color: it.warn ? colors.amberSoft : colors.paper };
        return (
          <View
            key={it.label}
            style={{
              width: '50%',
              padding: 14,
              gap: 4,
              borderColor: colors.paperLine,
              borderRightWidth: right ? 0 : StyleSheet.hairlineWidth * 2,
              borderBottomWidth: bottom ? 0 : StyleSheet.hairlineWidth * 2,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {it.warn ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} /> : null}
              <Text variant="overline" color="paperMuted" numberOfLines={1} style={{ fontSize: 10, letterSpacing: 0.8, flexShrink: 1 }}>
                {it.label}
              </Text>
            </View>
            {typeof it.value === 'number' ? (
              <CountUp value={it.value} format={it.format} style={fig} />
            ) : (
              <Text style={fig} numberOfLines={1} adjustsFontSizeToFit>
                {it.value}
              </Text>
            )}
            {it.hint ? (
              <Text variant="caption" color="paperFaint" numberOfLines={1} style={{ fontSize: 11 }}>
                {it.hint}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Ink-hero top line: glass icon tile + overline on the left, status pill on the right. */
export function HeroTopline({ icon, label, status, statusTone = 'ok' }: { icon: LucideIcon; label: string; status?: string; statusTone?: 'ok' | 'warn' | 'danger' }) {
  const tint = statusTone === 'danger' ? colors.rose : statusTone === 'warn' ? colors.amber : colors.volt;
  const bg = statusTone === 'danger' ? 'rgba(196,90,74,0.18)' : statusTone === 'warn' ? 'rgba(196,132,58,0.18)' : 'rgba(198,220,74,0.12)';
  const border = statusTone === 'danger' ? 'rgba(196,90,74,0.4)' : statusTone === 'warn' ? 'rgba(196,132,58,0.35)' : 'rgba(198,220,74,0.25)';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <IconTile icon={icon} tone="glass" size={30} />
        <Text variant="overline" color="paperMuted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      {status ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: radii.pill, backgroundColor: bg, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: border }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
          <Text variant="caption" weight="semibold" style={{ fontSize: 11.5, color: statusTone === 'ok' ? colors.voltGlow : statusTone === 'warn' ? colors.amberSoft : colors.roseSoft }} numberOfLines={1}>
            {status}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Display-weight hero figure (big money / count) with an optional caption under it. */
export function HeroFigure({ value, caption, format }: { value: number | string; caption?: string; format?: (n: number) => string }) {
  const style = { fontFamily: 'Display-Black', fontSize: 42, lineHeight: 48, letterSpacing: -1.7, color: colors.paper };
  return (
    <View style={{ marginTop: 16, gap: 2 }}>
      {typeof value === 'number' ? <CountUp value={value} format={format} style={style} /> : <Text style={style} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>}
      {caption ? (
        <Text variant="bodySm" color="paperMuted">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** Paper shortcut card — icon, label, hint and an arrow. Lay out 2–3 per row. */
export function LinkTile({ icon: Icon, label, hint, onPress, badge }: { icon: LucideIcon; label: string; hint?: string; onPress: () => void; badge?: number }) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[{ flex: 1, minWidth: 100, padding: 14, gap: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(12,14,11,0.05)' }, shadow.sm]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <IconTile icon={Icon} tone="ink" size={36} />
        {badge ? (
          <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: colors.copper, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: 'Sans-Semi', fontSize: 10.5, lineHeight: 13, color: colors.paper }}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 1 }}>
        <Text variant="bodySm" weight="semibold" numberOfLines={1}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="ink5" numberOfLines={1} style={{ fontSize: 11 }}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Touchable>
  );
}

/**
 * Grid of tappable tab tiles (icon + label + hint); the active one flips to ink.
 * `columns` controls how many sit per row.
 */
export function TileTabs<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: { value: T; label: string; hint?: string; icon: LucideIcon; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  columns?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <Touchable
            key={o.value}
            onPress={() => !on && onChange(o.value)}
            hapticOnPress
            scaleTo={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              {
                width: `${100 / columns - 4}%`,
                flexGrow: 1,
                padding: 12,
                gap: 12,
                borderRadius: radii.xl,
                borderCurve: 'continuous',
                backgroundColor: on ? colors.ink : colors.paper,
                borderWidth: 1,
                borderColor: on ? 'rgba(250,247,240,0.07)' : 'rgba(12,14,11,0.05)',
              },
              on ? shadow.ink : shadow.sm,
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.volt : colors.bone }}>
                <Icon size={16} color={colors.ink} strokeWidth={1.9} />
              </View>
              {o.badge ? (
                <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: on ? colors.volt : colors.copper, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'Sans-Semi', fontSize: 10.5, lineHeight: 13, color: on ? colors.ink : colors.paper }}>{o.badge > 99 ? '99+' : o.badge}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ gap: 1 }}>
              <Text variant="bodySm" weight="semibold" color={on ? 'paper' : 'ink'} numberOfLines={1}>
                {o.label}
              </Text>
              {o.hint ? (
                <Text variant="caption" color={on ? 'paperMuted' : 'ink5'} numberOfLines={1} style={{ fontSize: 11 }}>
                  {o.hint}
                </Text>
              ) : null}
            </View>
          </Touchable>
        );
      })}
    </View>
  );
}

/**
 * Ink identity hero for directory records: large avatar, name, type overline,
 * status chips and one-tap call / email / map actions.
 */
export function ProfileHero({
  name,
  kind,
  tone = 'volt',
  badges,
  joined,
  phone,
  email,
  place,
}: {
  name: string;
  kind: string;
  tone?: 'volt' | 'copper' | 'ink';
  badges?: ReactNode;
  joined?: string | null;
  phone?: string | null;
  email?: string | null;
  place?: string | null;
}) {
  const acts = [
    phone ? { icon: Phone, label: 'Call', href: `tel:${phone}` } : null,
    email ? { icon: Mail, label: 'Email', href: `mailto:${email}` } : null,
    place ? { icon: MapPin, label: 'Map', href: `https://maps.google.com/?q=${encodeURIComponent(place)}` } : null,
  ].filter(Boolean) as { icon: LucideIcon; label: string; href: string }[];
  return (
    <View style={[{ backgroundColor: colors.ink, borderRadius: radii['2xl'], borderCurve: 'continuous', padding: 20, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(250,247,240,0.07)' }, shadow.ink]}>
      <View style={{ padding: 4, borderRadius: 48, borderWidth: 1.5, borderColor: 'rgba(198,220,74,0.35)', marginBottom: 8 }}>
        <Avatar name={name} size={76} tone={tone} />
      </View>
      <Text variant="overline" color="volt">
        {kind}
      </Text>
      <Text variant="displaySm" color="paper" align="center" numberOfLines={2}>
        {name}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {badges}
        {joined ? (
          <Text variant="caption" color="paperFaint">
            Joined {joined}
          </Text>
        ) : null}
      </View>
      {acts.length ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' }}>
          {acts.map((a) => (
            <Touchable
              key={a.label}
              onPress={() => Linking.openURL(a.href).catch(() => {})}
              hapticOnPress
              scaleTo={0.94}
              accessibilityLabel={a.label}
              style={{ flex: 1, height: 52, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: 'rgba(250,247,240,0.07)', borderWidth: 1, borderColor: colors.paperLine }}
            >
              <a.icon size={17} color={colors.volt} strokeWidth={1.9} />
              <Text variant="caption" weight="semibold" color="paperMuted" style={{ fontSize: 11 }}>
                {a.label}
              </Text>
            </Touchable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Paper section with kicker/title header and an optional right action. */
export function Section({
  kicker,
  title,
  icon: Icon,
  action,
  children,
  kind = 'flat',
  padding = 16,
  style,
}: {
  kicker?: string;
  title?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  kind?: 'flat' | 'elevated' | 'bone' | 'copper' | 'outline';
  padding?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card kind={kind} padding={padding} radius={radii.xl} style={[{ gap: 12 }, style]}>
      {kicker || title || action ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 }}>
          {Icon ? <IconTile icon={Icon} tone="ink" size={38} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            {kicker ? <Kicker>{kicker}</Kicker> : null}
            {title ? (
              <Text variant="h2" numberOfLines={2}>
                {title}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/** Small mono pill for IDs, districts, codes. */
export function Pill({ label, tone = 'mist', icon: Icon }: { label: string; tone?: 'mist' | 'ink' | 'volt' | 'copper'; icon?: LucideIcon }) {
  const bg = tone === 'ink' ? colors.ink : tone === 'volt' ? colors.voltSoft : tone === 'copper' ? colors.copperSoft : colors.mist;
  const fg = tone === 'ink' ? colors.volt : tone === 'volt' ? colors.voltDeep : tone === 'copper' ? colors.copperDeep : colors.ink3;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
      {Icon ? <Icon size={11} color={fg} strokeWidth={2} /> : null}
      <Text style={{ fontFamily: 'Sans-Semi', fontSize: 10.5, lineHeight: 14, color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** "Load more" footer for cursor-paginated lists. */
export function LoadMore({ hasMore, loading, onPress, label = 'Load more' }: { hasMore: boolean; loading?: boolean; onPress: () => void; label?: string }) {
  if (!hasMore) return null;
  return <Button title={loading ? 'Loading…' : label} variant="secondary" size="sm" onPress={onPress} loading={loading} style={{ alignSelf: 'center', marginTop: 6 }} />;
}

/**
 * Confirm sheet with a reason textarea. Pass `minLength` to require a reason
 * (the confirm button stays disabled until it's met).
 */
export function ReasonSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading,
  minLength = 0,
  label = 'Reason',
  placeholder = 'Recorded in the audit trail…',
  optional,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  minLength?: number;
  label?: string;
  placeholder?: string;
  optional?: boolean;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!visible) setReason('');
  }, [visible]);
  const ok = reason.trim().length >= minLength;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={message}
      scroll
      footer={
        <>
          <Button title={confirmLabel} variant={variant} onPress={() => onConfirm(reason.trim())} loading={loading} disabled={!ok} full size="lg" />
          <Button title="Cancel" variant="ghost" onPress={onClose} full />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {children}
        <Field
          label={optional ? `${label} (optional)` : label}
          hint={minLength > 0 ? (ok ? 'Ready to sign' : `At least ${minLength} characters · ${reason.trim().length}/${minLength}`) : undefined}
          required={minLength > 0}
        >
          <Input value={reason} onChangeText={setReason} placeholder={placeholder} multiline />
        </Field>
      </View>
    </Sheet>
  );
}

export interface BulkAction {
  label: string;
  icon?: LucideIcon;
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * Floating ink bar shown in multi-select mode — the web's BulkActionBar.
 * Sits above the floating tab bar when `tabBar` is set.
 */
export function SelectionBar({
  count,
  actions,
  onClear,
  onSelectAll,
  tabBar,
  cap = 100,
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
  onSelectAll?: () => void;
  tabBar?: boolean;
  cap?: number;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      style={[
        {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: (tabBar ? TAB_BAR_SPACE - 18 : 12) + insets.bottom,
          backgroundColor: colors.ink,
          borderRadius: radii['3xl'],
          borderCurve: 'continuous',
          paddingVertical: 12,
          paddingHorizontal: 14,
          gap: 12,
          borderWidth: 1,
          borderColor: 'rgba(250,247,240,0.08)',
        },
        shadow.lg,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ backgroundColor: colors.volt, borderRadius: radii.pill, minWidth: 32, height: 28, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'Sans-Semi', fontSize: 13, lineHeight: 16, color: colors.ink }}>{count}</Text>
        </View>
        <Text variant="bodySm" weight="semibold" color="paper" style={{ flex: 1 }}>
          selected{count > cap ? ` · cap ${cap}` : ''}
        </Text>
        {onSelectAll ? (
          <Touchable
            onPress={onSelectAll}
            hapticOnPress
            style={{ height: 30, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: 'rgba(198,220,74,0.14)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="caption" weight="semibold" color="volt">
              Select all
            </Text>
          </Touchable>
        ) : null}
        <IconButton icon={X} accessibilityLabel="Exit selection" variant="glass" size={32} onPress={onClear} />
      </View>
      {actions.length ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {actions.map((a) => (
            <Button
              key={a.label}
              title={a.label}
              icon={a.icon}
              size="sm"
              variant={a.destructive ? 'danger' : 'outlinePaper'}
              disabled={a.disabled || count === 0 || count > cap}
              onPress={a.run}
              style={{ flexGrow: 1 }}
            />
          ))}
        </View>
      ) : (
        <Text variant="caption" color="paperMuted">
          Your role has no bulk actions here.
        </Text>
      )}
    </Animated.View>
  );
}

/** Round check used on selectable cards. */
export function SelectDot({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: on ? 0 : 1.5,
        borderColor: colors.lineStrong,
        backgroundColor: on ? colors.ink : colors.paper,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Check size={14} color={colors.volt} strokeWidth={3} /> : null}
    </View>
  );
}

export function BulkConfirmSheet({
  visible,
  count,
  action,
  onClose,
  onConfirm,
  loading,
  destructive,
  children,
}: {
  visible: boolean;
  count: number;
  action: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  destructive?: boolean;
  children?: ReactNode;
}) {
  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      title={`${action} ${count} item${count === 1 ? '' : 's'}?`}
      message="Each change is applied individually and written to the audit trail."
      confirmLabel={action}
      variant={destructive ? 'danger' : 'primary'}
    >
      {children}
    </ConfirmSheet>
  );
}

export function BulkResultSheet({ result, onClose, onRetryFailed }: { result: BulkResult | null; onClose: () => void; onRetryFailed?: (ids: string[]) => void }) {
  return (
    <Sheet
      visible={!!result}
      onClose={onClose}
      title="Bulk action complete"
      scroll
      footer={
        <>
          {onRetryFailed && result && result.failed.length ? (
            <Button title="Retry failed" variant="secondary" full onPress={() => onRetryFailed(result.failed.map((f) => f.id))} />
          ) : null}
          <Button title="Done" full size="lg" onPress={onClose} />
        </>
      }
    >
      {result ? (
        <View style={{ gap: 14 }}>
          {!result.failed.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 4 }}>
              <ConfettiBurst />
              <SuccessCheck />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Card kind="flat" padding={14} style={{ flex: 1, gap: 4, backgroundColor: colors.mintSoft }}>
              <Text variant="overline" color="ink4">Succeeded</Text>
              <Text variant="metricSm" style={{ color: colors.mint }}>{result.succeeded.length}</Text>
            </Card>
            <Card kind="flat" padding={14} style={{ flex: 1, gap: 4, backgroundColor: result.failed.length ? colors.roseSoft : colors.paper }}>
              <Text variant="overline" color="ink4">Failed</Text>
              <Text variant="metricSm" style={{ color: result.failed.length ? colors.rose : colors.ink4 }}>{result.failed.length}</Text>
            </Card>
            <Card kind="flat" padding={14} style={{ flex: 1, gap: 4 }}>
              <Text variant="overline" color="ink4">Total</Text>
              <Text variant="metricSm">{result.total}</Text>
            </Card>
          </View>
          {result.failed.map((f) => (
            <View key={f.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
              <XCircle size={14} color={colors.rose} />
              <Text variant="mono" numberOfLines={1} style={{ flex: 1 }}>
                {f.id}
              </Text>
              <Badge label={f.code} tone="danger" size="sm" />
            </View>
          ))}
          {!result.failed.length ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <CheckCircle2 size={16} color={colors.mint} />
              <Text variant="bodySm" color="ink3">
                Every item was updated.
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View />
      )}
    </Sheet>
  );
}

/** Tappable contact line (tel:/mailto:). */
export function ContactLine({ icon: Icon, value, href }: { icon: LucideIcon; value?: string | null; href?: string }) {
  if (!value) return null;
  return (
    <Touchable onPress={href ? () => Linking.openURL(href).catch(() => {}) : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
      <View style={{ width: 28, height: 28, borderRadius: 9, borderCurve: 'continuous', backgroundColor: colors.copperSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={14} color={colors.copperDeep} strokeWidth={1.8} />
      </View>
      <Text variant="bodySm" color={href ? 'ink' : 'ink3'} numberOfLines={1} style={{ flex: 1 }}>
        {value}
      </Text>
    </Touchable>
  );
}

/** Share rows as CSV through the native share sheet (the web downloads a file). */
export async function shareCsv(title: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  await Share.share({ title, message: csv });
}

/** Mono metric row inside hero cards. */
export function HeroMetric({ label, value, hint, tone = 'paper' }: { label: string; value: string; hint?: string; tone?: 'paper' | 'volt' | 'rose' }) {
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 120 }}>
      <Text variant="overline" color="paperMuted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="metricSm" style={{ color: tone === 'volt' ? colors.volt : tone === 'rose' ? colors.rose : colors.paper }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" color="paperFaint" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Native list item for admin registries: tinted icon tile, title/subtitle,
 * trailing status + mono amount, optional chips row and action footer.
 */
export function RecordCard({
  icon,
  tone = 'ink',
  leading,
  title,
  titleMono,
  subtitle,
  meta,
  status,
  amount,
  chips,
  actions,
  onPress,
  children,
  style,
}: {
  icon?: LucideIcon;
  tone?: 'ink' | 'volt' | 'copper' | 'paper' | 'danger' | 'success' | 'warning';
  leading?: ReactNode;
  title: string;
  titleMono?: boolean;
  subtitle?: string | null;
  meta?: string | null;
  status?: ReactNode;
  amount?: string | null;
  chips?: ReactNode;
  actions?: ReactNode;
  onPress?: () => void;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card kind="flat" padding={0} onPress={onPress} style={style}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {leading ?? (icon ? <IconTile icon={icon} tone={tone} size={44} /> : null)}
          <View style={{ flex: 1, gap: 3, paddingTop: 1 }}>
            <Text
              variant={titleMono ? 'mono' : 'h3'}
              style={titleMono ? { fontFamily: 'Sans-Semi', fontSize: 14.5, color: colors.ink } : { fontFamily: 'Display-Bold', letterSpacing: -0.3 }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text variant="bodySm" color="ink4" numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
            {meta ? (
              <Text variant="caption" color="ink5" numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </View>
          {status || amount ? (
            <View style={{ alignItems: 'flex-end', gap: 6, maxWidth: '42%' }}>
              {status}
              {amount ? (
                <Text style={{ fontFamily: 'Display-Bold', fontSize: 16, lineHeight: 21, letterSpacing: -0.4, color: colors.ink }} numberOfLines={1} adjustsFontSizeToFit>
                  {amount}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {chips ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{chips}</View> : null}
        {children}
      </View>
      {actions ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: colors.pearl,
            borderBottomLeftRadius: radii.xl,
            borderBottomRightRadius: radii.xl,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: colors.lineSoft,
          }}
        >
          {actions}
        </View>
      ) : null}
    </Card>
  );
}

/** Borderless pearl tile nested inside a card (sub-records, previews, notes). */
export function Inset({ children, style, dim }: { children: ReactNode; style?: StyleProp<ViewStyle>; dim?: boolean }) {
  return (
    <View style={[{ padding: 14, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl, opacity: dim ? 0.55 : 1 }, style]}>
      {children}
    </View>
  );
}
