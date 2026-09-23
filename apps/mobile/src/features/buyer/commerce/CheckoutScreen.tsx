import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Clock, CreditCard, FileText, Package, ShieldCheck, Store, Truck } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  IconTile,
  Input,
  ListHeader,
  ListScreen,
  ProductImage,
  Screen,
  ScreenHeader,
  SkeletonList,
  Text,
  Touchable,
  useToast,
} from '@/ui';
import { api, ApiError, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { MonoTag, Section, go } from '../orders/kit';
import { leadLabel, useCart, useRepeatOffersPreview } from './data';
import type { BusinessDetail, CartItem, CreditFacilityResponse } from './types';

const QUICK_TAGS = [
  'Forklift required at receiving dock',
  'Call 30 mins prior to delivery',
  'Morning delivery window (8 AM – 12 PM)',
  'Commercial gate pass required',
  'Lift-gate truck required',
];

type PaymentMethod = 'paynow' | 'credit';

/** Checkout — supplier-grouped PO preview + delivery notes + escrow/payment summary, per web CheckoutPage. */
export function CheckoutScreen() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const toast = useToast();
  const cart = useCart(businessId);
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paynow');
  const [creditTerms, setCreditTerms] = useState<'net14' | 'net30'>('net30');

  const creditFacility = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<CreditFacilityResponse>('/credit/facility' + qs({ businessId })),
    enabled: !!businessId,
  });

  const businessDetail = useQuery({
    queryKey: ['business-detail', businessId],
    queryFn: () => api.get<{ business: BusinessDetail }>(`/businesses/${businessId}`),
    enabled: !!businessId,
  });

  const repeatOffers = useRepeatOffersPreview(businessId);
  const repeatBySupplier = useMemo(() => new Map((repeatOffers.data?.offers ?? []).map((o) => [o.supplierId, o])), [repeatOffers.data]);

  const buyerCountry = (businessDetail.data?.business?.countryCode ?? 'LK').toUpperCase();
  const buyerKyc = businessDetail.data?.business?.kycLevel ?? 'none';
  const kycMissing = buyerCountry !== 'LK' && buyerKyc === 'none';

  const items = useMemo(() => cart.data?.items ?? [], [cart.data]);
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { supplierId: string; supplierName: string; items: CartItem[]; totalCents: number; leadTimeDays: number }
    >();
    for (const it of items) {
      const name = it.supplier.name || 'Supplier Depot';
      const entry = map.get(name) ?? { supplierId: it.supplier.id, supplierName: name, items: [], totalCents: 0, leadTimeDays: 1 };
      entry.items.push(it);
      entry.totalCents += it.lineTotalCents;
      if (it.offer?.leadTimeDays && it.offer.leadTimeDays > entry.leadTimeDays) entry.leadTimeDays = it.offer.leadTimeDays;
      map.set(name, entry);
    }
    return [...map.values()];
  }, [items]);

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ poIds: string[]; count: number }>(
        '/purchase-orders/checkout',
        {
          businessId,
          notes: notes.trim() || undefined,
          paymentMethod,
          ...(paymentMethod === 'credit' ? { creditTerms } : {}),
        },
        { idempotencyKey: true },
      ),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success(`${res.count ?? res.poIds?.length ?? 1} purchase order${(res.poIds?.length ?? 1) === 1 ? '' : 's'} issued`);
      if (res.poIds?.length === 1) go(`/buyer/order/${res.poIds[0]}`, true);
      else go('/buyer/orders', true);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'KYC_REQUIRED') {
        go(`/buyer/kyc${qs({ businessId })}`);
        return;
      }
      toast.error('Could not issue purchase orders', errorMessage(e));
    },
  });

  const subtotal = cart.data?.subtotalCents ?? 0;
  const discountTotal = cart.data?.discountTotalCents ?? 0;
  const total = cart.data?.totalCents ?? subtotal;
  const supplierCount = cart.data?.supplierCount ?? grouped.length;
  const creditAvailable = !!creditFacility.data?.eligible && (creditFacility.data?.availableCents ?? 0) >= total;

  const repeatDiscount = useMemo(() => {
    let t = 0;
    for (const g of grouped) {
      const offer = repeatBySupplier.get(g.supplierId);
      if (offer) t += Math.floor((g.totalCents * offer.percent) / 100);
    }
    return t;
  }, [grouped, repeatBySupplier]);

  const appendTag = (tag: string) => {
    if (notes.includes(tag)) return;
    setNotes((p) => (p ? `${p.trim()}\n• ${tag}` : `• ${tag}`));
  };

  if (!businessId) {
    return (
      <Screen kicker="Checkout" title="Business profile required" back>
        <EmptyState
          icon={Building2}
          title="No business profile found"
          message="You need an active business profile to issue wholesale purchase orders."
          action={{ label: 'Set up business', onPress: () => go('/onboarding/business') }}
        />
      </Screen>
    );
  }

  const header = (
    <ListHeader>
      <ScreenHeader
        kicker="PO checkout"
        title="Review & issue purchase orders"
        subtitle="Orders split automatically into official supplier POs. Funds stay in commercial escrow until delivery sign-off."
        back
      />
      {kycMissing ? (
        <Gutter>
          <Banner
            tone="warning"
            title="Cross-border KYC required"
            message={`Your business is registered in ${buyerCountry}. Cross-border orders require KYC verification before checkout.`}
            action={{ label: 'Complete KYC verification', onPress: () => go(`/buyer/kyc${qs({ businessId })}`) }}
          />
        </Gutter>
      ) : null}
    </ListHeader>
  );

  return (
    <>
      <ListScreen
        data={grouped}
        keyExtractor={(g) => g.supplierId}
        header={header}
        onRefresh={() => cart.refetch()}
        ListEmptyComponent={
          cart.isLoading ? (
            <SkeletonList rows={3} height={120} />
          ) : cart.isError ? (
            <ErrorState message={errorMessage(cart.error)} onRetry={() => cart.refetch()} />
          ) : (
            <EmptyState
              icon={Package}
              title="Your procurement cart is empty"
              message="Add wholesale products from verified suppliers before checkout."
              action={{ label: 'Browse catalog', onPress: () => go('/buyer/catalog') }}
            />
          )
        }
        ListFooterComponent={
          items.length ? (
            <View style={{ gap: 12, marginTop: 6, paddingBottom: 150 }}>
              {/* Delivery instructions */}
              <Section step={2} title="Delivery & receiving notes" sub="Appended to every purchase order issued to suppliers">
                <ChipRow
                  options={QUICK_TAGS.map((t) => ({ value: t, label: `+ ${t}` }))}
                  value=""
                  onChange={(v) => appendTag(v)}
                />
                <Input
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Dock hours, receiving contact, gate instructions, warehouse bay, forklift requirements…"
                  multiline
                  numberOfLines={4}
                />
              </Section>

              {/* Escrow explainer */}
              <Section step={3} title="Commercial escrow" sub="Protected by Vyro escrow and licensed payment gateways">
                <View style={{ gap: 10 }}>
                  {[
                    ['PO issuance', 'Suppliers receive verified POs and lock warehouse stock.'],
                    ['Flexible settlement', 'Pay online via PayHere (cards / FriMi / Genie) or bank wire.'],
                    ['Escrow release', 'Funds release only after goods are received and inspected.'],
                  ].map(([t, d], i) => (
                    <View key={t} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 11,
                          borderCurve: 'continuous',
                          backgroundColor: colors.voltSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: colors.voltDeep }}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="bodySm" weight="semibold">
                          {t}
                        </Text>
                        <Text variant="caption" color="ink4">
                          {d}
                        </Text>
                      </View>
                    </View>
                  ))}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      padding: 12,
                      marginTop: 4,
                      borderRadius: radii.lg,
                      borderCurve: 'continuous',
                      backgroundColor: colors.pearl,
                    }}
                  >
                    <CreditCard size={16} color={colors.copper} />
                    <Text variant="caption" color="ink4" style={{ flex: 1 }}>
                      PayHere Online (Visa, MasterCard, Amex) · Corporate bank wire · 256-bit TLS
                    </Text>
                  </View>
                </View>
              </Section>

              {/* Summary + payment method */}
              <Card radius={radii['2xl']} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="h2">Procurement summary</Text>
                  <MonoTag label={`${supplierCount} supplier PO${supplierCount === 1 ? '' : 's'}`} tone="ink" />
                </View>
                <SummaryRow label="Gross catalog subtotal" value={formatLKR(subtotal)} />
                {discountTotal > 0 ? <SummaryRow label="Volume bulk savings" value={`−${formatLKR(discountTotal)}`} mint /> : null}
                {repeatDiscount > 0 ? <SummaryRow label="Repeat offer discount" value={`−${formatLKR(repeatDiscount)}`} mint /> : null}
                <SummaryRow label="Vyro escrow & processing" value="Free (included)" mint />
                <SummaryRow label="Freight & logistics" value="Per depot dispatch" dim />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    padding: 14,
                    borderRadius: radii.lg,
                    borderCurve: 'continuous',
                    backgroundColor: colors.pearl,
                  }}
                >
                  <View>
                    <Text variant="overline">Total PO value</Text>
                    <Text variant="caption" color="ink4">
                      Net payable across all POs
                    </Text>
                  </View>
                  <Text variant="metricSm">{formatLKR(total)}</Text>
                </View>

                {/* Payment method */}
                <View style={{ borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 12, gap: 8 }}>
                  <Text variant="overline">Payment method</Text>
                  {creditAvailable ? (
                    <>
                      <PayOption
                        label="Pay now"
                        sub="PayHere online or bank transfer"
                        active={paymentMethod === 'paynow'}
                        onPress={() => setPaymentMethod('paynow')}
                      />
                      <PayOption
                        label="Pay on credit"
                        sub={`VYRO credit · ${formatLKR(creditFacility.data?.availableCents ?? 0)} available`}
                        active={paymentMethod === 'credit'}
                        onPress={() => setPaymentMethod('credit')}
                      />
                      {paymentMethod === 'credit' ? (
                        <ChipRow
                          options={[
                            { value: 'net14' as const, label: 'Net 14' },
                            { value: 'net30' as const, label: 'Net 30' },
                          ]}
                          value={creditTerms}
                          onChange={setCreditTerms}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Banner
                      tone="info"
                      message={`Credit unavailable: ${creditFacility.data?.reason ?? 'loading…'}`}
                      action={{ label: 'View VYRO Credit', onPress: () => go('/buyer/credit') }}
                    />
                  )}
                </View>
              </Card>
            </View>
          ) : null
        }
        renderItem={({ item: group, index }) => (
          <Card padding={14} radius={radii['2xl']} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <IconTile icon={Store} tone="ink" size={42} />
                <View style={{ flex: 1 }}>
                  <Text variant="body" weight="semibold" numberOfLines={1}>
                    {group.supplierName}
                  </Text>
                  <Text variant="caption" color="ink4">
                    {group.items.length} item{group.items.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <MonoTag label={`Draft PO #${index + 1}`} tone="ink" />
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink, marginTop: 3 }}>{formatLKR(group.totalCents)}</Text>
              </View>
            </View>
            {group.items.map((it, i) => (
              <View
                key={it.id}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: colors.lineSoft,
                }}
              >
                <ProductImage src={it.product.imageUrl} seed={it.product.name} style={{ width: 56, height: 56, borderRadius: radii.lg, borderCurve: 'continuous' }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text variant="bodySm" weight="semibold" numberOfLines={2} style={{ flex: 1 }}>
                      {it.product.name}
                    </Text>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.ink }}>{formatLKR(it.lineTotalCents)}</Text>
                  </View>
                  <Text variant="caption" color="ink4">
                    Qty {it.quantity} {it.product.unit || 'units'} · {formatLKR(it.priceCents)} / {it.product.unit || 'unit'}
                  </Text>
                  {it.discountCents > 0 && it.bestTier ? (
                    <Text variant="caption" style={{ color: colors.mint }}>
                      {it.bestTier.discountPct}% volume tier — saved {formatLKR(it.discountCents)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 14,
                height: 38,
                borderRadius: radii.pill,
                backgroundColor: colors.pearl,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Truck size={13} color={colors.mint} />
                <Text variant="caption" color="ink4">
                  Depot dock pickup & freight dispatch
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={12} color={colors.ink4} />
                <Text variant="caption" color="ink4">
                  Est. {leadLabel(group.leadTimeDays)}
                </Text>
              </View>
            </View>
          </Card>
        )}
      />
      {items.length ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 14),
            gap: 10,
            backgroundColor: colors.paper,
            borderTopLeftRadius: radii['2xl'],
            borderTopRightRadius: radii['2xl'],
            borderCurve: 'continuous',
            boxShadow: '0px -6px 26px rgba(12,14,11,0.08)',
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 4 }}>
            <View>
              <Text variant="overline" color="ink4">
                Total PO value
              </Text>
              <Text variant="caption" color="ink5">
                {supplierCount} PO{supplierCount === 1 ? '' : 's'} · {paymentMethod === 'credit' ? 'VYRO credit' : 'Pay now'}
              </Text>
            </View>
            <Text variant="metricSm" numberOfLines={1} adjustsFontSizeToFit>
              {formatLKR(total)}
            </Text>
          </View>
          <Button
            title={kycMissing ? 'KYC required before checkout' : `Confirm & issue ${supplierCount} PO${supplierCount === 1 ? '' : 's'}`}
            icon={kycMissing ? ShieldCheck : FileText}
            variant="volt"
            size="lg"
            full
            disabled={kycMissing}
            loading={submit.isPending}
            onPress={() => submit.mutate()}
          />
        </View>
      ) : null}
    </>
  );
}

function SummaryRow({ label, value, mint, dim }: { label: string; value: string; mint?: boolean; dim?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="bodySm" color="ink3" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 12.5, color: mint ? colors.mint : dim ? colors.ink4 : colors.ink }}>{value}</Text>
    </View>
  );
}

function PayOption({ label, sub, active, onPress }: { label: string; sub: string; active: boolean; onPress: () => void }) {
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: radii.xl,
          borderCurve: 'continuous',
          backgroundColor: active ? colors.paper : colors.pearl,
        },
        active ? [shadow.md, { borderWidth: 1.5, borderColor: colors.volt }] : null,
      ]}
    >
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: active ? 6 : 1.5, borderColor: active ? colors.ink : colors.lineStrong, backgroundColor: active ? colors.volt : 'transparent' }} />
      <View style={{ flex: 1 }}>
        <Text variant="bodySm" weight="semibold">
          {label}
        </Text>
        <Text variant="caption" color="ink4">
          {sub}
        </Text>
      </View>
    </Touchable>
  );
}
