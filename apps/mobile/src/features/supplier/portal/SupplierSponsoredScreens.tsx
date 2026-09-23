import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatDate, formatLKR } from '@/lib/format';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  MenuGrid,
  MenuTile,
  Screen,
  Segmented,
  Select,
  SkeletonList,
  Stat,
  StatGrid,
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

/* ---------------------------------- Hub ---------------------------------- */

export function SupplierSponsoredHubScreen() {
  const supplierId = useSupplierId();
  const campaigns = useSponsorCampaigns(supplierId);
  const invoices = useSponsorInvoices(supplierId);
  const active = (campaigns.data ?? []).filter((c) => c.status === 'live').length;
  const pendingInvoices = (invoices.data ?? []).filter((i) => i.status === 'pending').length;

  return (
    <Screen back onRefresh={() => Promise.all([campaigns.refetch(), invoices.refetch()])} kicker="Growth" title="Sponsored" subtitle="Boost listings across search and category surfaces.">
      <StatGrid>
        <Stat label="Live campaigns" value={active} />
        <Stat label="Pending invoices" value={pendingInvoices} />
      </StatGrid>
      <MenuGrid>
        <MenuTile icon={Plus} label="Plans" hint="Slot credit bundles" onPress={() => router.push('/supplier/sponsored/plans' as never)} />
        <MenuTile icon={Megaphone} label="Subscription" hint="Current plan" onPress={() => router.push('/supplier/sponsored/subscriptions' as never)} />
        <MenuTile icon={Megaphone} label="Slots" hint="Browse surfaces" onPress={() => router.push('/supplier/sponsored/slots' as never)} />
        <MenuTile icon={Megaphone} label="Campaigns" hint="My promotions" onPress={() => router.push('/supplier/sponsored/campaigns' as never)} />
        <MenuTile icon={Megaphone} label="Invoices" hint="Billing" onPress={() => router.push('/supplier/sponsored/invoices' as never)} />
      </MenuGrid>
      <Button title="New campaign" icon={Plus} full onPress={() => router.push('/supplier/sponsored/campaigns/new' as never)} />
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
        (plans.data ?? []).map((p) => (
          <Card key={p.id} kind="flat" style={{ gap: 6 }}>
            <Text variant="h2">{p.name}</Text>
            <Text variant="caption" color="ink4">
              {p.includedSlotCredits} slot credits included
            </Text>
            <Text variant="metricSm">{formatLKR(p.monthlyRateCents)}</Text>
            <Button title="Subscribe" size="sm" disabled={!p.active || sub.isPending} onPress={() => sub.mutate(p.id)} />
          </Card>
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
        <Card kind="flat" style={{ gap: 6 }}>
          <StatusBadge status={s.status} size="sm" />
          <Text variant="body" weight="semibold">
            Plan {s.planId ?? s.id.slice(0, 8)}
          </Text>
          <Text variant="caption" color="ink4">
            {s.currentPeriodEnd ? `Renews ${formatDate(s.currentPeriodEnd)}` : 'Active'}
          </Text>
          <Button title="Cancel subscription" variant="secondary" size="sm" onPress={() => setConfirm(true)} />
        </Card>
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
        (q.data ?? []).map((s) => (
          <Card key={s.id} kind="flat" style={{ gap: 4 }}>
            <Text variant="h3">{s.label}</Text>
            <Text variant="caption" color="ink4">
              {s.surface} · Position {s.position} · {formatLKR(s.dailyRateCents)}/day
            </Text>
          </Card>
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
        (q.data ?? []).map((c) => (
          <Card key={c.id} kind="flat" style={{ gap: 6 }}>
            <StatusBadge status={c.status} size="sm" />
            <Text variant="body" weight="semibold">
              Slot {c.slotId.slice(0, 8)}
            </Text>
            <Text variant="caption" color="ink4">
              {formatDate(c.startsAt)} – {formatDate(c.endsAt)}
              {c.adminNotes ? ` · ${c.adminNotes}` : ''}
            </Text>
            {!['live', 'expired', 'rejected', 'revoked', 'cancelled'].includes(c.status) ? (
              <Button title="Cancel" variant="secondary" size="sm" onPress={() => setPending(c.id)} />
            ) : null}
          </Card>
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

  return (
    <Screen back kicker="Sponsored" title="New campaign" subtitle="Request a boosted placement." footer={<Button title={create.isPending ? 'Requesting…' : 'Request campaign'} full loading={create.isPending} disabled={!slotId} onPress={() => create.mutate()} />}>
      {slots.isLoading ? (
        <SkeletonList rows={3} />
      ) : slots.isError ? (
        <ErrorState message={errorMessage(slots.error)} onRetry={() => slots.refetch()} />
      ) : (
        <Field label="Slot" required>
          <Select value={slotId} options={(slots.data ?? []).map((s) => ({ value: s.id, label: s.label, hint: `${formatLKR(s.dailyRateCents)}/day` }))} onChange={setSlotId} placeholder="Choose a slot…" title="Slots" />
        </Field>
      )}
      <Field label="Product (optional)">
        <Select value={productId} options={(catalog.data?.products ?? []).slice(0, 100).map((p) => ({ value: p.id, label: p.name }))} onChange={setProductId} placeholder="Any product…" title="Products" />
      </Field>
      <Field label="Duration (days)">
        <Stepper value={days} onChange={setDays} min={1} max={90} />
      </Field>
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
      {(q.data ?? []).length === 0 ? (
        <EmptyState icon={Megaphone} title="No invoices" message="Campaign billing appears here." />
      ) : (
        (q.data ?? []).map((i) => (
          <Card key={i.id} kind="flat" style={{ gap: 6 }}>
            <StatusBadge status={i.status} size="sm" />
            <Text variant="metricSm">{formatLKR(i.amountCents)}</Text>
            <Text variant="caption" color="ink4">
              {formatDate(i.createdAt)}
            </Text>
            {i.status === 'pending' ? (
              <View style={{ flexDirection: 'row' }}>
                <Button title="Pay now" size="sm" loading={pay.isPending} onPress={() => pay.mutate(i.id)} />
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}
