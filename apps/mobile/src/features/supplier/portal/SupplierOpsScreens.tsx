import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Landmark, PackageCheck, Plus, Trash2, TriangleAlert, Truck, Wallet } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatDate, formatDateTime, formatLKR, humanize } from '@/lib/format';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChipRow,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  KeyValue,
  ListRow,
  ListSection,
  Screen,
  SearchBar,
  Segmented,
  SkeletonList,
  Stat,
  StatGrid,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Enter, FooterLink, ItemCard, LedgerPill, Section } from '@/features/supplier/ops/kit';
import { settledRevenue, useSupplierBalance, useSupplierDeliveries, useSupplierPayments, useSupplierPayouts } from './api';
import { usePurchaseOrders } from '@/features/supplier/ops/api';

/* ------------------------------- Deliveries ------------------------------- */

type DFilter = 'all' | 'pending' | 'active' | 'delivered' | 'failed';

export function SupplierDeliveriesScreen() {
  const supplierId = useSupplierId();
  const [filter, setFilter] = useState<DFilter>('all');
  const [search, setSearch] = useState('');
  const q = useSupplierDeliveries(supplierId, 'all');

  const all = useMemo(() => q.data?.items ?? [], [q.data]);
  const shown = useMemo(() => {
    let list = all;
    if (filter === 'pending') list = list.filter((d) => d.status === 'pending');
    if (filter === 'active') list = list.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status));
    if (filter === 'delivered') list = list.filter((d) => d.status === 'delivered');
    if (filter === 'failed') list = list.filter((d) => d.status === 'failed');
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((d) => d.id.toLowerCase().includes(t) || d.purchaseOrderId.toLowerCase().includes(t) || (d.driverName ?? '').toLowerCase().includes(t));
    return list;
  }, [all, filter, search]);

  const pending = all.filter((d) => d.status === 'pending').length;
  const active = all.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status)).length;
  const done = all.filter((d) => d.status === 'delivered').length;

  if (q.isLoading)
    return (
      <Screen back kicker="Fulfilment" title="Deliveries">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Fulfilment" title="Deliveries" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Fulfilment" title="Deliveries" subtitle="Fleet tracking and proof of delivery.">
      <StatGrid>
        <Stat label="Pending" value={pending} hint="Awaiting driver" icon={Clock} />
        <Stat label="In transit" value={active} hint="En route" icon={Truck} accent={active > 0} />
        <Stat label="Delivered" value={done} hint="eGRN signed" icon={PackageCheck} />
      </StatGrid>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search delivery, PO or driver…" />
      <ChipRow<DFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: all.length },
          { value: 'pending', label: 'Pending', count: pending },
          { value: 'active', label: 'In transit', count: active },
          { value: 'delivered', label: 'Delivered', count: done },
          { value: 'failed', label: 'Failed', count: all.filter((d) => d.status === 'failed').length },
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState icon={Truck} title="No deliveries" message="Delivery records appear once orders are dispatched." />
      ) : (
        shown.map((d, i) => (
          <Enter key={d.id} i={i}>
            <ItemCard
              icon={d.status === 'delivered' ? PackageCheck : d.status === 'failed' ? TriangleAlert : Truck}
              iconTone={d.status === 'delivered' ? 'success' : d.status === 'failed' ? 'danger' : d.status === 'pending' ? 'warning' : 'ink'}
              title={d.driverName ?? 'Unassigned driver'}
              subtitle={`PO ${d.purchaseOrderId.slice(0, 12)} · ETA ${d.estimatedAt ? formatDate(d.estimatedAt) : '—'}`}
              meta={d.deliveredAt ? `Delivered ${formatDate(d.deliveredAt)}` : undefined}
              badge={<StatusBadge status={d.status} size="sm" />}
              footer={
                <>
                  <Text variant="caption" color="ink5" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {d.id.slice(0, 12)}
                  </Text>
                  <FooterLink label="Open order" onPress={() => router.push(`/supplier/order/${d.purchaseOrderId}` as never)} />
                </>
              }
            />
          </Enter>
        ))
      )}
    </Screen>
  );
}

/* -------------------------------- Payments -------------------------------- */

export function SupplierPaymentsScreen() {
  const supplierId = useSupplierId();
  const toast = useToast();
  const [tab, setTab] = useState<'payments' | 'payouts'>('payments');
  const payments = useSupplierPayments(supplierId);
  const payouts = useSupplierPayouts(supplierId, tab === 'payouts');
  const balance = useSupplierBalance(supplierId);

  const list = payments.data?.items ?? [];
  const revenue = settledRevenue(list);

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/confirm`, { status: 'confirmed' }),
    onSuccess: () => {
      toast.success('Payment confirmed');
      void payments.refetch();
    },
    onError: (e) => toast.error('Could not confirm', errorMessage(e)),
  });

  const refresh = () => Promise.all([payments.refetch(), payouts.refetch(), balance.refetch()]);

  if (payments.isLoading)
    return (
      <Screen back kicker="Money" title="Payments">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (payments.isError)
    return (
      <Screen back kicker="Money" title="Payments" onRefresh={refresh}>
        <ErrorState message={errorMessage(payments.error)} onRetry={() => payments.refetch()} />
      </Screen>
    );

  return (
    <Screen back onRefresh={refresh} kicker="Money" title="Payments" subtitle="Escrow settlements and bank payouts.">
      <StatGrid>
        <Stat label="Settled revenue" value={formatLKR(revenue)} hint={`${list.length} payments`} icon={Wallet} accent />
        <Stat label="Ledger balance" value={formatLKR(balance.data?.balanceCents ?? 0)} hint="Supplier account" icon={Landmark} />
      </StatGrid>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'payments', label: 'Payments' }, { value: 'payouts', label: 'Payouts' }]} />
      {tab === 'payments' ? (
        list.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" message="Settlements land here when buyers pay and receive goods." />
        ) : (
          list.map((p, i) => (
            <Enter key={p.id} i={i}>
              <ItemCard
                icon={Wallet}
                iconTone={['confirmed', 'paid', 'completed', 'settled'].includes(p.status) ? 'success' : 'copper'}
                title={humanize(p.method)}
                subtitle={`Net ${formatLKR(p.netCents)} · fee ${formatLKR(p.feeCents)}`}
                meta={formatDateTime(p.createdAt)}
                badge={<LedgerPill status={p.status} size="sm" />}
                amount={formatLKR(p.amountCents)}
              >
                {['pending', 'authorized', 'processing'].includes(p.status) ? (
                  <Button title="Confirm receipt" icon={CheckCircle2} size="sm" full onPress={() => confirm.mutate(p.id)} loading={confirm.isPending} />
                ) : null}
              </ItemCard>
            </Enter>
          ))
        )
      ) : payouts.isLoading ? (
        <SkeletonList rows={4} />
      ) : payouts.isError ? (
        <ErrorState message={errorMessage(payouts.error)} onRetry={() => payouts.refetch()} />
      ) : (payouts.data?.items ?? []).length === 0 ? (
        <EmptyState icon={Landmark} title="No payouts yet" message="Bank payouts are issued on settlement cycles." />
      ) : (
        (payouts.data?.items ?? []).map((p, i) => (
          <Enter key={p.id} i={i}>
            <ItemCard
              icon={Landmark}
              iconTone="ink"
              title={p.reference ?? p.payoutNumber ?? p.id.slice(0, 10)}
              subtitle={humanize(p.method)}
              meta={formatDateTime(p.createdAt)}
              badge={<LedgerPill status={p.status} size="sm" />}
              amount={formatLKR(p.netCents)}
            />
          </Enter>
        ))
      )}
    </Screen>
  );
}

/* -------------------------------- Accounts -------------------------------- */

type BankAccount = { id: string; bankName: string; accountNo: string; branch?: string | null; holder?: string | null; verified?: boolean };

export function SupplierAccountsScreen() {
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ bankName: '', accountNo: '', branch: '', holder: '' });
  const [pendingDelete, setPendingDelete] = useState<BankAccount | null>(null);

  const overview = useQuery({
    queryKey: ['supplier', supplierId, 'finance-overview'],
    queryFn: () => api.get<{ balanceCents?: number; pendingCents?: number }>(`/finance/supplier/overview${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
  const accounts = useQuery({
    queryKey: ['supplier', supplierId, 'bank-accounts'],
    queryFn: () => api.get<{ accounts: BankAccount[] }>(`/finance/supplier/bank-accounts${qs({ supplierId })}`),
    enabled: !!supplierId,
  });
  const orders = usePurchaseOrders(supplierId ?? '');

  const add = useMutation({
    mutationFn: () => api.post('/finance/supplier/bank-accounts', { supplierId, bankName: form.bankName, accountNo: form.accountNo, branch: form.branch || undefined, holder: form.holder || undefined }),
    onSuccess: () => {
      toast.success('Bank account added');
      setForm({ bankName: '', accountNo: '', branch: '', holder: '' });
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'bank-accounts'] });
    },
    onError: (e) => toast.error('Could not add account', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/finance/supplier/bank-accounts/${id}${qs({ supplierId })}`),
    onSuccess: () => {
      toast.success('Account removed');
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'bank-accounts'] });
    },
    onError: (e) => toast.error('Could not remove', errorMessage(e)),
  });

  const refresh = () => Promise.all([overview.refetch(), accounts.refetch(), orders.refetch()]);

  if (accounts.isLoading)
    return (
      <Screen back kicker="Money" title="Accounts">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (accounts.isError)
    return (
      <Screen back kicker="Money" title="Accounts" onRefresh={refresh}>
        <ErrorState message={errorMessage(accounts.error)} onRetry={() => accounts.refetch()} />
      </Screen>
    );

  const list = accounts.data?.accounts ?? [];

  return (
    <Screen back onRefresh={refresh} kicker="Money" title="Accounts" subtitle="Settlement ledger and payout destinations.">
      <StatGrid>
        <Stat label="Balance" value={formatLKR(overview.data?.balanceCents ?? 0)} icon={Landmark} accent />
        <Stat label="Pending" value={formatLKR(overview.data?.pendingCents ?? 0)} icon={Wallet} />
      </StatGrid>
      <Banner tone="info" title="Payouts go to a verified bank account" message="Add your commercial settlement account below." />
      {list.length === 0 ? (
        <EmptyState icon={Landmark} title="No bank accounts" message="Link a settlement account to receive payouts." />
      ) : (
        <ListSection label="Payout destinations">
          {list.map((a, i) => (
            <ListRow
              key={a.id}
              icon={Landmark}
              iconTone={a.verified ? 'volt' : 'paper'}
              title={a.bankName}
              subtitle={`${a.accountNo}${a.branch ? ` · ${a.branch}` : ''}`}
              meta={a.holder ?? undefined}
              trailing={
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Badge label={a.verified ? 'Verified' : 'Unverified'} tone={a.verified ? 'success' : 'neutral'} dot size="sm" />
                  <IconButton icon={Trash2} accessibilityLabel={`Remove ${a.bankName}`} variant="surface" color={colors.rose} size={32} onPress={() => setPendingDelete(a)} />
                </View>
              }
              last={i === list.length - 1}
            />
          ))}
        </ListSection>
      )}
      <Section icon={Plus} kicker="Settlement" title="Add bank account" sub="Payouts are sent to verified commercial accounts.">
        <Field label="Bank name" required>
          <Input value={form.bankName} onChangeText={(v) => setForm((f) => ({ ...f, bankName: v }))} placeholder="Bank of Ceylon" />
        </Field>
        <Field label="Account number" required>
          <Input value={form.accountNo} onChangeText={(v) => setForm((f) => ({ ...f, accountNo: v }))} placeholder="1234567890" keyboardType="number-pad" />
        </Field>
        <Field label="Branch">
          <Input value={form.branch} onChangeText={(v) => setForm((f) => ({ ...f, branch: v }))} placeholder="Colombo 03" />
        </Field>
        <Field label="Account holder">
          <Input value={form.holder} onChangeText={(v) => setForm((f) => ({ ...f, holder: v }))} placeholder="Company (Pvt) Ltd" />
        </Field>
        <Button title="Add account" icon={Plus} full loading={add.isPending} onPress={() => add.mutate()} />
      </Section>
      <Card kind="flat" padding={0} style={{ paddingHorizontal: 16, paddingVertical: 2 }}>
        <KeyValue label="Open orders" value={String(orders.data?.orders.length ?? 0)} mono last />
      </Card>
      <ConfirmSheet
        visible={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        loading={remove.isPending}
        variant="danger"
        confirmLabel="Remove account"
        title="Remove this account?"
        message={pendingDelete ? `${pendingDelete.bankName} · ${pendingDelete.accountNo}` : undefined}
      />
    </Screen>
  );
}
