import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { ArrowLeft, ChevronRight, Copy, Sparkles, Store } from 'lucide-react-native';
import { IconButton, IconTile, InkHero, Kicker, Pulse, Text, Touchable } from '@/ui';
import { colors, fonts, radii } from '@/theme/tokens';
import { formatDate, formatDateTime, formatLKR } from '@/lib/format';
import { TERMINAL, journeyIndex, statusHeadline, statusLabel } from '../orderStatus';

const NODES = ['Placed', 'Accepted', 'Packing', 'Transit', 'Received'];

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

  return (
    <InkHero seed={poNumber} style={{ padding: 18, borderRadius: radii['3xl'] }}>
      <View style={{ gap: 20 }}>
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
              paddingHorizontal: 11,
              height: 30,
              borderRadius: radii.pill,
              backgroundColor: terminal ? 'rgba(196,90,74,0.22)' : 'rgba(198,220,74,0.14)',
            }}
          >
            {live ? <Pulse size={6} /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: terminal ? colors.rose : colors.volt }} />}
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.6, color: terminal ? colors.roseSoft : colors.volt }}>
              {statusLabel(status).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Touchable onPress={onCopy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }} scaleTo={0.96}>
            <Kicker color="volt">Purchase order</Kicker>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.paperMuted }}>· tap to copy</Text>
            <Copy size={11} color={colors.paperMuted} />
          </Touchable>
          <Text variant="displayMd" color="paper" numberOfLines={1} adjustsFontSizeToFit>
            {poNumber}
          </Text>
          <Text variant="bodySm" color="paperMuted">
            {statusHeadline(status)}
            {eta && live ? ` · ETA ${formatDateTime(eta)}` : ''}
          </Text>
        </View>

        {/* Route track */}
        <View style={{ gap: 10 }}>
          <View style={{ height: 22, justifyContent: 'center' }}>
            <View style={{ position: 'absolute', left: 6, right: 6, height: 2, borderRadius: 1, backgroundColor: colors.paperLine }} />
            <View style={{ position: 'absolute', left: 6, right: 6, height: 2 }}>
              <Animated.View style={[{ height: 2, borderRadius: 1, backgroundColor: colors.volt }, fillStyle]} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {NODES.map((n, i) => {
                const done = !terminal && (status === 'completed' || i < idx);
                const active = !terminal && status !== 'completed' && i === idx;
                return (
                  <View
                    key={n}
                    style={{
                      width: active ? 14 : 12,
                      height: active ? 14 : 12,
                      borderRadius: 7,
                      backgroundColor: done ? colors.volt : active ? colors.ink : colors.ink2,
                      borderWidth: active ? 3 : 1.5,
                      borderColor: done || active ? colors.volt : colors.paperLine,
                    }}
                  />
                );
              })}
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {NODES.map((n, i) => (
              <Text
                key={n}
                style={{
                  fontFamily: fonts.sansMedium,
                  fontSize: 10,
                  color: !terminal && (status === 'completed' || i <= idx) ? colors.paper : colors.paperFaint,
                  width: 56,
                  textAlign: i === 0 ? 'left' : i === NODES.length - 1 ? 'right' : 'center',
                  marginLeft: i === 0 ? 0 : -12,
                  marginRight: i === NODES.length - 1 ? 0 : -12,
                }}
              >
                {n}
              </Text>
            ))}
          </View>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: colors.paperLine,
            paddingTop: 14,
            gap: 12,
          }}
        >
          <View style={{ gap: 4, flex: 1 }}>
            <Text variant="overline" color="paperFaint">
              Order total
            </Text>
            <Text variant="metricSm" color="paper" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(totalCents)}
            </Text>
            <Text variant="caption" color="paperMuted">
              {itemCount} line{itemCount === 1 ? '' : 's'} · {units.toLocaleString()} units · {formatDate(createdAt)}
            </Text>
          </View>
          {discountCents > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(198,220,74,0.14)', borderRadius: radii.pill, paddingHorizontal: 10, height: 28 }}>
              <Sparkles size={12} color={colors.volt} />
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.volt }}>−{formatLKR(discountCents)}</Text>
            </View>
          ) : null}
        </View>

        {supplierName ? (
          <Touchable
            onPress={onSupplier}
            disabled={!onSupplier}
            scaleTo={0.98}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: 'rgba(250,247,240,0.07)',
              borderRadius: radii.xl,
              borderCurve: 'continuous',
              padding: 12,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(250,247,240,0.1)',
            }}
          >
            <IconTile icon={Store} tone="volt" size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="overline" color="paperFaint">
                Supplier
              </Text>
              <Text variant="body" weight="semibold" color="paper" numberOfLines={1}>
                {supplierName}
              </Text>
            </View>
            {onSupplier ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, paddingLeft: 10, paddingRight: 6, borderRadius: radii.pill, backgroundColor: 'rgba(250,247,240,0.09)' }}>
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
