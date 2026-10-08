import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, Copy, Sparkles, Store } from 'lucide-react-native';
import { IconButton, IconTile, InkHero, Kicker, Pulse, Text, Touchable } from '@/ui';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatDate, formatDateTime, formatLKR } from '@/lib/format';
import { TERMINAL, journeyIndex, statusHeadline, statusLabel } from '../orderStatus';

const NODES = ['Placed', 'Accepted', 'Packing', 'Transit', 'Received'];
/** Each node sits centred in an equal-width column, so the rail runs from the first to the last column centre. */
const RAIL_INSET = `${50 / NODES.length}%` as const;

/** Premium delivery-tracking hero: status, total and a five-node animated route. */
export function OrderHero({
  poNumber,
  status,
  totalCents,
  discountCents,
  itemCount,
  units,
  createdAt,
  supplierName,
  eta,
  onCopy,
  onSupplier,
}: {
  poNumber: string;
  status: string;
  totalCents: number;
  discountCents: number;
  itemCount: number;
  units: number;
  createdAt: number;
  supplierName?: string | null;
  eta?: number | null;
  onCopy: () => void;
  onSupplier?: () => void;
}) {
  const terminal = TERMINAL.includes(status);
  const idx = status === 'completed' ? NODES.length - 1 : journeyIndex(status);
  const target = terminal ? 0 : status === 'completed' ? 1 : idx / (NODES.length - 1);

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(180, withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [target, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const live = !terminal && status !== 'completed';
  const tint = terminal ? colors.rose : colors.volt;

  return (
    <InkHero seed={poNumber} style={{ padding: 20, borderRadius: radii['3xl'] }}>
      <View style={{ gap: 22 }}>
        {/* Top bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton
            icon={ArrowLeft}
            variant="glass"
            accessibilityLabel="Go back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/buyer/orders' as never))}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingLeft: live ? 6 : 11,
              paddingRight: 12,
              height: 30,
              borderRadius: radii.pill,
              backgroundColor: terminal ? 'rgba(196,90,74,0.18)' : 'rgba(198,220,74,0.12)',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: terminal ? 'rgba(196,90,74,0.4)' : 'rgba(198,220,74,0.3)',
            }}
          >
            {live ? <Pulse size={6} /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />}
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, letterSpacing: 1, color: terminal ? colors.roseSoft : colors.volt }}>
              {statusLabel(status).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Identity */}
        <View style={{ gap: 8 }}>
          <Kicker color="volt">Purchase order</Kicker>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text variant="displayMd" color="paper" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flex: 1 }}>
              {poNumber}
            </Text>
            <Touchable
              onPress={onCopy}
              hapticOnPress
              scaleTo={0.9}
              accessibilityRole="button"
              accessibilityLabel="Copy PO number"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                borderCurve: 'continuous',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(250,247,240,0.08)',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(250,247,240,0.14)',
              }}
            >
              <Copy size={15} color={colors.paper} strokeWidth={1.8} />
            </Touchable>
          </View>
          <Text variant="bodySm" color="paperMuted">
            {statusHeadline(status)}
            {eta && live ? ` · ETA ${formatDateTime(eta)}` : ''}
          </Text>
        </View>

        {/* Route track */}
        <View style={{ gap: 10 }}>
          <View style={{ height: 24, justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: RAIL_INSET, right: RAIL_INSET, height: 2, borderRadius: 1, backgroundColor: colors.paperLine }} />
            <View style={{ position: 'absolute', left: RAIL_INSET, right: RAIL_INSET, height: 2 }}>
              <Animated.View style={[{ height: 2, borderRadius: 1, backgroundColor: colors.volt }, fillStyle]} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              {NODES.map((n, i) => {
                const done = !terminal && (status === 'completed' || i < idx);
                const active = live && i === idx;
                return (
                  <View key={n} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    {active ? (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: 'rgba(198,220,74,0.18)',
                        }}
                      >
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.volt, borderWidth: 3, borderColor: colors.ink }} />
                      </View>
                    ) : (
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: done ? colors.volt : colors.ink2,
                          borderWidth: done ? 0 : 1.5,
                          borderColor: colors.paperLine,
                        }}
                      >
                        {done ? <Check size={10} color={colors.ink} strokeWidth={3} /> : null}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {NODES.map((n, i) => {
              const reached = !terminal && (status === 'completed' || i <= idx);
              return (
                <Text
                  key={n}
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontFamily: live && i === idx ? fonts.sansSemi : fonts.sansMedium,
                    fontSize: 10.5,
                    color: live && i === idx ? colors.volt : reached ? colors.paper : colors.paperFaint,
                  }}
                >
                  {n}
                </Text>
              );
            })}
          </View>
        </View>

        {/* Total panel */}
        <View
          style={{
            borderRadius: radii.xl,
            borderCurve: 'continuous',
            backgroundColor: 'rgba(250,247,240,0.05)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(250,247,240,0.1)',
            overflow: 'hidden',
          }}
        >
          <View style={{ padding: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="overline" color="paperFaint">
                Order total
              </Text>
              {discountCents > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Sparkles size={11} color={colors.volt} />
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.volt }}>Saved {formatLKR(discountCents)}</Text>
                </View>
              ) : null}
            </View>
            <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(totalCents)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(250,247,240,0.1)' }}>
            <HeroStat label={itemCount === 1 ? 'Line' : 'Lines'} value={String(itemCount)} />
            <HeroStat label="Units" value={units.toLocaleString()} divider />
            <HeroStat label="Placed" value={formatDate(createdAt)} divider wide />
          </View>
        </View>

        {supplierName ? (
          <Touchable
            onPress={onSupplier}
            disabled={!onSupplier}
            scaleTo={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -6 }}
          >
            <IconTile icon={Store} tone="volt" size={42} />
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="overline" color="paperFaint">
                Supplier
              </Text>
              <Text variant="h3" color="paper" numberOfLines={1}>
                {supplierName}
              </Text>
            </View>
            {onSupplier ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2,
                  height: 32,
                  paddingLeft: 12,
                  paddingRight: 8,
                  borderRadius: radii.pill,
                  backgroundColor: 'rgba(250,247,240,0.09)',
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: 'rgba(250,247,240,0.12)',
                }}
              >
                <Text variant="caption" weight="semibold" color="paper">
                  Storefront
                </Text>
                <ChevronRight size={14} color={colors.volt} />
              </View>
            ) : null}
          </Touchable>
        ) : null}
      </View>
    </InkHero>
  );
}

function HeroStat({ label, value, divider, wide }: { label: string; value: string; divider?: boolean; wide?: boolean }) {
  return (
    <View
      style={{
        flex: wide ? 1.6 : 1,
        paddingVertical: 11,
        paddingHorizontal: 14,
        gap: 2,
        borderLeftWidth: divider ? StyleSheet.hairlineWidth : 0,
        borderLeftColor: 'rgba(250,247,240,0.1)',
      }}
    >
      <Text style={{ fontFamily: fonts.sansSemi, fontSize: 9.5, letterSpacing: 1.4, color: colors.paperFaint, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.paper }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
    </View>
  );
}
