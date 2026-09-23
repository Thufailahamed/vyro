import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Package, Pencil, Percent, Tag, Warehouse } from 'lucide-react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { api, errorMessage } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import {
  Badge,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Screen,
  SearchBar,
  Select,
  SkeletonList,
  Stepper,
  Switch,
  Text,
  ToggleRow,
  useToast,
} from '@/ui';
import { Enter, ItemCard, Section } from '@/features/supplier/ops/kit';
import { lkrToCents, offersKey, useCatalog, useCategories, useOffers, type Offer } from '@/features/supplier/catalog/api';

/* ------------------------------ Product form ------------------------------ */

function useOfferById(offerId: string | undefined, supplierId: string | undefined) {
  const offers = useOffers(supplierId);
  return { ...offers, data: offers.data?.offers.find((o) => o.id === offerId) as Offer | undefined };
}

export function SupplierProductFormScreen({ mode }: { mode: 'new' | 'edit' }) {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const params = useLocalSearchParams<{ id?: string }>();
  const offerId = typeof params.id === 'string' ? params.id : undefined;

  const existing = useOfferById(mode === 'edit' ? offerId : undefined, supplierId);
  const catalog = useCatalog();
  const categories = useCategories();

  const [productId, setProductId] = useState('');
  const [price, setPrice] = useState('');
  const [moq, setMoq] = useState(1);
  const [lead, setLead] = useState(1);
  const [active, setActive] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const offer = existing.data;
  if (mode === 'edit' && offer && !loaded) {
    setProductId(offer.productId);
    setPrice(String(offer.priceCents / 100));
    setMoq(offer.minOrderQty);
    setLead(offer.leadTimeDays);
    setActive(offer.active);
    setLoaded(true);
  }

  const products = useMemo(() => catalog.data?.products ?? [], [catalog.data]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: p.name, hint: p.brand ?? p.unit ?? undefined })), [products]);
  const categoryHint = categories.data?.categories.length ? `${categories.data.categories.length} categories` : undefined;

  const save = useMutation({
    mutationFn: () => {
      const body = { supplierId, productId, priceCents: lkrToCents(price), minOrderQty: moq, leadTimeDays: lead, active };
      return mode === 'edit' && offerId ? api.patch(`/supplier-products/${offerId}`, body) : api.post('/supplier-products', body);
    },
    onSuccess: () => {
      toast.success(mode === 'edit' ? 'Listing updated' : 'Product listed');
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
      router.back();
    },
    onError: (e) => toast.error('Could not save', errorMessage(e)),
  });

  const ready = !!supplierId && !!productId && lkrToCents(price) > 0;

  return (
    <Screen
      back
      kicker="Catalog"
      title={mode === 'edit' ? 'Edit listing' : 'New listing'}
      subtitle={categoryHint ?? 'Publish a wholesale offer to buyers.'}
      onRefresh={() => Promise.all([catalog.refetch(), categories.refetch()])}
      footer={<Button title={save.isPending ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Publish listing'} full loading={save.isPending} disabled={!ready} onPress={() => save.mutate()} />}
    >
      {mode === 'edit' && existing.isLoading ? (
        <SkeletonList rows={4} />
      ) : mode === 'edit' && existing.isError ? (
        <ErrorState message="Could not load listing." onRetry={() => existing.refetch()} />
      ) : (
        <>
          <Section icon={Package} kicker="Step 1" title="Product" sub="Pick the verified catalog standard you supply.">
            <Field label="Catalog product" hint="Verified commodity standard." required>
              <Select value={productId || null} options={productOptions} onChange={setProductId} placeholder="Select a product…" title="Catalog product" />
            </Field>
          </Section>
          <Section icon={Tag} kicker="Step 2" title="Price & terms" sub="Mill-gate rate, minimum order and lead time.">
            <Field label="Mill-gate price (LKR)" hint="Per unit, integer cents on the API." required>
              <Input value={price} onChangeText={setPrice} placeholder="0.00" keyboardType="decimal-pad" />
            </Field>
            <Field label="Minimum order quantity">
              <Stepper value={moq} onChange={setMoq} min={1} max={100000} />
            </Field>
            <Field label="Lead time (days)">
              <Stepper value={lead} onChange={setLead} min={0} max={60} />
            </Field>
          </Section>
          <Section icon={Eye} kicker="Step 3" title="Visibility">
            <ToggleRow label="Live to buyers" description="Hidden listings keep their rates but skip checkout." value={active} onValueChange={setActive} />
          </Section>
        </>
      )}
    </Screen>
  );
}

/* --------------------------------- Pricing -------------------------------- */

export function SupplierPricingScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const offers = useOffers(supplierId);
  const catalog = useCatalog();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Offer | null>(null);
  const [tiers, setTiers] = useState({ q1: '', d1: '', q2: '', d2: '', q3: '', d3: '' });

  const nameOf = (id: string) => catalog.data?.products.find((p) => p.id === id)?.name ?? id.slice(0, 10);
  const list = (offers.data?.offers ?? []).filter((o) => nameOf(o.productId).toLowerCase().includes(search.trim().toLowerCase()));

  const save = useMutation({
    mutationFn: (o: Offer) =>
      api.patch(`/supplier-products/${o.id}`, {
        tier1MinQty: Number(tiers.q1) || undefined,
        tier1DiscountPct: Number(tiers.d1) || undefined,
        tier2MinQty: Number(tiers.q2) || undefined,
        tier2DiscountPct: Number(tiers.d2) || undefined,
        tier3MinQty: Number(tiers.q3) || undefined,
        tier3DiscountPct: Number(tiers.d3) || undefined,
      }),
    onSuccess: () => {
      toast.success('Tier rules saved');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
    },
    onError: (e) => toast.error('Could not save tiers', errorMessage(e)),
  });

  if (offers.isLoading)
    return (
      <Screen back kicker="Catalog" title="Pricing">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (offers.isError)
    return (
      <Screen back kicker="Catalog" title="Pricing" onRefresh={() => offers.refetch()}>
        <ErrorState message={errorMessage(offers.error)} onRetry={() => offers.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => Promise.all([offers.refetch(), catalog.refetch()])} kicker="Catalog" title="Pricing" subtitle="Volume tiers and MOQs per listing.">
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search listings…" />
      {list.length === 0 ? (
        <EmptyState icon={Percent} title="No listings" message="Publish products before setting tier rules." action={{ label: 'Add product', onPress: () => router.push('/supplier/products/new' as never) }} />
      ) : (
        list.map((o, i) => (
          <Enter key={o.id} i={i}>
            <ItemCard icon={Percent} iconTone="volt" title={nameOf(o.productId)} subtitle={`MOQ ${o.minOrderQty}`} amount={formatLKR(o.priceCents)} amountSub="Base rate">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(
                  [
                    ['T1', o.tier1MinQty, o.tier1DiscountPct],
                    ['T2', o.tier2MinQty, o.tier2DiscountPct],
                    ['T3', o.tier3MinQty, o.tier3DiscountPct],
                  ] as const
                ).map(([t, qn, pct]) => (
                  <View key={t} style={{ flex: 1, padding: 10, gap: 2, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: pct ? colors.voltSoft : colors.pearl }}>
                    <Text variant="overline" color={pct ? 'voltDeep' : 'ink5'} style={{ fontSize: 9.5 }}>
                      {t} · {qn ?? '—'}+
                    </Text>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: pct ? colors.ink : colors.ink5 }}>{pct ?? 0}% off</Text>
                  </View>
                ))}
              </View>
              <Button
                title="Edit tiers"
                icon={Pencil}
                variant="secondary"
                size="sm"
                full
                onPress={() => {
                  setEditing(o);
                  setTiers({
                    q1: String(o.tier1MinQty ?? ''),
                    d1: String(o.tier1DiscountPct ?? ''),
                    q2: String(o.tier2MinQty ?? ''),
                    d2: String(o.tier2DiscountPct ?? ''),
                    q3: String(o.tier3MinQty ?? ''),
                    d3: String(o.tier3DiscountPct ?? ''),
                  });
                }}
              />
            </ItemCard>
          </Enter>
        ))
      )}
      <ConfirmSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        onConfirm={() => editing && save.mutate(editing)}
        loading={save.isPending}
        confirmLabel="Save tiers"
        title={editing ? `Tiers — ${nameOf(editing.productId)}` : 'Tiers'}
        message="Volume discounts apply automatically at checkout."
      >
        <View style={{ gap: 10 }}>
          {([['q1', 'd1', 'Tier 1'], ['q2', 'd2', 'Tier 2'], ['q3', 'd3', 'Tier 3']] as const).map(([qk, dk, label]) => (
            <View key={label} style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label={`${label} min qty`}>
                  <Input value={tiers[qk]} onChangeText={(v) => setTiers((t) => ({ ...t, [qk]: v }))} keyboardType="number-pad" placeholder="100" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={`${label} off %`}>
                  <Input value={tiers[dk]} onChangeText={(v) => setTiers((t) => ({ ...t, [dk]: v }))} keyboardType="decimal-pad" placeholder="5" />
                </Field>
              </View>
            </View>
          ))}
        </View>
      </ConfirmSheet>
    </Screen>
  );
}

/* -------------------------------- Inventory ------------------------------- */

export function SupplierInventoryScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const offers = useOffers(supplierId);
  const catalog = useCatalog();
  const [search, setSearch] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [track, setTrack] = useState<Record<string, boolean>>({});

  const nameOf = (id: string) => catalog.data?.products.find((p) => p.id === id)?.name ?? id.slice(0, 10);
  const list = (offers.data?.offers ?? []).filter((o) => nameOf(o.productId).toLowerCase().includes(search.trim().toLowerCase()));

  const adjust = useMutation({
    mutationFn: (o: Offer) =>
      api.post(`/supplier-products/${o.id}/stock`, {
        qtyDelta: Number(qty[o.id] ?? 0),
        trackInventory: track[o.id] ?? o.trackInventory ?? true,
      }),
    onSuccess: () => {
      toast.success('Stock adjusted');
      setQty({});
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
    },
    onError: (e) => toast.error('Could not adjust stock', errorMessage(e)),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: 'in_stock' | 'low' | 'out_of_stock' }) => api.patch(`/supplier-products/${v.id}`, { availabilityStatus: v.status }),
    onSuccess: () => {
      toast.success('Availability updated');
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
    },
    onError: (e) => toast.error('Could not update', errorMessage(e)),
  });

  if (offers.isLoading)
    return (
      <Screen back kicker="Catalog" title="Inventory">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (offers.isError)
    return (
      <Screen back kicker="Catalog" title="Inventory" onRefresh={() => offers.refetch()}>
        <ErrorState message={errorMessage(offers.error)} onRetry={() => offers.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => Promise.all([offers.refetch(), catalog.refetch()])} kicker="Catalog" title="Inventory" subtitle="Depot allocations and availability.">
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search listings…" />
      {list.length === 0 ? (
        <EmptyState icon={Package} title="No listings" message="Publish products to manage stock." />
      ) : (
        list.map((o, i) => (
          <Enter key={o.id} i={i}>
            <ItemCard
              icon={Warehouse}
              iconTone={o.availabilityStatus === 'out_of_stock' ? 'danger' : o.availabilityStatus === 'low' ? 'warning' : 'success'}
              title={nameOf(o.productId)}
              subtitle={`${formatLKR(o.priceCents)} · MOQ ${o.minOrderQty}`}
              badge={<Badge label={o.availabilityStatus.replace(/_/g, ' ')} tone={o.availabilityStatus === 'out_of_stock' ? 'danger' : o.availabilityStatus === 'low' ? 'warning' : 'success'} dot size="sm" />}
            >
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(
                  [
                    ['On hand', o.stockQty ?? 0],
                    ['Reserved', o.reservedQty ?? 0],
                    ['Free', o.availableQty ?? o.stockQty ?? 0],
                  ] as const
                ).map(([l, v]) => (
                  <View key={l} style={{ flex: 1, padding: 10, gap: 2, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
                    <Text variant="overline" color="ink5" style={{ fontSize: 9.5 }}>
                      {l}
                    </Text>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, lineHeight: 21, color: colors.ink }}>{String(v)}</Text>
                  </View>
                ))}
              </View>
              <Field label="Adjust quantity (+/-)">
                <Input value={qty[o.id] ?? ''} onChangeText={(v) => setQty((q) => ({ ...q, [o.id]: v }))} keyboardType="numbers-and-punctuation" placeholder="+50" />
              </Field>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text variant="bodySm" weight="medium" color="ink3">
                  Track inventory
                </Text>
                <Switch value={track[o.id] ?? o.trackInventory ?? true} onValueChange={(v) => setTrack((t) => ({ ...t, [o.id]: v }))} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Adjust" icon={Warehouse} size="sm" loading={adjust.isPending} onPress={() => adjust.mutate(o)} style={{ flex: 1 }} />
                <Button title="In stock" variant="secondary" size="sm" onPress={() => setStatus.mutate({ id: o.id, status: 'in_stock' })} />
                <Button title="Out" variant="secondary" size="sm" onPress={() => setStatus.mutate({ id: o.id, status: 'out_of_stock' })} />
              </View>
            </ItemCard>
          </Enter>
        ))
      )}
    </Screen>
  );
}
