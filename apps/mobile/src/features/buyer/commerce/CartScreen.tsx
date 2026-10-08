import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Boxes, Layers, ShieldCheck, ShoppingCart, Sparkles, Store, Trash2, Truck } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  IconButton,
  IconTile,
  InkHero,
  ListScreen,
  ListHeader,
  Gutter,
  ProductImage,
  ScreenHeader,
  SkeletonList,
  StatusBadge,
  Stepper,
  TAB_BAR_SPACE,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { MonoTag } from '../orders/kit';
import { availabilityLabel, catalogHref, go, productHref, useCart, useRepeatOffersPreview } from './data';
import type { CartItem, LineHint } from './types';

/** Cart — supplier-grouped PO drafts with MOQ-aware steppers, per web CartPage. */
export function CartScreen() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const toast = useToast();
  const cart = useCart(businessId);
  const [clearOpen, setClearOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  /** Distance from screen bottom to the dock's top edge, measured on layout. */
  const [dockTop, setDockTop] = useState(240);

  const lineHints = useQuery({
    queryKey: ['cart-line-hints', businessId],
    queryFn: () => api.get<{ hints: LineHint[] }>('/ai/cart-line-hints' + qs({ businessId })),
    enabled: !!businessId,
    staleTime: 60_000,
    retry: 0,
  });
  const hintsByItem = useMemo(() => new Map((lineHints.data?.hints ?? []).map((h) => [h.cartItemId, h])), [lineHints.data]);

  const repeatOffers = useRepeatOffersPreview(businessId);
  const repeatBySupplier = useMemo(() => new Map((repeatOffers.data?.offers ?? []).map((o) => [o.supplierId, o])), [repeatOffers.data]);

  const items = useMemo(() => cart.data?.items ?? [], [cart.data]);
  const grouped = useMemo(() => {
    const map = new Map<string, { supplier: CartItem['supplier']; lines: CartItem[] }>();
    for (const it of items) {
      const entry = map.get(it.supplier.name) ?? { supplier: it.supplier, lines: [] };
      entry.lines.push(it);
      map.set(it.supplier.name, entry);
    }
    return [...map.entries()];
  }, [items]);

  const setQty = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) => api.patch(`/cart/items/${id}`, { quantity }),
    onMutate: ({ id }) => setUpdatingId(id),
    onSettled: () => {
      setUpdatingId(null);
      void qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (e) => toast.error('Could not update quantity', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/cart/items/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Item removed');
    },
    onError: (e) => toast.error('Could not remove item', errorMessage(e)),
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      for (const it of items) await api.del(`/cart/items/${it.id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      setClearOpen(false);
      toast.success('Cart cleared');
    },
    onError: (e) => toast.error('Could not clear cart', errorMessage(e)),
  });

  const subtotal = cart.data?.subtotalCents ?? 0;
  const discountTotal = cart.data?.discountTotalCents ?? 0;
  const total = cart.data?.totalCents ?? subtotal;
  const supplierCount = cart.data?.supplierCount ?? grouped.length;
  const totalUnits = items.reduce((a, it) => a + it.quantity, 0);
  const blocked = items.filter((i) => i.quantity < i.offer.minOrderQty || (i.issues?.length ?? 0) > 0);

  const header = (
    <ListHeader>
      <View>
        <ScreenHeader
          kicker="Wholesale procurement"
          title="Your cart."
          subtitle="Check your quantities before moving to checkout. Each supplier gets a separate purchase order."
        />
        {items.length > 0 ? (
          <View style={{ position: 'absolute', right: 20, top: 0 }}>
            <IconButton icon={Trash2} variant="surface" size={40} accessibilityLabel="Clear cart" onPress={() => setClearOpen(true)} />
          </View>
        ) : null}
      </View>
      {items.length > 0 ? (
        <Gutter>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { icon: Store, value: supplierCount, label: supplierCount === 1 ? 'Supplier' : 'Suppliers' },
              { icon: Layers, value: items.length, label: items.length === 1 ? 'Line item' : 'Line items' },
              { icon: Boxes, value: totalUnits.toLocaleString(), label: 'Units' },
            ].map(({ icon: Icon, value, label }) => (
              <View
                key={label}
                style={[
                  {
                    flex: 1,
                    gap: 10,
                    padding: 12,
                    borderRadius: radii.lg + 2,
                    borderCurve: 'continuous',
                    backgroundColor: colors.paper,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.lineSoft,
                  },
                  shadow.sm,
                ]}
              >
                <View style={{ width: 26, height: 26, borderRadius: 9, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} color={colors.ink3} strokeWidth={2} />
                </View>
                <View style={{ gap: 1 }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 20, lineHeight: 24, letterSpacing: -0.8, color: colors.ink }} numberOfLines={1} adjustsFontSizeToFit>
                    {value}
                  </Text>
                  <Text variant="caption" color="ink4" numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </Gutter>
      ) : null}
      {blocked.length > 0 ? (
        <Gutter>
          <Banner
            tone="warning"
            title="Minimum order constraint"
            message={`${blocked.length} line${blocked.length === 1 ? '' : 's'} doesn't meet the supplier minimum. Adjust before issuing POs.`}
          />
        </Gutter>
      ) : null}
    </ListHeader>
  );

  return (
    <>
      <ListScreen
        tabBar
        data={grouped}
        keyExtractor={([name]) => name}
        header={header}
        onRefresh={() => cart.refetch()}
        ListEmptyComponent={
          cart.isLoading ? (
            <SkeletonList rows={4} height={140} />
          ) : cart.isError ? (
            <ErrorState message={errorMessage(cart.error)} onRetry={() => cart.refetch()} />
          ) : (
            <EmptyState
              icon={ShoppingCart}
              title="Your procurement cart is empty"
              message="Browse verified wholesale mills, compare offers by price and lead time, and add commercial supply lines."
              action={{ label: 'Browse catalog', onPress: () => go('/buyer/catalog') }}
            />
          )
        }
        ListFooterComponent={items.length > 0 ? <View style={{ height: Math.max(0, dockTop + 4 - TAB_BAR_SPACE - insets.bottom) }} /> : null}
        renderItem={({ item: [supplierName, group], index }) => (
          <SupplierGroup
            index={index}
            supplierName={supplierName}
            group={group}
            repeatOffer={repeatBySupplier.get(group.supplier.id)}
            hintsByItem={hintsByItem}
            updatingId={updatingId}
            onStep={(it, delta) => setQty.mutate({ id: it.id, quantity: Math.max(it.offer.minOrderQty, it.quantity + delta) })}
            onSet={(it, qty) => setQty.mutate({ id: it.id, quantity: Math.max(1, Math.round(qty)) })}
            onRemove={(it) => remove.mutate(it.id)}
          />
        )}
      />
      {items.length > 0 ? (
        <SummaryBar
          supplierCount={supplierCount}
          discount={discountTotal}
          total={total}
          blocked={blocked.length > 0}
          onHeight={setDockTop}
        />
      ) : null}
      <ConfirmSheet
        visible={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => clearAll.mutate()}
        title="Clear cart"
        message="Remove every line from all supplier drafts?"
        confirmLabel="Clear cart"
        variant="danger"
        loading={clearAll.isPending}
      />
    </>
  );
}

function SupplierGroup({
  index,
  supplierName,
  group,
  repeatOffer,
  hintsByItem,
  updatingId,
  onStep,
  onSet,
  onRemove,
}: {
  index: number;
  supplierName: string;
  group: { supplier: CartItem['supplier']; lines: CartItem[] };
  repeatOffer?: { percent: number };
  hintsByItem: Map<string, LineHint>;
  updatingId: string | null;
  onStep: (it: CartItem, delta: number) => void;
  onSet: (it: CartItem, qty: number) => void;
  onRemove: (it: CartItem) => void;
}) {
  const sub = group.lines.reduce((a, b) => a + b.lineTotalCents, 0);
  const maxLead = Math.max(...group.lines.map((l) => l.offer.leadTimeDays || 1));
  const supplierDiscount = group.lines.reduce((a, b) => a + (b.discountCents || 0), 0);

  return (
    <Card padding={0} radius={radii['2xl']} style={[{ backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineSoft }, shadow.card]}>
      {/* Supplier PO header */}
      <View style={{ padding: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <IconTile icon={Store} tone="ink" size={44} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="h3" style={{ fontFamily: fonts.displayBold, letterSpacing: -0.3 }} numberOfLines={2}>
              {supplierName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Truck size={12} color={colors.ink4} strokeWidth={2} />
              <Text variant="caption" color="ink4" numberOfLines={1} style={{ flexShrink: 1 }}>
                {maxLead}d lead · {[...new Set([group.supplier.city, group.supplier.district].filter(Boolean))].join(', ') || 'Sri Lanka'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: colors.copper }}>PO·{String(index + 1).padStart(2, '0')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.amber }} />
              <Text variant="caption" color="ink4">Draft</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {group.supplier.verificationStatus === 'verified' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.mintSoft, borderRadius: radii.pill, paddingLeft: 6, paddingRight: 9, paddingVertical: 3 }}>
              <BadgeCheck size={12} color={colors.mint} strokeWidth={2.2} />
              <Text style={{ fontFamily: fonts.sansSemi, fontSize: 11, color: colors.mint }}>Verified mill</Text>
            </View>
          ) : null}
          {repeatOffer ? <MonoTag label={`Repeat −${repeatOffer.percent}%`} tone="volt" /> : null}
          <Text variant="caption" color="ink5" style={{ marginLeft: 2 }}>
            {group.lines.length} {group.lines.length === 1 ? 'product' : 'products'}
          </Text>
        </View>
      </View>

      {/* Lines */}
      {group.lines.map((it) => (
        <CartLine
          key={it.id}
          item={it}
          hint={hintsByItem.get(it.id)}
          updating={updatingId === it.id}
          onStep={(d) => onStep(it, d)}
          onSet={(q) => onSet(it, q)}
          onRemove={() => onRemove(it)}
        />
      ))}

      {/* PO subtotal */}
      <View
        style={{
          gap: 8,
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: colors.pearl,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
          borderBottomLeftRadius: radii['2xl'],
          borderBottomRightRadius: radii['2xl'],
          borderCurve: 'continuous',
        }}
      >
        {supplierDiscount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Sparkles size={12} color={colors.mint} strokeWidth={2} />
              <Text variant="caption" style={{ color: colors.mint }}>Volume discount</Text>
            </View>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.mint }}>−{formatLKR(supplierDiscount)}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="overline" color="ink4">
            PO subtotal
          </Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, lineHeight: 22, letterSpacing: -0.5, color: colors.ink }}>{formatLKR(sub)}</Text>
        </View>
      </View>
    </Card>
  );
}

function CartLine({
  item: it,
  hint,
  updating,
  onStep,
  onSet,
  onRemove,
}: {
  item: CartItem;
  hint?: LineHint;
  updating: boolean;
  onStep: (delta: number) => void;
  onSet: (qty: number) => void;
  onRemove: () => void;
}) {
  const belowMoq = it.quantity < it.offer.minOrderQty;
  const gross = it.priceCents * it.quantity;
  const avail = availabilityLabel(it.offer.availabilityStatus);

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineSoft, opacity: updating ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Touchable onPress={() => go(productHref(it.product.id))} accessibilityLabel={it.product.name} scaleTo={0.95} style={[{ borderRadius: radii.lg }, shadow.sm]}>
          <ProductImage src={it.product.imageUrl} seed={it.product.id} style={{ width: 68, height: 68, borderRadius: radii.lg, borderCurve: 'continuous' }} />
        </Touchable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="body" weight="semibold" numberOfLines={2} onPress={() => go(productHref(it.product.id))} style={{ lineHeight: 20 }}>
            {it.product.name}
          </Text>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {it.product.brand ? `${it.product.brand} · ` : ''}
            <Text style={{ fontFamily: fonts.mono, fontSize: 11.5, color: colors.ink3 }}>{formatLKR(it.priceCents)}</Text>
            {` / ${it.product.unit || 'unit'}`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
            <StatusBadge status={it.offer.availabilityStatus} size="sm" label={avail.label} />
            {it.bestTier ? <MonoTag label={`−${it.bestTier.discountPct}% volume`} tone="volt" /> : null}
            {it.nextTier ? <MonoTag label={`+${it.nextTier.minQty - it.quantity} for −${it.nextTier.discountPct}%`} tone="copper" /> : null}
          </View>
        </View>
        <IconButton icon={Trash2} variant="ghost" color={colors.ink5} size={32} style={{ marginTop: -6, marginRight: -8 }} accessibilityLabel={`Remove ${it.product.name}`} onPress={onRemove} />
      </View>

      {belowMoq ? (
        <Banner tone="danger" message={`Below supplier minimum (${it.offer.minOrderQty} units)`} action={{ label: `Set to ${it.offer.minOrderQty}`, onPress: () => onSet(it.offer.minOrderQty) }} />
      ) : null}
      {(it.issues ?? []).map((issue, i) => (
        <Banner key={i} tone="danger" message={issue.message} action={issue.code === 'BELOW_MOQ' ? { label: `Set to ${it.offer.minOrderQty}`, onPress: () => onSet(it.offer.minOrderQty) } : undefined} />
      ))}
      {hint ? (
        <Banner
          tone="success"
          message={`Cheaper at ${hint.cheaperSupplierName} — save ${formatLKR(hint.savingCents)} on this line.`}
          action={{ label: 'Compare', onPress: () => go(catalogHref({ q: it.product.name })) }}
        />
      ) : null}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Stepper value={it.quantity} min={0} onChange={(v) => (v < it.offer.minOrderQty ? onSet(it.offer.minOrderQty) : onSet(v))} size="sm" />
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            {it.discountCents > 0 ? (
              <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.ink5, textDecorationLine: 'line-through' }}>{formatLKR(gross)}</Text>
            ) : (
              <Text variant="overline" color="ink5" style={{ fontSize: 9.5 }}>Line total</Text>
            )}
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, lineHeight: 22, letterSpacing: -0.6, color: colors.ink }} numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(it.lineTotalCents)}
            </Text>
            {it.discountCents > 0 ? (
              <Text style={{ fontFamily: fonts.mono, fontSize: 10.5, color: colors.mint }}>save {formatLKR(it.discountCents)}</Text>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <PresetChip label={`MOQ ${it.offer.minOrderQty}`} active={it.quantity === it.offer.minOrderQty} onPress={() => onSet(it.offer.minOrderQty)} />
          <PresetChip label="+10" onPress={() => onStep(10)} />
          <PresetChip label="+25" onPress={() => onStep(25)} />
          <PresetChip label="+50" onPress={() => onStep(50)} />
        </View>
      </View>
    </View>
  );
}

function PresetChip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Touchable
      onPress={onPress}
      hapticOnPress
      scaleTo={0.94}
      accessibilityRole="button"
      accessibilityLabel={`Quick set ${label}`}
      accessibilityState={{ selected: !!active }}
      style={{
        flex: 1,
        height: 32,
        borderRadius: radii.md,
        borderCurve: 'continuous',
        backgroundColor: active ? colors.ink : colors.pearl,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? colors.ink : colors.lineSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, color: active ? colors.volt : colors.ink3 }} numberOfLines={1}>
        {label}
      </Text>
    </Touchable>
  );
}

/** Floating tab bar geometry (see ui/TabBar.tsx) — the dock floats just above it. */
const TAB_BAR_H = 68;

function SummaryBar({
  supplierCount,
  discount,
  total,
  blocked,
  onHeight,
}: {
  supplierCount: number;
  discount: number;
  total: number;
  blocked: boolean;
  onHeight: (h: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom - 4, 12) + TAB_BAR_H + 10;
  return (
    <View style={{ position: 'absolute', left: 16, right: 16, bottom }} onLayout={(e) => onHeight(bottom + Math.ceil(e.nativeEvent.layout.height))}>
      <InkHero seed="cart-summary" style={[{ paddingVertical: 10, paddingLeft: 18, paddingRight: 10, borderRadius: radii['3xl'] }, shadow.lg]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="overline" color="paperMuted" numberOfLines={1} style={{ fontSize: 9.5 }}>
              Total · {supplierCount} PO{supplierCount === 1 ? '' : 's'}
            </Text>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 20, lineHeight: 24, letterSpacing: -0.8, color: colors.volt }} numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(total)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={11} color={colors.paperFaint} strokeWidth={2} />
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: colors.paperFaint }} numberOfLines={1}>
                {discount > 0 ? (
                  <>
                    Escrow ·<Text style={{ fontFamily: fonts.sansMedium, fontSize: 10.5, color: colors.voltGlow }}>{` save ${formatLKR(discount)}`}</Text>
                  </>
                ) : (
                  'Escrow protected'
                )}
              </Text>
            </View>
          </View>
          <Button
            title={blocked ? 'Resolve' : 'Checkout'}
            iconRight={ArrowRight}
            variant="volt"
            size="md"
            disabled={blocked}
            onPress={() => go('/buyer/checkout')}
          />
        </View>
      </InkHero>
    </View>
  );
}
