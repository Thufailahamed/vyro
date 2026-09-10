import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, EmptyState, ErrorBanner, Input, Select, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { Money, Stat, StatusPill, time, useBusinessId, useConfirm } from '@/accounts/shared';

type Tab = 'overview' | 'payments' | 'invoices' | 'refunds' | 'transactions';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'payments', label: 'Payments' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'transactions', label: 'Transactions' },
];

export function AccountsPage() {
  const businessId = useBusinessId();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'overview';
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p);
  };

  if (!businessId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState title="No business workspace" description="Join or create a business to see your accounts." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <PageHeader kicker="Business" title="Accounts" sub="What you paid, how you paid, what is pending, what was refunded." />
      <div className="mt-4 flex flex-wrap gap-2 border-b border-ink/10 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-ink text-paper' : 'text-ink-3 hover:bg-ink/5'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'overview' && <Overview businessId={businessId} />}
        {tab === 'payments' && <Payments businessId={businessId} />}
        {tab === 'invoices' && <Invoices businessId={businessId} />}
        {tab === 'refunds' && <Refunds businessId={businessId} />}
        {tab === 'transactions' && <Transactions businessId={businessId} />}
      </div>
    </div>
  );
}

function Overview({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-overview', businessId],
    queryFn: () => api.get<{
      totalSpendCents: number; paidCents: number; pendingCents: number;
      refundedCents: number; outstandingCents: number;
      byMethod: Array<{ method: string; cents: number; count: number }>;
      recentPayments: Array<{ id: string; amountCents: number; method: string; status: string; purchaseOrderId: string; createdAt: number }>;
    }>(`/finance/business/overview?businessId=${businessId}`),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading accounts…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Total spend" cents={d.totalSpendCents} />
        <Stat label="Paid" cents={d.paidCents} />
        <Stat label="Pending" cents={d.pendingCents} />
        <Stat label="Refunded" cents={d.refundedCents} />
        <Stat label="Outstanding" cents={d.outstandingCents} />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-ink/10 bg-paper p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">By payment method</h3>
          <div className="mt-3 space-y-2">
            {d.byMethod.length === 0 && <p className="text-sm text-ink-4">No payments yet.</p>}
            {d.byMethod.map((m) => (
              <div key={m.method} className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize">{m.method.replace(/_/g, ' ')} <span className="text-ink-4">× {m.count}</span></span>
                <Money cents={m.cents} />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-ink/10 bg-paper p-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">Recent payments</h3>
          <div className="mt-3 space-y-2">
            {d.recentPayments.length === 0 && <p className="text-sm text-ink-4">No payments yet.</p>}
            {d.recentPayments.slice(0, 5).map((p) => (
              <Link key={p.id} to={`/accounts/payments/${p.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-ink/5">
                <span className="flex items-center gap-2"><StatusPill status={p.status} /><span className="text-ink-4">{p.method.replace(/_/g, ' ')}</span></span>
                <Money cents={p.amountCents} />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Payments({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const q = useQuery({
    queryKey: ['accounts', 'business-payments', businessId, status, method],
    queryFn: () => api.get<{ items: Array<{ id: string; paymentNumber: string | null; amountCents: number; method: string; status: string; purchaseOrderId: string; createdAt: number }> }>(
      `/finance/business/payments?businessId=${businessId}${status ? `&status=${status}` : ''}${method ? `&method=${method}` : ''}`,
    ),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-48">
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Paid</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </Select>
        </div>
        <div className="w-48">
          <Label>Method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All</option>
            <option value="online">PayHere</option>
            <option value="cash">Cash on Delivery</option>
            <option value="bank_transfer">Bank transfer</option>
          </Select>
        </div>
      </div>
      {q.isLoading && <div className="text-sm text-ink-4">Loading payments…</div>}
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}
      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-[0.14em] text-ink-3">
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {(q.data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-4 py-3"><Link to={`/accounts/payments/${p.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">{p.paymentNumber ?? p.id.slice(0, 8)}</Link></td>
                <td className="px-4 py-3 capitalize">{p.method.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                <td className="px-4 py-3 text-right"><Money cents={p.amountCents} /></td>
                <td className="px-4 py-3 text-ink-4">{time(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(q.data?.items ?? []).length === 0 && !q.isLoading && <div className="p-6"><EmptyState title="No payments" description="Payments for your orders will appear here." /></div>}
      </div>
    </div>
  );
}

function Invoices({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-invoices', businessId],
    queryFn: () => api.get<{ invoices: Array<{ id: string; number: string; type: string; totalCents: number; purchaseOrderId: string; issuedAt: number; paymentId: string | null }> }>(
      `/finance/business/invoices?businessId=${businessId}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading invoices…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const invoices = q.data?.invoices ?? [];
  return (
    <div className="overflow-x-auto rounded-xl border border-ink/10 bg-paper">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-[0.14em] text-ink-3">
            <th className="px-4 py-3">Invoice</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3 text-right">Total</th>
            <th className="px-4 py-3">Issued</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
              <td className="px-4 py-3 font-semibold">{inv.number}</td>
              <td className="px-4 py-3 capitalize">{inv.type.replace(/_/g, ' ')}</td>
              <td className="px-4 py-3 text-right"><Money cents={inv.totalCents} /></td>
              <td className="px-4 py-3 text-ink-4">{time(inv.issuedAt)}</td>
              <td className="px-4 py-3 text-right"><Link to={`/invoices/${inv.id}`} className="text-sm font-semibold underline-offset-2 hover:underline">View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoices.length === 0 && <div className="p-6"><EmptyState title="No invoices" description="Invoices are issued when payments complete." /></div>}
    </div>
  );
}

function Refunds({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-refunds', businessId],
    queryFn: () => api.get<{ refunds: Array<{ id: string; refundNumber: string | null; paymentId: string; amountCents: number; status: string; reason: string | null; createdAt: number }> }>(
      `/finance/business/refunds?businessId=${businessId}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading refunds…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const refunds = q.data?.refunds ?? [];
  return (
    <div className="space-y-2">
      {refunds.length === 0 && <EmptyState title="No refunds" description="Refund requests and their outcomes will appear here." />}
      {refunds.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3">
          <div>
            <div className="font-semibold">{r.refundNumber ?? r.id.slice(0, 8)}</div>
            <div className="text-xs text-ink-4">{r.reason ?? 'No reason given'} · {time(r.createdAt)}</div>
          </div>
          <div className="flex items-center gap-3"><StatusPill status={r.status} /><Money cents={r.amountCents} /></div>
        </div>
      ))}
    </div>
  );
}

function Transactions({ businessId }: { businessId: string }) {
  const q = useQuery({
    queryKey: ['accounts', 'business-transactions', businessId],
    queryFn: () => api.get<{ transactions: Array<{ id: string; direction: string; amountCents: number; refType: string; refId: string; category: string | null; description: string; createdAt: number }> }>(
      `/finance/business/transactions?businessId=${businessId}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading transactions…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const transactions = q.data?.transactions ?? [];
  return (
    <div className="space-y-2">
      {transactions.length === 0 && <EmptyState title="No transactions" description="Your financial ledger entries will appear here." />}
      {transactions.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div>
            <div className="font-medium">{t.description}</div>
            <div className="text-xs text-ink-4">{t.category ?? t.refType} · {time(t.createdAt)}</div>
          </div>
          <Money cents={t.direction === 'credit' ? t.amountCents : -t.amountCents} className={t.direction === 'credit' ? 'text-mint' : 'text-rose'} />
        </div>
      ))}
    </div>
  );
}

export function RequestRefundButton({ paymentId, maxCents }: { paymentId: string; maxCents: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => ask({
          title: 'Request refund',
          confirmLabel: 'Submit request',
          body: (
            <div className="space-y-3">
              <p>This sends a refund request to VYRO finance for approval. Money moves only after approval.</p>
              <div>
                <Label>Amount (cents, max {maxCents})</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(maxCents)} inputMode="numeric" />
              </div>
              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Damaged goods…" />
              </div>
            </div>
          ),
          action: async () => {
            const amountCents = amount ? Number(amount) : undefined;
            await api.post(`/finance/payments/${paymentId}/refunds`, { amountCents, reason });
            toast.success('Refund requested');
            void qc.invalidateQueries({ queryKey: ['accounts'] });
          },
        })}
      >
        Request refund
      </Button>
      {dialog}
    </>
  );
}
