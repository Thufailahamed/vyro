import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, ErrorBanner } from '@/components/ui';
import { Money, StatusPill, time } from '@/accounts/shared';

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
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const c = q.data!;
  return (
    <div className="mx-auto max-w-5xl pb-12">
      <PageHeader kicker="Accounts / Transaction" title={c.payment.paymentNumber ?? 'Payment'} sub={`Order ${c.order?.poNumber ?? '—'} · ${c.payment.method} via ${c.payment.provider}`} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusPill status={c.payment.status} />
        <Money cents={c.payment.amountCents} className="text-xl" />
        <span className="text-sm text-ink-4">fee <Money cents={c.payment.feeCents} /> · net <Money cents={c.payment.netCents} /> · {time(c.payment.paidAt ?? c.payment.createdAt)}</span>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Panel title={`Attempts (${c.attempts.length})`}>
          {c.attempts.map((a) => <Row key={a.id} left={`#${a.attemptNumber}`} right={<StatusPill status={a.status} />} sub={a.failureReason ?? ''} />)}
        </Panel>
        <Panel title={`Allocations (${c.allocations.length})`}>
          {c.allocations.map((a, i) => <Row key={i} left={a.supplierId.slice(0, 8)} right={<Money cents={a.netCents} />} sub={`gross ${a.grossCents} − commission ${a.commissionCents}`} />)}
        </Panel>
        <Panel title={`Refunds (${c.refunds.length})`}>
          {c.refunds.map((r, i) => <Row key={i} left={r.refundNumber ?? `#${i}`} right={<><StatusPill status={r.status} /> <Money cents={r.amountCents} /></>} />)}
        </Panel>
        <Panel title={`Earnings (${c.earnings.length})`}>
          {c.earnings.map((e, i) => <Row key={i} left={<StatusPill status={e.eligibility} />} right={<Money cents={e.netCents} />} sub={`gross ${e.grossCents} − commission ${e.commissionCents}`} />)}
        </Panel>
        <Panel title="Settlement / Payout">
          {c.settlements.map((s, i) => <Row key={i} left={s.settlement?.settlementNumber ?? '—'} right={<Money cents={s.netCents} />} />)}
          {c.payouts.map((p, i) => <Row key={`p${i}`} left={p.payoutNumber ?? '—'} right={<><StatusPill status={p.status} /> <Money cents={p.netCents} /></>} />)}
          {c.settlements.length === 0 && c.payouts.length === 0 && <p className="text-sm text-ink-4">Not yet settled.</p>}
        </Panel>
        <Panel title={`Ledger (${c.ledger.length})`}>
          {c.ledger.map((l) => <Row key={l.id} left={l.description} right={<Money cents={l.direction === 'credit' ? l.amountCents : -l.amountCents} />} sub={`${l.accountType} · ${l.category ?? ''}`} />)}
        </Panel>
      </div>
      <Link to="/admin/accounts?tab=payments" className="mt-8 inline-block text-sm font-semibold underline-offset-2 hover:underline">Back to payments</Link>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-4">
      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">{title}</h3>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ left, right, sub }: { left: React.ReactNode; right: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{left}{sub ? <span className="block text-xs text-ink-4">{sub}</span> : null}</span>
      <span className="flex items-center gap-2">{right}</span>
    </div>
  );
}
