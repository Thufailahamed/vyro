import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ui';
import { Money, time } from '@/accounts/shared';
import { AdminPage, AdminPageHeader, Panel, Pill, Skeleton, StatCard, StatGrid, StatusPill } from './ui';

/** Admin view of the full money chain (spec §30/§34) — secrets redacted server-side. */
export function AdminTransactionPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ['admin-accounts', 'payment-chain', id],
    queryFn: () => api.get<{
      order: { poNumber: string; status: string; businessId: string; supplierId: string; totalCents: number } | null;
      payment: { paymentNumber: string | null; amountCents: number; feeCents: number; netCents: number; method: string; provider: string; status: string; createdAt: number; paidAt: number | null };
      attempts: Array<{ id: string; attemptNumber: number; status: string; failureReason: string | null }>;
      allocations: Array<{ supplierId: string; grossCents: number; commissionCents: number; netCents: number }>;
      refunds: Array<{ refundNumber: string | null; amountCents: number; status: string }>;
      earnings: Array<{ grossCents: number; commissionCents: number; netCents: number; eligibility: string }>;
      settlements: Array<{ settlement: { settlementNumber: string; status: string } | null; netCents: number }>;
      payouts: Array<{ payoutNumber: string | null; netCents: number; status: string }>;
      ledger: Array<{ id: string; accountType: string; direction: string; amountCents: number; category: string | null; description: string }>;
    }>(`/admin/finance/payments/${id}`),
    enabled: !!id,
  });
  if (q.isLoading) {
    return (
      <AdminPage className="max-w-5xl">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <StatGrid cols={3}>
          {[0, 1, 2].map((i) => <StatCard key={i} label="Loading" value="" loading />)}
        </StatGrid>
      </AdminPage>
    );
  }
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const c = q.data!;
  return (
    <AdminPage className="max-w-5xl">
      <AdminPageHeader
        back={{ to: '/admin/accounts?tab=payments', label: 'Back to payments' }}
        kicker="Accounts / Transaction"
        title={c.payment.paymentNumber ?? 'Payment'}
        description={`Order ${c.order?.poNumber ?? '—'} · ${c.payment.method} via ${c.payment.provider}`}
        meta={
          <>
            <StatusPill status={c.payment.status} />
            <Pill>{time(c.payment.paidAt ?? c.payment.createdAt)}</Pill>
          </>
        }
      />

      <StatGrid cols={3}>
        <StatCard label="Amount" value={<Money cents={c.payment.amountCents} />} />
        <StatCard label="Fee" value={<Money cents={c.payment.feeCents} />} />
        <StatCard label="Net" value={<Money cents={c.payment.netCents} />} />
      </StatGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <ChainPanel title="Attempts" count={c.attempts.length}>
          {c.attempts.map((a) => <Row key={a.id} left={<span className="font-mono text-xs">#{a.attemptNumber}</span>} right={<StatusPill status={a.status} />} sub={a.failureReason ?? ''} />)}
        </ChainPanel>
        <ChainPanel title="Allocations" count={c.allocations.length}>
          {c.allocations.map((a, i) => <Row key={i} left={<span className="font-mono text-xs">{a.supplierId.slice(0, 8)}</span>} right={<Money cents={a.netCents} />} sub={`gross ${a.grossCents} − commission ${a.commissionCents}`} />)}
        </ChainPanel>
        <ChainPanel title="Refunds" count={c.refunds.length}>
          {c.refunds.map((r, i) => <Row key={i} left={<span className="font-mono text-xs">{r.refundNumber ?? `#${i}`}</span>} right={<><StatusPill status={r.status} /> <Money cents={r.amountCents} /></>} />)}
        </ChainPanel>
        <ChainPanel title="Earnings" count={c.earnings.length}>
          {c.earnings.map((e, i) => <Row key={i} left={<StatusPill status={e.eligibility} />} right={<Money cents={e.netCents} />} sub={`gross ${e.grossCents} − commission ${e.commissionCents}`} />)}
        </ChainPanel>
        <ChainPanel title="Settlement / payout" count={null}>
          {c.settlements.map((s, i) => <Row key={i} left={<span className="font-mono text-xs">{s.settlement?.settlementNumber ?? '—'}</span>} right={<Money cents={s.netCents} />} />)}
          {c.payouts.map((p, i) => <Row key={`p${i}`} left={<span className="font-mono text-xs">{p.payoutNumber ?? '—'}</span>} right={<><StatusPill status={p.status} /> <Money cents={p.netCents} /></>} />)}
          {c.settlements.length === 0 && c.payouts.length === 0 && <p className="py-2 text-sm text-ink-4">Not yet settled.</p>}
        </ChainPanel>
        <ChainPanel title="Ledger" count={c.ledger.length}>
          {c.ledger.map((l) => <Row key={l.id} left={l.description} right={<Money cents={l.direction === 'credit' ? l.amountCents : -l.amountCents} />} sub={`${l.accountType} · ${l.category ?? ''}`} />)}
        </ChainPanel>
      </div>
    </AdminPage>
  );
}

function ChainPanel({ title, count, children }: { title: string; count: number | null; children: ReactNode }) {
  return (
    <Panel
      title={title}
      actions={count != null ? <Pill className="num-tabular">{count}</Pill> : undefined}
      bodyClassName="py-2"
    >
      <div className="divide-y divide-ink/[0.06]">{children}</div>
      {count === 0 && <p className="py-2 text-sm text-ink-4">None recorded.</p>}
    </Panel>
  );
}

function Row({ left, right, sub }: { left: ReactNode; right: ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm text-ink">
      <span className="min-w-0">
        {left}
        {sub ? <span className="mt-0.5 block text-xs text-ink-4">{sub}</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2 num-tabular">{right}</span>
    </div>
  );
}
