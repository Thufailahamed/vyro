import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Pencil, Percent, Warehouse } from 'lucide-react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { api, errorMessage } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatLKR, humanize } from '@/lib/format';
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
  SkeletonList,
  Switch,
  Text,
  useToast,
} from '@/ui';
import { Enter, ItemCard, SummaryHero } from '@/features/supplier/ops/kit';
import { AvailabilityToggle } from '@/features/supplier/catalog/components';
import { offersKey, useCatalog, useOffers, type Offer } from '@/features/supplier/catalog/api';

/* ------------------------------ Product form ------------------------------ */

// The listing form lives with the rest of the catalog feature.
export { SupplierProductFormScreen } from '@/features/supplier/catalog/ListingFormScreen';

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
  const all = offers.data?.offers ?? [];
  const list = all.filter((o) => nameOf(o.productId).toLowerCase().includes(search.trim().toLowerCase()));
  const tiered = all.filter((o) => o.tier1DiscountPct || o.tier2DiscountPct || o.tier3DiscountPct).length;
  const maxPct = all.reduce((m, o) => Math.max(m, o.tier1DiscountPct ?? 0, o.tier2DiscountPct ?? 0, o.tier3DiscountPct ?? 0), 0);

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
      <Enter>
        <SummaryHero
          icon={Percent}
          kicker="Volume pricing"
          value={`${tiered} of ${all.length} tiered`}
          sub="Tiered listings convert better on bulk orders — discounts apply automatically at checkout."
          cells={[
            { label: 'Listings', value: all.length, dot: colors.paperFaint },
            { label: 'Tiered', value: tiered, dot: colors.volt },
            { label: 'Top discount', value: `${maxPct}%`, dot: colors.copper },
          ]}
        />
      </Enter>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search listings…" />
      {list.length === 0 ? (
        <EmptyState icon={Percent} title="No listings" message="Publish products before setting tier rules." action={{ label: 'Add product', onPress: () => router.push('/supplier/products/new' as never) }} />
      ) : (
        list.map((o, i) => (
          <Enter key={o.id} i={i}>
            <ItemCard icon={Percent} iconTone="volt" title={nameOf(o.productId)} subtitle={`MOQ ${o.minOrderQty} · ${o.leadTimeDays}d lead`} amount={formatLKR(o.priceCents)} amountSub="Base rate">
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
                    {pct ? (
                      <Text variant="caption" color="ink4" numberOfLines={1}>
                        {formatLKR(Math.round(o.priceCents * (1 - pct / 100)))}
                      </Text>
                    ) : null}
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
  const [avail, setAvail] = useState<'all' | 'in_stock' | 'low' | 'out_of_stock'>('all');
  const all = offers.data?.offers ?? [];
  const list = all.filter((o) => nameOf(o.productId).toLowerCase().includes(search.trim().toLowerCase()) && (avail === 'all' || o.availabilityStatus === avail));
  const count = (st: Offer['availabilityStatus']) => all.filter((o) => o.availabilityStatus === st).length;
  const freeUnits = all.reduce((sum, o) => sum + (o.trackInventory === false ? 0 : (o.availableQty ?? o.stockQty ?? 0)), 0);
  const toggleAvail = (st: typeof avail) => setAvail((cur) => (cur === st ? 'all' : st));

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
      <Enter>
        <SummaryHero
          icon={Warehouse}
          kicker="Free to sell"
          value={`${freeUnits.toLocaleString()} units`}
          sub={`Across ${all.length} ${all.length === 1 ? 'listing' : 'listings'} · tap a status to filter`}
          cells={[
            { label: 'In stock', value: count('in_stock'), dot: colors.mint, active: avail === 'in_stock', onPress: () => toggleAvail('in_stock') },
            { label: 'Low', value: count('low'), dot: colors.amber, active: avail === 'low', onPress: () => toggleAvail('low') },
            { label: 'Out', value: count('out_of_stock'), dot: colors.rose, active: avail === 'out_of_stock', onPress: () => toggleAvail('out_of_stock') },
          ]}
        />
      </Enter>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search listings…" />
      {list.length === 0 ? (
        <EmptyState
          icon={Package}
          title={all.length ? 'No matching listings' : 'No listings'}
          message={all.length ? 'Try another search or clear the status filter.' : 'Publish products to manage stock.'}
          action={all.length ? { label: 'Clear filters', onPress: () => { setSearch(''); setAvail('all'); } } : undefined}
        />
      ) : (
        list.map((o, i) => (
          <Enter key={o.id} i={i}>
            <ItemCard
              icon={Warehouse}
              iconTone={o.availabilityStatus === 'out_of_stock' ? 'danger' : o.availabilityStatus === 'low' ? 'warning' : 'success'}
              title={nameOf(o.productId)}
              subtitle={`${formatLKR(o.priceCents)} · MOQ ${o.minOrderQty}`}
              badge={<Badge label={humanize(o.availabilityStatus)} tone={o.availabilityStatus === 'out_of_stock' ? 'danger' : o.availabilityStatus === 'low' ? 'warning' : 'success'} dot size="sm" />}
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
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Input
                    value={qty[o.id] ?? ''}
                    onChangeText={(v) => setQty((q) => ({ ...q, [o.id]: v }))}
                    keyboardType="numbers-and-punctuation"
                    placeholder="+50 or -10"
                    containerStyle={{ flex: 1 }}
                  />
                  <Button
                    title="Apply"
                    size="md"
                    loading={adjust.isPending && adjust.variables?.id === o.id}
                    disabled={!Number(qty[o.id] ?? 0)}
                    onPress={() => adjust.mutate(o)}
                  />
                </View>
              </Field>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="bodySm" weight="semibold">
                    Track inventory
                  </Text>
                  <Text variant="caption" color="ink4">
                    Auto-mark low and out of stock from counts
                  </Text>
                </View>
                <Switch value={track[o.id] ?? o.trackInventory ?? true} onValueChange={(v) => setTrack((t) => ({ ...t, [o.id]: v }))} />
              </View>
              <AvailabilityToggle value={o.availabilityStatus} onChange={(status) => setStatus.mutate({ id: o.id, status })} disabled={setStatus.isPending} />
            </ItemCard>
          </Enter>
        ))
      )}
    </Screen>
  );
}
