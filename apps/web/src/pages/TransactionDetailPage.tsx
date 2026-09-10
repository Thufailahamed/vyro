import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, EmptyState, ErrorBanner } from '@/components/ui';
import { Money, StatusPill, time } from '@/accounts/shared';
import { RequestRefundButton } from './AccountsPage';

type Chain = {
  order: { id: string; poNumber: string; status: string; totalCents: number } | null;
  payment: {
    id: string; paymentNumber: string | null; amountCents: number; feeCents: number; netCents: number;
    method: string; provider: string; status: string; currency: string;
    providerReference: string | null; transactionReference: string | null;
    createdAt: number; paidAt: number | null;
  };
  attempts: Array<{ id: string; attemptNumber: number; provider: string; amountCents: number; status: string; failureReason: string | null; initiatedAt: number; completedAt: number | null }>;
  allocations: Array<{ supplierId: string; grossCents: number; commissionCents: number; commissionBps: number; netCents: number }>;
  invoices: Array<{ id: string; number: string; totalCents: number }>;
  refunds: Array<{ id: string; refundNumber: string | null; amountCents: number; status: string; reason: string | null; createdAt: number }>;
  earnings: Array<{ id: string; grossCents: number; commissionCents: number; refundCents: number; netCents: number; eligibility: string }>;
  settlements: Array<{ settlementId: string; netCents: number; settlement: { settlementNumber: string; status: string } | null }>;
  payouts: Array<{ id: string; payoutNumber: string | null; netCents: number; status: string }>;
  cod: Array<{ expectedCents: number; collectedCents: number | null; discrepancyCents: number; status: string; reconciliationStatus: string }>;
  bankTransfers: Array<{ referenceNumber: string; expectedCents: number; verifiedCents: number | null; status: string }>;
  ledger: Array<{ id: string; accountType: string; direction: string; amountCents: number; category: string | null; description: string; createdAt: number }>;
  adjustments: Array<{ id: string; adjustmentNumber: string; kind: string; amountCents: number; status: string; reason: string }>;
};

/** Where every rupee came from and where it went (spec §34). */
export function TransactionDetailPage() {
  const { id } = useParams();
  const q = useQuery({
    queryKey: ['accounts', 'payment-chain', id],
    queryFn: () => api.get<Chain>(`/finance/payments/${id}`),
    enabled: !!id,
  });
  if (q.isLoading) return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-ink-4">Loading transaction…</div>;
  if (q.isError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <ErrorBanner message={(q.error as ApiError).message} />
        <Link to="/accounts" className="mt-4 inline-block text-sm font-semibold underline-offset-2 hover:underline">Back to accounts</Link>
      </div>
    );
  }
  const c = q.data!;
  const p = c.payment;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      <PageHeader
        kicker="Accounts / Transaction"
        title={p.paymentNumber ?? 'Payment'}
        sub={`Order ${c.order?.poNumber ?? '—'} · ${p.method.replace(/_/g, ' ')} via ${p.provider}`}
        actions={<RequestRefundButton paymentId={p.id} maxCents={p.amountCents} />}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <StatusPill status={p.status} />
        <Money cents={p.amountCents} className="text-xl" />
        <span className="text-sm text-ink-4">fee <Money cents={p.feeCents} /> · net <Money cents={p.netCents} /> · {time(p.paidAt ?? p.createdAt)}</span>
      </div>

      <ol className="mt-8 space-y-4">
        <Step title="Order" done={!!c.order}>
          {c.order ? (
            <div className="text-sm">PO {c.order.poNumber} · <StatusPill status={c.order.status} /> · <Money cents={c.order.totalCents} /></div>
          ) : <EmptyState title="Order missing" description="This payment references an order that no longer exists — flagged for reconciliation." />}
        </Step>
        <Step title={`Payment attempts (${c.attempts.length})`} done={p.status === 'confirmed'}>
          {c.attempts.length === 0 && <p className="text-sm text-ink-4">No attempts recorded.</p>}
          {c.attempts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
              <span>Attempt #{a.attemptNumber} · {a.provider} <StatusPill status={a.status} /></span>
              <span className="text-ink-4">{a.failureReason ?? time(a.completedAt ?? a.initiatedAt)}</span>
            </div>
          ))}
        </Step>
        {c.allocations.length > 0 && (
          <Step title="Supplier allocation" done>
            {c.allocations.map((a, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-2 py-1 text-sm">
                <span>Supplier {a.supplierId.slice(0, 8)} · commission {a.commissionBps}bps</span>
                <span><Money cents={a.grossCents} /> − <Money cents={a.commissionCents} /> = <Money cents={a.netCents} /></span>
              </div>
            ))}
          </Step>
        )}
        {c.invoices.length > 0 && (
          <Step title="Invoices" done>
            {c.invoices.map((i) => (
              <div key={i.id} className="py-1 text-sm"><Link to={`/invoices/${i.id}`} className="font-semibold underline-offset-2 hover:underline">{i.number}</Link> · <Money cents={i.totalCents} /></div>
            ))}
          </Step>
        )}
        {c.cod.length > 0 && (
          <Step title="Cash on delivery" done={c.cod[0]?.status === 'collected'}>
            {c.cod.map((x, i) => (
              <div key={i} className="py-1 text-sm">Expected <Money cents={x.expectedCents} /> · collected {x.collectedCents == null ? '—' : <Money cents={x.collectedCents} />} · <StatusPill status={x.status} /> · <StatusPill status={x.reconciliationStatus} /></div>
            ))}
          </Step>
        )}
        {c.bankTransfers.length > 0 && (
          <Step title="Bank transfer" done={c.bankTransfers[0]?.status === 'verified'}>
            {c.bankTransfers.map((b, i) => (
              <div key={i} className="py-1 text-sm">{b.referenceNumber} · <StatusPill status={b.status} /> · expected <Money cents={b.expectedCents} />{b.verifiedCents != null && <> · verified <Money cents={b.verifiedCents} /></>}</div>
            ))}
          </Step>
        )}
        {c.refunds.length > 0 && (
          <Step title="Refunds" done={false}>
            {c.refunds.map((r) => (
              <div key={r.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm">
                <span>{r.refundNumber ?? r.id.slice(0, 8)} · <StatusPill status={r.status} /> · {r.reason ?? ''}</span>
                <Money cents={r.amountCents} />
              </div>
            ))}
          </Step>
        )}
        {c.earnings.length > 0 && (
          <Step title="Supplier earnings" done>
            {c.earnings.map((e) => (
              <div key={e.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm">
                <span>Gross <Money cents={e.grossCents} /> − commission <Money cents={e.commissionCents} /> − refunds <Money cents={e.refundCents} /> · <StatusPill status={e.eligibility} /></span>
                <Money cents={e.netCents} />
              </div>
            ))}
          </Step>
        )}
        {c.settlements.length > 0 && (
          <Step title="Settlement" done>
            {c.settlements.map((s, i) => (
              <div key={i} className="py-1 text-sm">{s.settlement?.settlementNumber ?? s.settlementId} · {s.settlement && <StatusPill status={s.settlement.status} />} · <Money cents={s.netCents} /></div>
            ))}
          </Step>
        )}
        {c.payouts.length > 0 && (
          <Step title="Payout" done>
            {c.payouts.map((x) => (
              <div key={x.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm">
                <span>{x.payoutNumber ?? x.id.slice(0, 8)} · <StatusPill status={x.status} /></span>
                <Money cents={x.netCents} />
              </div>
            ))}
          </Step>
        )}
        {c.adjustments.length > 0 && (
          <Step title="Adjustments" done>
            {c.adjustments.map((a) => (
              <div key={a.id} className="py-1 text-sm">{a.adjustmentNumber} · {a.kind} · <StatusPill status={a.status} /> · <Money cents={a.amountCents} /> · {a.reason}</div>
            ))}
          </Step>
        )}
        <Step title="Ledger entries" done>
          {c.ledger.length === 0 && <p className="text-sm text-ink-4">No ledger entries yet.</p>}
          {c.ledger.map((l) => (
            <div key={l.id} className="flex flex-wrap justify-between gap-2 py-1 text-sm">
              <span>{l.description} <span className="text-ink-4">· {l.category ?? l.accountType} · {time(l.createdAt)}</span></span>
              <Money cents={l.direction === 'credit' ? l.amountCents : -l.amountCents} />
            </div>
          ))}
        </Step>
      </ol>
      <Link to="/accounts" className="mt-8 inline-block text-sm font-semibold underline-offset-2 hover:underline">Back to accounts</Link>
    </div>
  );
}

function Step({ title, done, children }: { title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`mt-1 size-3 rounded-full border-2 ${done ? 'border-mint bg-mint' : 'border-ink/30 bg-paper'}`} />
        <span className="w-px flex-1 bg-ink/10" />
      </div>
      <div className="flex-1 rounded-xl border border-ink/10 bg-paper p-4">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}
