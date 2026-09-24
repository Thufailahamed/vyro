import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  Landmark,
  RefreshCw,
  Scale,
} from 'lucide-react-native';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  Input,
  Screen,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatLKR, timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { Section } from '../../buyer/orders/kit';
import { go } from '@/features/admin/platform/kit';
import { usePermission } from '@/features/admin/common/permissions';
import { ExportButton } from '@/features/admin/money/accounts/shared';

type Tab = 'payments' | 'refunds' | 'bank' | 'settlements' | 'payouts' | 'recon';
const TABS: { value: Tab; label: string }[] = [
  { value: 'payments', label: 'Payments' },
  { value: 'refunds', label: 'Refunds' },
  { value: 'bank', label: 'Bank' },
  { value: 'settlements', label: 'Settlements' },
  { value: 'payouts', label: 'Payouts' },
  { value: 'recon', label: 'Recon' },
];

/** /admin/accounts — condensed financial operations console (web AdminAccountsPage). */
export function AdminAccountsScreen() {
  const [tab, setTab] = useState<Tab>('payments');
  const canReport = usePermission('financial_report:read');
  return (
    <Screen
      back
      kicker="Treasury"
      title="Accounts"
      subtitle="Payment records, refunds, transfers, settlements and reconciliation."
      gap={14}
    >
      <View style={{ gap: 14 }}>
        <ChipRow options={TABS} value={tab} onChange={setTab} />
        {tab === 'payments' ? <PaymentsTab /> : null}
        {tab === 'refunds' ? <RefundsTab /> : null}
        {tab === 'bank' ? <BankTab /> : null}
        {tab === 'settlements' ? <SettlementsTab /> : null}
        {tab === 'payouts' ? <PayoutsTab /> : null}
        {tab === 'recon' ? <ReconTab /> : null}
        {canReport ? (
          <Section kicker="Reports" title="CSV exports" icon={FileSpreadsheet}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ExportButton
                title="Payments"
                icon={Download}
                path="/admin/finance/exports/payments.csv"
                fileName="payments.csv"
                full
              />
              <ExportButton
                title="Ledger"
                icon={Download}
                path="/admin/finance/exports/ledger.csv"
                fileName="ledger.csv"
                full
              />
            </View>
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}

function Row({
  title,
  sub,
  amount,
  status,
  right,
  onPress,
}: {
  title: string;
  sub?: string;
  amount?: number | null;
  status?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Card kind="flat" padding={16} onPress={onPress} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon={CircleDollarSign} tone="paper" size={40} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {title}
          </Text>
          {sub ? (
            <Text variant="caption" color="ink5" numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          {amount != null ? (
            <Text
              style={{
                fontFamily: fonts.monoMedium,
                fontSize: 14.5,
                letterSpacing: -0.3,
                color: colors.ink,
              }}
            >
              {formatLKR(amount)}
            </Text>
          ) : null}
          {status ? <StatusBadge status={status} size="sm" /> : null}
        </View>
      </View>
      {right ? (
        <View
          style={{
            paddingTop: 12,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: colors.lineSoft,
          }}
        >
          {right}
        </View>
      ) : null}
    </Card>
  );
}

function QueryBlock({
  loading,
  error,
  retry,
  empty,
  children,
}: {
  loading: boolean;
  error: unknown;
  retry: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading) return <SkeletonList rows={4} height={70} />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={retry} />;
  if (empty) return <EmptyState icon={CircleDollarSign} title="Nothing here" />;
  return <View style={{ gap: 10 }}>{children}</View>;
}

function PaymentsTab() {
  const q = useQuery({
    queryKey: ['admin-acc-payments'],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          paymentNumber: string | null;
          method: string;
          status: string;
          amountCents: number;
          purchaseOrderId: string;
          createdAt: number;
        }[];
      }>('/admin/finance/payments?limit=50'),
  });
  const items = q.data?.items ?? [];
  return (
    <QueryBlock
      loading={q.isLoading}
      error={q.isError ? q.error : null}
      retry={() => q.refetch()}
      empty={!items.length}
    >
      {items.map((p) => (
        <Row
          key={p.id}
          title={p.paymentNumber ?? p.id.slice(0, 12)}
          sub={`${p.method} · ${timeAgo(p.createdAt)}`}
          amount={p.amountCents}
          status={p.status}
          onPress={() => go(`/admin/accounts/payments/${p.id}`)}
        />
      ))}
    </QueryBlock>
  );
}

function RefundsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['admin-acc-refunds'],
    queryFn: () =>
      api.get<{
        refunds: {
          id: string;
          refundNumber: string | null;
          paymentId: string;
          amountCents: number;
          status: string;
          reason: string | null;
          createdAt: number;
        }[];
      }>('/admin/finance/refunds'),
  });
  const act = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'approve' | 'reject' | 'fail' | 'complete';
    }) =>
      api.post(
        `/admin/finance/refunds/${id}/${action}`,
        action === 'reject' || action === 'fail' ? { reason: 'Reviewed by finance' } : {},
      ),
    onSuccess: () => {
      toast.success('Refund updated');
      qc.invalidateQueries({ queryKey: ['admin-acc-refunds'] });
    },
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const rows = q.data?.refunds ?? [];
  return (
    <QueryBlock
      loading={q.isLoading}
      error={q.isError ? q.error : null}
      retry={() => q.refetch()}
      empty={!rows.length}
    >
      {rows.map((r) => (
        <Row
          key={r.id}
          title={r.refundNumber ?? r.id.slice(0, 12)}
          sub={`${r.reason ?? 'no reason'} · ${timeAgo(r.createdAt)}`}
          amount={r.amountCents}
          status={r.status}
          right={
            r.status === 'pending' || r.status === 'requested' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Approve"
                  size="sm"
                  variant="secondary"
                  onPress={() => act.mutate({ id: r.id, action: 'approve' })}
                />
                <Button
                  title="Reject"
                  size="sm"
                  variant="danger"
                  onPress={() => act.mutate({ id: r.id, action: 'reject' })}
                />
              </View>
            ) : r.status === 'approved' ? (
              <Button
                title="Mark complete"
                size="sm"
                variant="secondary"
                onPress={() => act.mutate({ id: r.id, action: 'complete' })}
              />
            ) : undefined
          }
        />
      ))}
    </QueryBlock>
  );
}

function BankTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [verifyFor, setVerifyFor] = useState<{ id: string } | null>(null);
  const [cents, setCents] = useState('');
  const [ref, setRef] = useState('');
  const q = useQuery({
    queryKey: ['admin-acc-bank'],
    queryFn: () =>
      api.get<{
        transfers: {
          id: string;
          paymentId: string;
          referenceNumber: string;
          expectedCents: number;
          transferredCents: number | null;
          verifiedCents: number | null;
          status: string;
          submittedAt: number | null;
        }[];
      }>('/admin/finance/bank-transfers'),
  });
  const verify = useMutation({
    mutationFn: () =>
      api.post(`/admin/finance/bank-transfers/${verifyFor!.id}/verify`, {
        verifiedCents: Math.round(Number(cents) * 100),
        bankReference: ref.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Transfer verified');
      setVerifyFor(null);
      qc.invalidateQueries({ queryKey: ['admin-acc-bank'] });
    },
    onError: (e) => toast.error('Verify failed', errorMessage(e)),
  });
  const rows = q.data?.transfers ?? [];
  return (
    <>
      <QueryBlock
        loading={q.isLoading}
        error={q.isError ? q.error : null}
        retry={() => q.refetch()}
        empty={!rows.length}
      >
        {rows.map((t) => (
          <Row
            key={t.id}
            title={t.referenceNumber}
            sub={`expected ${formatLKR(t.expectedCents)}${t.transferredCents != null ? ` · received ${formatLKR(t.transferredCents)}` : ''}`}
            amount={t.verifiedCents ?? t.transferredCents}
            status={t.status}
            right={
              t.status !== 'verified' && t.status !== 'reconciled' ? (
                <Button
                  title="Verify"
                  size="sm"
                  variant="secondary"
                  icon={CheckCircle2}
                  onPress={() => {
                    setVerifyFor(t);
                    setCents(((t.transferredCents ?? t.expectedCents) / 100).toFixed(2));
                  }}
                />
              ) : undefined
            }
          />
        ))}
      </QueryBlock>
      <Sheet
        visible={!!verifyFor}
        onClose={() => setVerifyFor(null)}
        title="Verify bank transfer"
        subtitle="Record the confirmed amount that landed in the settlement account."
        footer={
          <Button
            title="Confirm verification"
            variant="volt"
            full
            loading={verify.isPending}
            disabled={!Number(cents)}
            onPress={() => verify.mutate()}
          />
        }
      >
        <View style={{ gap: 14 }}>
          <Field label="Verified amount (LKR)" required>
            <Input value={cents} onChangeText={setCents} keyboardType="decimal-pad" />
          </Field>
          <Field label="Bank reference">
            <Input
              value={ref}
              onChangeText={setRef}
              placeholder="UTR / slip number"
              autoCapitalize="characters"
            />
          </Field>
        </View>
      </Sheet>
    </>
  );
}

function SettlementsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const q = useQuery({
    queryKey: ['admin-acc-settlements'],
    queryFn: () =>
      api.get<{
        settlements: {
          id: string;
          settlementNumber: string;
          supplierId: string;
          netCents: number;
          status: string;
          createdAt: number;
        }[];
      }>('/admin/finance/settlements'),
  });
  const create = useMutation({
    mutationFn: () => api.post('/admin/finance/settlements', { supplierId: supplierId.trim() }),
    onSuccess: () => {
      toast.success('Settlement created');
      setSupplierId('');
      qc.invalidateQueries({ queryKey: ['admin-acc-settlements'] });
    },
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'payout' }) =>
      action === 'approve'
        ? api.post(`/admin/finance/settlements/${id}/approve`, {})
        : api.post('/admin/finance/payouts', { settlementId: id, method: 'bank' }),
    onSuccess: (_r, v) => {
      toast.success(v.action === 'approve' ? 'Approved' : 'Payout created');
      qc.invalidateQueries({ queryKey: ['admin-acc-settlements'] });
      qc.invalidateQueries({ queryKey: ['admin-acc-payouts'] });
    },
    onError: (e) => toast.error('Action failed', errorMessage(e)),
  });
  const rows = q.data?.settlements ?? [];
  return (
    <View style={{ gap: 12 }}>
      <Section kicker="New" title="Create settlement" icon={Building2}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Input
              value={supplierId}
              onChangeText={setSupplierId}
              placeholder="Supplier ID"
              autoCapitalize="none"
            />
          </View>
          <Button
            title="Create"
            size="sm"
            variant="volt"
            loading={create.isPending}
            disabled={!supplierId.trim()}
            onPress={() => create.mutate()}
          />
        </View>
      </Section>
      <QueryBlock
        loading={q.isLoading}
        error={q.isError ? q.error : null}
        retry={() => q.refetch()}
        empty={!rows.length}
      >
        {rows.map((s) => (
          <Row
            key={s.id}
            title={s.settlementNumber}
            sub={`${s.supplierId.slice(0, 12)}… · ${timeAgo(s.createdAt)}`}
            amount={s.netCents}
            status={s.status}
            right={
              s.status !== 'pending' && s.status !== 'approved' ? undefined : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {s.status === 'pending' ? (
                    <Button
                      title="Approve"
                      size="sm"
                      variant="secondary"
                      onPress={() => act.mutate({ id: s.id, action: 'approve' })}
                    />
                  ) : null}
                  {s.status === 'approved' ? (
                    <Button
                      title="Pay out"
                      size="sm"
                      variant="volt"
                      onPress={() => act.mutate({ id: s.id, action: 'payout' })}
                    />
                  ) : null}
                </View>
              )
            }
          />
        ))}
      </QueryBlock>
    </View>
  );
}

function PayoutsTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-acc-payouts'],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          payoutNumber: string | null;
          supplierId: string;
          settlementId: string | null;
          netCents: number;
          status: string;
          method: string;
          createdAt: number;
        }[];
      }>('/payouts/all'),
  });
  const advance = useMutation({
    mutationFn: async ({ p }: { p: { id: string; status: string } }) => {
      if (p.status === 'pending') await api.post(`/admin/finance/payouts/${p.id}/approve`, {});
      if (p.status !== 'processing') await api.post(`/admin/finance/payouts/${p.id}/process`, {});
      await api.post(`/admin/finance/payouts/${p.id}/complete`, {});
    },
    onSuccess: () => {
      toast.success('Payout advanced');
      qc.invalidateQueries({ queryKey: ['admin-acc-payouts'] });
    },
    onError: (e) => toast.error('Advance failed', errorMessage(e)),
  });
  const rows = q.data?.items ?? [];
  return (
    <QueryBlock
      loading={q.isLoading}
      error={q.isError ? q.error : null}
      retry={() => q.refetch()}
      empty={!rows.length}
    >
      {rows.map((p) => (
        <Row
          key={p.id}
          title={p.payoutNumber ?? p.id.slice(0, 12)}
          sub={`${p.method} · ${timeAgo(p.createdAt)}`}
          amount={p.netCents}
          status={p.status}
          right={
            p.status !== 'completed' && p.status !== 'failed' ? (
              <Button
                title="Advance → complete"
                size="sm"
                variant="secondary"
                icon={Landmark}
                loading={advance.isPending}
                onPress={() => advance.mutate({ p })}
              />
            ) : undefined
          }
        />
      ))}
    </QueryBlock>
  );
}

function ReconTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-acc-recon'],
    queryFn: () =>
      api.get<{
        exceptions: {
          id: string;
          kind: string;
          severity: string;
          entityType: string | null;
          entityId: string | null;
          differenceCents: number;
          detail: string | null;
          status: string;
          createdAt: number;
        }[];
      }>('/admin/finance/reconciliation/exceptions?status=open'),
  });
  const run = useMutation({
    mutationFn: () => api.post<{ raised: number }>('/admin/finance/reconciliation/run', {}),
    onSuccess: (r) => {
      toast.success(`Raised ${r.raised} exception${r.raised === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['admin-acc-recon'] });
    },
    onError: (e) => toast.error('Run failed', errorMessage(e)),
  });
  const resolve = useMutation({
    mutationFn: (id: string) =>
      api.post(`/admin/finance/reconciliation/exceptions/${id}/resolve`, {
        note: 'Reviewed from console',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-acc-recon'] }),
    onError: (e) => toast.error('Resolve failed', errorMessage(e)),
  });
  const rows = q.data?.exceptions ?? [];
  return (
    <View style={{ gap: 12 }}>
      <Section
        kicker="Engine"
        title="Reconciliation"
        icon={Scale}
        right={
          <Button
            title="Run"
            icon={RefreshCw}
            size="sm"
            variant="secondary"
            loading={run.isPending}
            onPress={() => run.mutate()}
          />
        }
      >
        <Text variant="caption" color="ink4">
          Scans payments, orders, transfers, COD, earnings, settlements, payouts and refunds for
          unexplained rupees.
        </Text>
      </Section>
      <QueryBlock
        loading={q.isLoading}
        error={q.isError ? q.error : null}
        retry={() => q.refetch()}
        empty={!rows.length}
      >
        {rows.map((e) => (
          <Row
            key={e.id}
            title={e.kind}
            sub={`${e.entityType ?? ''} ${e.entityId?.slice(0, 12) ?? ''} · ${timeAgo(e.createdAt)}`}
            amount={e.differenceCents}
            status={e.severity}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {e.detail ? (
                  <Text variant="caption" color="ink4" numberOfLines={2} style={{ flex: 1 }}>
                    {e.detail}
                  </Text>
                ) : null}
                <Button
                  title="Resolve"
                  size="sm"
                  variant="ghost"
                  loading={resolve.isPending}
                  onPress={() => resolve.mutate(e.id)}
                />
              </View>
            }
          />
        ))}
      </QueryBlock>
    </View>
  );
}
