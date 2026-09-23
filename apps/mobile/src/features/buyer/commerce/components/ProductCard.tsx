import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Clock, ShieldCheck, Store } from 'lucide-react-native';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { ProductImage, Skeleton, Text, Touchable } from '@/ui';
import { go, leadLabel, productHref } from '../data';
import type { SearchHit } from '../types';
import { AddButton, Pill, Price, SupplierStarsLine } from './kit';

/**
 * Catalog tile: inset lot photo with brand / dispatch / offers overlays and a
 * floating one-tap MOQ add, then unit, name, supplier, mono price and MOQ.
 */
export function ProductCard({
  hit,
  onAdd,
  adding,
  categoryName,
  style,
}: {
  hit: SearchHit;
  onAdd?: () => void;
  adding?: boolean;
  categoryName?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const best = hit.bestOffer;
  const lead = best?.leadTimeDays;
  return (
    <Touchable
      hapticOnPress
      scaleTo={0.97}
      onPress={() => go(productHref(hit.product.id))}
      style={[{ flex: 1, backgroundColor: colors.paper, borderRadius: radii['2xl'], borderCurve: 'continuous', padding: 6 }, shadow.card, style]}
    >
      <View>
        <ProductImage
          src={hit.product.imageUrl}
          seed={hit.product.id}
          style={{ aspectRatio: 1.05, width: '100%', borderRadius: radii.xl, borderCurve: 'continuous' }}
        />
        <View style={{ position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
          {categoryName || hit.product.brand ? <Pill tone="paper" label={categoryName ?? hit.product.brand ?? ''} /> : <View />}
          {hit.offerCount > 1 ? <Pill tone="volt" label={`${hit.offerCount} offers`} /> : null}
        </View>
        {lead !== undefined ? <Pill icon={Clock} label={leadLabel(lead, true)} tone="ink" style={{ position: 'absolute', left: 8, bottom: 8 }} /> : null}
        {best && onAdd ? (
          <View style={[{ position: 'absolute', right: 8, bottom: 8, borderRadius: 20 }, shadow.md]}>
            <AddButton onPress={onAdd} loading={adding} size={38} />
          </View>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 8, paddingTop: 10, paddingBottom: 8, gap: 5, flex: 1 }}>
        <Text variant="overline" color="copper" numberOfLines={1} style={{ fontSize: 9.5 }}>
          {hit.product.unit}
          {hit.product.packSize ? ` · ${hit.product.packSize}` : ''}
        </Text>
        <Text variant="h3" numberOfLines={2} style={{ fontSize: 14.5, lineHeight: 19, minHeight: 38 }}>
          {hit.product.name}
        </Text>
        {best ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Store size={11} color={colors.copper} />
            <Text variant="caption" color="ink4" numberOfLines={1} style={{ flex: 1 }}>
              {best.supplier.name}
            </Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ gap: 1, marginTop: 4 }}>
          {best ? (
            <>
              <Price cents={best.priceCents} size="md" />
              <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink4 }} numberOfLines={1}>
                MOQ {best.minOrderQty} · /{hit.product.unit}
              </Text>
            </>
          ) : (
            <Text variant="caption" color="amber">
              Awaiting next lot
            </Text>
          )}
        </View>
      </View>
    </Touchable>
  );
}

/** Dense ledger row — the web's table view, as a native card. */
export function ProductRow({ hit, onAdd, adding }: { hit: SearchHit; onAdd?: () => void; adding?: boolean }) {
  const best = hit.bestOffer;
  return (
    <Touchable
      hapticOnPress
      scaleTo={0.985}
      onPress={() => go(productHref(hit.product.id))}
      style={[
        { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 8, paddingRight: 12, backgroundColor: colors.paper, borderRadius: radii.xl, borderCurve: 'continuous' },
        shadow.card,
      ]}
    >
      <ProductImage src={hit.product.imageUrl} seed={hit.product.id} style={{ width: 76, height: 76, borderRadius: radii.lg, borderCurve: 'continuous' }} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="bodySm" weight="semibold" numberOfLines={1}>
          {hit.product.name}
        </Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink4 }} numberOfLines={1}>
          {hit.product.brand ? `${hit.product.brand} · ` : ''}
          {hit.product.unit}
          {hit.product.packSize ? ` · ${hit.product.packSize}` : ''}
        </Text>
        {best ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={11} color={colors.voltDeep} />
            <Text variant="caption" color="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {best.supplier.name}
            </Text>
            <SupplierStarsLine supplierId={best.supplier.id} />
          </View>
        ) : null}
        <Text variant="caption" color="ink5">
          {leadLabel(best?.leadTimeDays)} · {hit.offerCount} offer{hit.offerCount === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <Price cents={best?.priceCents ?? null} size="sm" />
        {best && onAdd ? <AddButton onPress={onAdd} loading={adding} size={34} /> : null}
      </View>
    </Touchable>
  );
}

export function ProductCardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.paper, borderRadius: radii['2xl'], borderCurve: 'continuous', padding: 6 }, shadow.card, style]}>
      <Skeleton height={150} radius={radii.xl} />
      <View style={{ padding: 8, gap: 8 }}>
        <Skeleton width="40%" height={10} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={12} />
        <Skeleton width="50%" height={18} />
      </View>
    </View>
  );
}
