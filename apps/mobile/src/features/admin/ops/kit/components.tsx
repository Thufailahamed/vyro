import { useState, type ReactNode } from 'react';
import { Linking, Share, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell, Check, CheckCircle2, Search, X, XCircle, type LucideIcon } from 'lucide-react-native';
import { Badge, Button, Card, ConfirmSheet, ConfettiBurst, Field, IconButton, IconTile, Input, Kicker, ListRow, Sheet, SuccessCheck, Text, Touchable, type ButtonVariant } from '@/ui';
import { colors, radii, shadow } from '@/theme/tokens';
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
      <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 10.5, lineHeight: 14, color: fg }} numberOfLines={1}>
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
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) setReason('');
  }
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
          <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 13, lineHeight: 16, color: colors.ink }}>{count}</Text>
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
    <Card kind="flat" padding={16} onPress={onPress} style={[{ gap: 12 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {leading ?? (icon ? <IconTile icon={icon} tone={tone} size={44} /> : null)}
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            variant={titleMono ? 'mono' : 'h3'}
            style={titleMono ? { fontFamily: 'IBMPlexMono_500Medium', fontSize: 14.5, color: colors.ink } : undefined}
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
          <View style={{ alignItems: 'flex-end', gap: 5, maxWidth: '42%' }}>
            {amount ? (
              <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 14.5, letterSpacing: -0.3, color: colors.ink }} numberOfLines={1} adjustsFontSizeToFit>
                {amount}
              </Text>
            ) : null}
            {status}
          </View>
        ) : null}
      </View>
      {chips ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{chips}</View> : null}
      {children}
      {actions ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 8,
            paddingTop: 12,
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
