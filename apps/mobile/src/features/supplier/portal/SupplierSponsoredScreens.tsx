import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CreditCard, LayoutGrid, Layers, Megaphone, Package, Plus, Receipt, Rocket, XCircle } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatDate, formatLKR } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  ListRow,
  ListSection,
  Screen,
  Segmented,
  Select,
  SkeletonList,
  StatusBadge,
  Stepper,
  Text,
  useToast,
} from '@/ui';
import {
  useSponsorCampaigns,
  useSponsorInvoices,
  useSponsorPlans,
  useSponsorSlots,
  useSponsorSubscription,
} from './api';
import { useCatalog } from '@/features/supplier/catalog/api';
import { Enter, go, ItemCard, Section, SummaryHero } from '@/features/supplier/ops/kit';

/* ---------------------------------- Hub ---------------------------------- */

export function SupplierSponsoredHubScreen() {
  const supplierId = useSupplierId();
  const campaigns = useSponsorCampaigns(supplierId);
  const invoices = useSponsorInvoices(supplierId);
  const active = (campaigns.data ?? []).filter((c) => c.status === 'live').length;
  const pendingInvoices = (invoices.data ?? []).filter((i) => i.status === 'pending').length;

  return (
    <Screen back onRefresh={() => Promise.all([campaigns.refetch(), invoices.refetch()])} kicker="Growth" title="Sponsored" subtitle="Boost listings across search and category surfaces.">
      <Enter>
        <SummaryHero
          icon={Megaphone}
          kicker="Boost performance"
          value={active ? `${active} live ${active === 1 ? 'campaign' : 'campaigns'}` : 'No live campaigns'}
          sub="Sponsored listings appear first in buyer search and category pages."
          cells={[
            { label: 'Campaigns', value: (campaigns.data ?? []).length, dot: colors.volt },
            { label: 'Live', value: active, dot: colors.mint },
            { label: 'Unpaid', value: pendingInvoices, dot: pendingInvoices ? colors.amber : colors.paperFaint },
          ]}
        >
          <Button title="New campaign" icon={Plus} variant="volt" full onPress={() => go('/supplier/sponsored/campaigns/new')} />
        </SummaryHero>
      </Enter>
      <ListSection label="Promote">
        <ListRow icon={Rocket} iconTone="volt" title="Campaigns" subtitle="Create, pause and track promotions" onPress={() => go('/supplier/sponsored/campaigns')} />
        <ListRow icon={LayoutGrid} iconTone="volt" title="Slots" subtitle="Browse search and category surfaces" onPress={() => go('/supplier/sponsored/slots')} last />
      </ListSection>
      <ListSection label="Billing">
        <ListRow icon={Layers} iconTone="ink" title="Plans" subtitle="Monthly slot credit bundles" onPress={() => go('/supplier/sponsored/plans')} />
        <ListRow icon={BadgeCheck} iconTone="ink" title="Subscription" subtitle="Your current plan and credits" onPress={() => go('/supplier/sponsored/subscriptions')} />
        <ListRow
          icon={Receipt}
          iconTone="ink"
          title="Invoices"
          subtitle={pendingInvoices ? `${pendingInvoices} awaiting payment` : 'All settled'}
          trailing={pendingInvoices ? <Badge label={String(pendingInvoices)} tone="warning" size="sm" /> : undefined}
          onPress={() => go('/supplier/sponsored/invoices')}
          last
        />
      </ListSection>
    </Screen>
  );
}

/* ---------------------------------- Plans --------------------------------- */

export function SupplierSponsoredPlansScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const plans = useSponsorPlans();

  const sub = useMutation({
    mutationFn: (planId: string) => api.post(`/supplier/sponsored/subscriptions`, { planId, supplierId }),
    onSuccess: () => {
      toast.success('Subscribed');
      void qc.invalidateQueries({ queryKey: ['sponsored', 'subscription'] });
    },
    onError: (e) => toast.error('Could not subscribe', errorMessage(e)),
  });

  if (plans.isLoading)
    return (
      <Screen back kicker="Sponsored" title="Plans">
        <SkeletonList rows={4} />
      </Screen>
    );
  if (plans.isError)
    return (
      <Screen back kicker="Sponsored" title="Plans" onRefresh={() => plans.refetch()}>
        <ErrorState message={errorMessage(plans.error)} onRetry={() => plans.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => plans.refetch()} kicker="Sponsored" title="Plans" subtitle="Slot credit bundles billed monthly.">
      {(plans.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No plans" message="Sponsored plans appear here when published." />
      ) : (
        (plans.data ?? []).map((p, i) => (
          <Enter key={p.id} i={i}>
            <Card kind={i === 0 ? 'ink' : 'flat'} padding={18} style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon={Layers} tone={i === 0 ? 'glass' : 'volt'} size={42} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h2" color={i === 0 ? 'paper' : 'ink'}>
                    {p.name}
                  </Text>
                  <Text variant="caption" color={i === 0 ? 'paperMuted' : 'ink4'}>
                    {p.includedSlotCredits} slot credits included
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Text variant="metric" color={i === 0 ? 'paper' : 'ink'} style={{ fontSize: 30, lineHeight: 34 }}>
                  {formatLKR(p.monthlyRateCents)}
                </Text>
                <Text variant="caption" color={i === 0 ? 'paperFaint' : 'ink5'}>
                  / month
                </Text>
              </View>
              <Button title="Subscribe" variant={i === 0 ? 'volt' : 'primary'} full disabled={!p.active || sub.isPending} onPress={() => sub.mutate(p.id)} />
            </Card>
          </Enter>
        ))
      )}
    </Screen>
  );
}

/* ------------------------------ Subscriptions ----------------------------- */

export function SupplierSponsoredSubscriptionsScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useSponsorSubscription(supplierId);
  const [confirm, setConfirm] = useState(false);

  const cancel = useMutation({
    mutationFn: (id: string) => api.del(`/supplier/sponsored/subscriptions/${id}${qs({ supplierId })}`),
    onSuccess: () => {
      toast.success('Subscription cancelled');
      setConfirm(false);
      void qc.invalidateQueries({ queryKey: ['sponsored', 'subscription', supplierId] });
    },
    onError: (e) => toast.error('Could not cancel', errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <Screen back kicker="Sponsored" title="Subscription">
        <SkeletonList rows={3} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Sponsored" title="Subscription" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  const s = q.data;

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Sponsored" title="Subscription" subtitle="Your current sponsored plan.">
      {!s ? (
        <EmptyState icon={Megaphone} title="No subscription" message="Pick a plan to start boosting listings." action={{ label: 'View plans', onPress: () => router.push('/supplier/sponsored/plans' as never) }} />
      ) : (
        <>
          <Enter>
            <SummaryHero
              icon={BadgeCheck}
              kicker="Sponsored membership"
              value={`Plan ${s.planId ?? s.id.slice(0, 8)}`}
              sub={s.currentPeriodEnd ? `Renews ${formatDate(s.currentPeriodEnd)}` : 'Active — boosts run while your plan is current.'}
              right={<StatusBadge status={s.status} size="sm" />}
            >
              <Button title="Browse slots" icon={LayoutGrid} variant="volt" full onPress={() => go('/supplier/sponsored/slots')} />
            </SummaryHero>
          </Enter>
          <Button title="Cancel subscription" icon={XCircle} variant="ghost" full onPress={() => setConfirm(true)} />
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => s && cancel.mutate(s.id)}
        loading={cancel.isPending}
        variant="danger"
        confirmLabel="Cancel subscription"
        title="Cancel subscription?"
        message="Boosts stop at the end of the billing period."
      />
    </Screen>
  );
}

/* ---------------------------------- Slots --------------------------------- */

export function SupplierSponsoredSlotsScreen() {
  const supplierId = useSupplierId();
  const [surface, setSurface] = useState('search');
  const q = useSponsorSlots(supplierId, surface);

  if (q.isLoading)
    return (
      <Screen back kicker="Sponsored" title="Slots">
        <SkeletonList rows={4} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Sponsored" title="Slots" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Sponsored" title="Slots" subtitle="Available placements by surface.">
      <Segmented value={surface} onChange={setSurface} options={[{ value: 'search', label: 'Search' }, { value: 'category', label: 'Category' }, { value: 'homepage', label: 'Home' }, { value: 'storefront', label: 'Stores' }]} />
      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No slots" message="Slots open up as inventory frees." />
      ) : (
        (q.data ?? []).map((s, i) => (
          <Enter key={s.id} i={i}>
            <ItemCard
              leading={
                <View style={{ width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.volt }}>#{s.position}</Text>
                </View>
              }
              title={s.label}
              subtitle={`${s.surface} · Position ${s.position}`}
              amount={formatLKR(s.dailyRateCents)}
              amountSub="per day"
            />
          </Enter>
        ))
      )}
    </Screen>
  );
}

/* -------------------------------- Campaigns ------------------------------- */

export function SupplierSponsoredCampaignsScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useSponsorCampaigns(supplierId);
  const [pending, setPending] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: (id: string) => api.del(`/supplier/sponsored/campaigns/${id}${qs({ supplierId })}`),
    onSuccess: () => {
      toast.success('Campaign cancelled');
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['sponsored', 'campaigns', supplierId] });
    },
    onError: (e) => toast.error('Could not cancel', errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <Screen back kicker="Sponsored" title="Campaigns" footer={<Button title="New campaign" icon={Plus} full onPress={() => router.push('/supplier/sponsored/campaigns/new' as never)} />}>
        <SkeletonList rows={4} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Sponsored" title="Campaigns" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Sponsored" title="Campaigns" subtitle="Your promotions and their review state." footer={<Button title="New campaign" icon={Plus} full onPress={() => router.push('/supplier/sponsored/campaigns/new' as never)} />}>
      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No campaigns" message="Launch your first boost to win placement." action={{ label: 'New campaign', onPress: () => router.push('/supplier/sponsored/campaigns/new' as never) }} />
      ) : (
        (q.data ?? []).map((c, i) => (
          <Enter key={c.id} i={i}>
            <ItemCard
              icon={Rocket}
              iconTone={c.status === 'live' ? 'volt' : ['rejected', 'revoked'].includes(c.status) ? 'danger' : 'paper'}
              title={`Slot ${c.slotId.slice(0, 8)}`}
              subtitle={`${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}`}
              meta={c.adminNotes ?? undefined}
              badge={<StatusBadge status={c.status} size="sm" />}
            >
              {!['live', 'expired', 'rejected', 'revoked', 'cancelled'].includes(c.status) ? (
                <Button title="Cancel" icon={XCircle} variant="secondary" size="sm" full onPress={() => setPending(c.id)} />
              ) : null}
            </ItemCard>
          </Enter>
        ))
      )}
      <ConfirmSheet
        visible={!!pending}
        onClose={() => setPending(null)}
        onConfirm={() => pending && cancel.mutate(pending)}
        loading={cancel.isPending}
        variant="danger"
        confirmLabel="Cancel campaign"
        title="Cancel this campaign?"
        message="The slot is released and pending charges stop."
      />
    </Screen>
  );
}

/* ------------------------------- Campaign new ------------------------------ */

export function SupplierSponsoredCampaignFormScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const slots = useSponsorSlots(supplierId, 'search');
  const catalog = useCatalog();
  const [slotId, setSlotId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const create = useMutation({
    mutationFn: () => api.post(`/supplier/sponsored/campaigns${qs({ supplierId })}`, { slotId, productId, durationDays: days }),
    onSuccess: () => {
      toast.success('Campaign requested');
      void qc.invalidateQueries({ queryKey: ['sponsored', 'campaigns', supplierId] });
      router.back();
    },
    onError: (e) => toast.error('Could not create', errorMessage(e)),
  });

  const slot = (slots.data ?? []).find((x) => x.id === slotId);
  const estimate = slot ? slot.dailyRateCents * days : 0;

  return (
    <Screen
      back
      kicker="Sponsored"
      title="New campaign"
      subtitle="Request a boosted placement."
      footer={
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <Text variant="caption" color="ink4">
              {slot ? `${formatLKR(slot.dailyRateCents)}/day × ${days} ${days === 1 ? 'day' : 'days'}` : 'Pick a slot to see the cost'}
            </Text>
            <Text variant="h2" tabular>
              {slot ? formatLKR(estimate) : '—'}
            </Text>
          </View>
          <Button title={create.isPending ? 'Requesting…' : 'Request campaign'} full loading={create.isPending} disabled={!slotId} onPress={() => create.mutate()} />
        </>
      }
    >
      {slots.isLoading ? (
        <SkeletonList rows={3} />
      ) : slots.isError ? (
        <ErrorState message={errorMessage(slots.error)} onRetry={() => slots.refetch()} />
      ) : (
        <Section icon={LayoutGrid} kicker="Step 1" title="Placement" sub="Pick a sponsored search slot.">
          <Field label="Slot" required>
            <Select value={slotId} options={(slots.data ?? []).map((s) => ({ value: s.id, label: s.label, hint: `${formatLKR(s.dailyRateCents)}/day` }))} onChange={setSlotId} placeholder="Choose a slot…" title="Slots" />
          </Field>
        </Section>
      )}
      <Section icon={Package} kicker="Step 2" title="Product & duration">
        <Field label="Product (optional)">
          <Select value={productId} options={(catalog.data?.products ?? []).slice(0, 100).map((p) => ({ value: p.id, label: p.name }))} onChange={setProductId} placeholder="Any product…" title="Products" />
        </Field>
        <Field label="Duration (days)">
          <Stepper value={days} onChange={setDays} min={1} max={90} />
        </Field>
      </Section>
    </Screen>
  );
}

/* -------------------------------- Invoices -------------------------------- */

export function SupplierSponsoredInvoicesScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useSponsorInvoices(supplierId);

  const pay = useMutation({
    mutationFn: (id: string) => api.post(`/supplier/sponsored/invoices/${id}/pay${qs({ supplierId })}`),
    onSuccess: () => {
      toast.success('Invoice paid');
      void qc.invalidateQueries({ queryKey: ['sponsored', 'invoices', supplierId] });
    },
    onError: (e) => toast.error('Payment failed', errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <Screen back kicker="Sponsored" title="Invoices">
        <SkeletonList rows={4} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Sponsored" title="Invoices" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Sponsored" title="Invoices" subtitle="Billing for boosted placements.">
      {(q.data ?? []).length ? (
        <Enter>
          <SummaryHero
            icon={Receipt}
            kicker="Outstanding"
            value={formatLKR((q.data ?? []).filter((i) => i.status === 'pending').reduce((sum, i) => sum + i.amountCents, 0))}
            sub="Total of pending sponsored-placement invoices."
            cells={[
              { label: 'Invoices', value: (q.data ?? []).length, dot: colors.paperFaint },
              { label: 'Unpaid', value: (q.data ?? []).filter((i) => i.status === 'pending').length, dot: colors.amber },
              { label: 'Paid', value: (q.data ?? []).filter((i) => i.status === 'paid').length, dot: colors.mint },
            ]}
          />
        </Enter>
      ) : null}
      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No invoices" message="Campaign billing appears here." />
      ) : (
        (q.data ?? []).map((i, idx) => (
          <Enter key={i.id} i={idx}>
            <ItemCard
              icon={Receipt}
              iconTone={i.status === 'pending' ? 'warning' : i.status === 'paid' ? 'success' : 'paper'}
              title={`Invoice ${i.id.slice(0, 8)}`}
              subtitle={formatDate(i.createdAt)}
              badge={<StatusBadge status={i.status} size="sm" />}
              amount={formatLKR(i.amountCents)}
            >
              {i.status === 'pending' ? <Button title="Pay now" icon={CreditCard} size="sm" full loading={pay.isPending} onPress={() => pay.mutate(i.id)} /> : null}
            </ItemCard>
          </Enter>
        ))
      )}
    </Screen>
  );
}
