import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, EmptyState, ErrorBanner, Input, Select, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { Money, Stat, StatusPill, time, useConfirm } from '@/accounts/shared';

type Tab = 'overview' | 'payments' | 'refunds' | 'bank' | 'cod' | 'settlements' | 'payouts' | 'recon' | 'adjust' | 'commission';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'payments', label: 'Payments' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'bank', label: 'Bank transfers' },
  { id: 'cod', label: 'COD' },
  { id: 'settlements', label: 'Settlements' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'recon', label: 'Reconciliation' },
  { id: 'adjust', label: 'Adjustments' },
  { id: 'commission', label: 'Commission' },
];

export function AdminAccountsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'overview';
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p);
  };
  return (
    <div className="mx-auto max-w-7xl pb-12">
      <PageHeader kicker="Commerce & Supply" title="Accounts" sub="GMV, commission, supplier payable, pending money, and every exception." />
      <div className="mt-4 flex flex-wrap gap-2 border-b border-ink/10 pb-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-ink text-paper' : 'text-ink-3 hover:bg-ink/5'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'overview' && <Overview />}
        {tab === 'payments' && <Payments />}
        {tab === 'refunds' && <Refunds />}
        {tab === 'bank' && <BankTransfers />}
        {tab === 'cod' && <Cod />}
        {tab === 'settlements' && <Settlements />}
        {tab === 'payouts' && <AdminPayouts />}
        {tab === 'recon' && <Recon />}
        {tab === 'adjust' && <Adjustments />}
        {tab === 'commission' && <Commission />}
      </div>
    </div>
  );
}

function Overview() {
  const q = useQuery({
    queryKey: ['admin-accounts', 'overview'],
    queryFn: () => api.get<{
      gmvCents: number; successfulPayments: number; successfulCents: number;
      pendingPayments: number; pendingCents: number; failedPayments: number;
      refundedCents: number; refundCount: number; refundRateBps: number;
      codOutstandingCents: number; codOutstandingCount: number; bankTransferQueueCount: number;
      supplierPayableCents: number; commissionCents: number;
      pendingSettlementsCents: number; completedPayoutsCents: number;
      byMethod: Array<{ method: string; cents: number; count: number }>;
    }>('/admin/finance/overview'),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading overview…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="GMV" cents={d.gmvCents} sub={`${d.successfulPayments} successful payments`} />
        <Stat label="VYRO commission" cents={d.commissionCents} />
        <Stat label="Supplier payable" cents={d.supplierPayableCents} sub={`Pending settlements ${d.pendingSettlementsCents / 100}`} />
        <Stat label="Paid out" cents={d.completedPayoutsCents} />
        <Stat label="Pending payments" cents={d.pendingCents} sub={`${d.pendingPayments} payments`} />
        <Stat label="Failed payments" cents={undefined} sub={`${d.failedPayments} failed`} />
        <Stat label="Refunded" cents={d.refundedCents} sub={`${d.refundCount} refunds · ${(d.refundRateBps / 100).toFixed(2)}%`} />
        <Stat label="COD outstanding" cents={d.codOutstandingCents} sub={`${d.codOutstandingCount} uncollected · ${d.bankTransferQueueCount} bank transfers queued`} />
      </div>
      <div className="rounded-xl border border-ink/10 bg-paper p-5">
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">By payment method</h3>
        <div className="mt-3 space-y-2">
          {d.byMethod.map((m) => (
            <div key={m.method} className="flex items-center justify-between text-sm">
              <span className="font-medium capitalize">{m.method.replace(/_/g, ' ')} <span className="text-ink-4">× {m.count}</span></span>
              <Money cents={m.cents} />
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-3 text-sm">
          <a href="/api/admin/finance/exports/payments.csv" className="font-semibold underline-offset-2 hover:underline">Export payments CSV</a>
          <a href="/api/admin/finance/exports/ledger.csv" className="font-semibold underline-offset-2 hover:underline">Export ledger CSV</a>
        </div>
      </div>
    </div>
  );
}

function Payments() {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [orderId, setOrderId] = useState('');
  const q = useQuery({
    queryKey: ['admin-accounts', 'payments', status, method, orderId],
    queryFn: () => api.get<{ items: Array<{ id: string; paymentNumber: string | null; method: string; status: string; amountCents: number; purchaseOrderId: string; createdAt: number }> }>(
      `/admin/finance/payments?${status ? `status=${status}&` : ''}${method ? `method=${method}&` : ''}${orderId ? `orderId=${orderId}&` : ''}limit=50`,
    ),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><Label>Status</Label><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="pending">Pending</option><option value="confirmed">Paid</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></Select></div>
        <div className="w-44"><Label>Method</Label><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All</option><option value="online">PayHere</option><option value="cash">COD</option><option value="bank_transfer">Bank</option></Select></div>
        <div className="w-64"><Label>Order ID</Label><Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Filter by order…" /></div>
      </div>
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}
      <div className="overflow-x-auto rounded-xl border border-ink/10 bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-ink/10 text-left text-[11px] uppercase tracking-[0.14em] text-ink-3"><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Date</th></tr></thead>
          <tbody>
            {(q.data?.items ?? []).map((p) => (
              <tr key={p.id} className="border-b border-ink/5 last:border-0 hover:bg-ink/[0.02]">
                <td className="px-4 py-3"><Link to={`/admin/accounts/payments/${p.id}`} className="font-semibold underline-offset-2 hover:underline">{p.paymentNumber ?? p.id.slice(0, 8)}</Link></td>
                <td className="px-4 py-3 capitalize">{p.method.replace(/_/g, ' ')}</td>
                <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                <td className="px-4 py-3 text-right"><Money cents={p.amountCents} /></td>
                <td className="px-4 py-3 text-ink-4">{time(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(q.data?.items ?? []).length === 0 && !q.isLoading && <div className="p-6"><EmptyState title="No payments" description="No payments match these filters." /></div>}
      </div>
    </div>
  );
}

function useRefresh(keys: unknown[]) {
  const qc = useQueryClient();
  const toast = useToast();
  return {
    done: (msg: string) => {
      toast.success(msg);
      for (const k of keys) void qc.invalidateQueries({ queryKey: k as never });
    },
    fail: (e: unknown) => toast.error(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Action failed'),
  };
}

function Refunds() {
  const [status, setStatus] = useState('');
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'refunds']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'refunds', status],
    queryFn: () => api.get<{ refunds: Array<{ id: string; refundNumber: string | null; paymentId: string; amountCents: number; status: string; reason: string | null; createdAt: number }> }>(
      `/admin/finance/refunds?${status ? `status=${status}` : ''}`,
    ),
  });
  const act = (id: string, action: string, title: string, confirmLabel: string, body: string) =>
    ask({
      title, confirmLabel,
      body: <p>{body}</p>,
      action: async () => {
        try {
          await api.post(`/admin/finance/refunds/${id}/${action}`, action === 'reject' || action === 'fail' ? { reason: 'Reviewed by finance' } : {});
          r.done(`Refund ${action}ed`);
        } catch (e) { r.fail(e); }
      },
    });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {['', 'requested', 'approved', 'processing', 'completed', 'failed'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-3'}`}>{s === '' ? 'All' : s}</button>
        ))}
      </div>
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}
      {(q.data?.refunds ?? []).map((x) => (
        <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{x.refundNumber ?? x.id.slice(0, 8)}</span> <span className="text-xs text-ink-4">{x.reason ?? ''} · {time(x.createdAt)}</span><div><StatusPill status={x.status} /></div></div>
          <div className="flex items-center gap-2">
            <Money cents={x.amountCents} />
            {x.status === 'requested' && (<><Button size="sm" onClick={() => act(x.id, 'approve', `Approve refund of ${x.amountCents}c?`, 'Approve refund', 'This moves the refund to processing. Money movement is recorded in the ledger.')}>Approve</Button><Button size="sm" variant="outline" onClick={() => act(x.id, 'reject', 'Reject refund?', 'Reject', 'The requester will be notified.')}>Reject</Button></>)}
            {(x.status === 'approved' || x.status === 'processing') && (<Button size="sm" onClick={() => act(x.id, 'complete', `Mark refund of ${x.amountCents}c complete?`, 'Mark complete', 'Confirm the money actually left VYRO (provider/bank/cash). This adjusts supplier earnings.')}>Complete</Button>)}
          </div>
        </div>
      ))}
      {(q.data?.refunds ?? []).length === 0 && !q.isLoading && <EmptyState title="No refunds" description="Refund requests will queue here." />}
      {dialog}
    </div>
  );
}

function BankTransfers() {
  const [status, setStatus] = useState('');
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'bank']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'bank', status],
    queryFn: () => api.get<{ transfers: Array<{ id: string; paymentId: string; referenceNumber: string; expectedCents: number; transferredCents: number | null; verifiedCents: number | null; status: string; proofFileName: string | null; submittedAt: number | null }> }>(
      `/admin/finance/bank-transfers?${status ? `status=${status}` : ''}`,
    ),
  });
  const [verify, setVerify] = useState({ cents: '', ref: '' });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {['', 'pending', 'pending_verification', 'verified', 'partial', 'rejected'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-3'}`}>{s === '' ? 'All' : s.replace(/_/g, ' ')}</button>
        ))}
      </div>
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}
      {(q.data?.transfers ?? []).map((t) => (
        <div key={t.id} className="rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="font-semibold">{t.referenceNumber}</span> <span className="text-xs text-ink-4">expected <Money cents={t.expectedCents} /> · transferred {t.transferredCents != null ? <Money cents={t.transferredCents} /> : '—'} · {time(t.submittedAt)}</span><div className="mt-1"><StatusPill status={t.status} /></div></div>
            <div className="flex items-center gap-2">
              {t.proofFileName && <a className="text-xs font-semibold underline-offset-2 hover:underline" href={`/api/finance/bank-transfer/proof/${t.id}`} target="_blank" rel="noreferrer">View proof ({t.proofFileName})</a>}
              {!['verified', 'rejected'].includes(t.status) && (
                <Button size="sm" onClick={() => ask({
                  title: `Verify receipt of ${t.expectedCents}c?`,
                  confirmLabel: 'Verify & confirm payment',
                  body: (
                    <div className="space-y-3">
                      <p>Confirm the money actually arrived. Only exact matches settle automatically.</p>
                      <div><Label>Verified cents</Label><Input value={verify.cents} onChange={(e) => setVerify({ ...verify, cents: e.target.value })} placeholder={String(t.expectedCents)} inputMode="numeric" /></div>
                      <div><Label>Bank reference</Label><Input value={verify.ref} onChange={(e) => setVerify({ ...verify, ref: e.target.value })} placeholder="CBQ-…" /></div>
                    </div>
                  ),
                  action: async () => {
                    try {
                      await api.post(`/admin/finance/bank-transfers/${t.id}/verify`, { verifiedCents: Number(verify.cents), bankReference: verify.ref });
                      r.done('Transfer verified');
                    } catch (e) { r.fail(e); }
                  },
                })}>Verify</Button>
              )}
            </div>
          </div>
        </div>
      ))}
      {(q.data?.transfers ?? []).length === 0 && !q.isLoading && <EmptyState title="Queue empty" description="Bank transfers awaiting verification will appear here." />}
      {dialog}
    </div>
  );
}

function Cod() {
  const [status, setStatus] = useState('');
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'cod']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'cod', status],
    queryFn: () => api.get<{ collections: Array<{ id: string; paymentId: string; expectedCents: number; collectedCents: number | null; discrepancyCents: number; status: string; reconciliationStatus: string }> }>(
      `/admin/finance/cod?${status ? `status=${status}` : ''}`,
    ),
  });
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {['', 'unreconciled', 'matched', 'under_collected', 'over_collected', 'missing', 'disputed', 'reconciled'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${status === s ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-3'}`}>{s === '' ? 'All' : s.replace(/_/g, ' ')}</button>
        ))}
      </div>
      {(q.data?.collections ?? []).map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div>Expected <Money cents={c.expectedCents} /> · collected {c.collectedCents != null ? <Money cents={c.collectedCents} /> : '—'} · diff <Money cents={c.discrepancyCents} /><div className="mt-1 flex gap-2"><StatusPill status={c.status} /><StatusPill status={c.reconciliationStatus} /></div></div>
          <Button size="sm" variant="outline" onClick={() => ask({
            title: 'Mark COD reconciled?',
            confirmLabel: 'Reconcile',
            body: <p>Confirm the cash position for payment {c.paymentId.slice(0, 8)} is resolved.</p>,
            action: async () => {
              try {
                await api.post(`/admin/finance/cod/${c.paymentId}/reconcile`, { status: 'reconciled' });
                r.done('COD reconciled');
              } catch (e) { r.fail(e); }
            },
          })}>Reconcile</Button>
        </div>
      ))}
      {(q.data?.collections ?? []).length === 0 && !q.isLoading && <EmptyState title="No COD collections" description="COD expectations and collections will appear here." />}
      {dialog}
    </div>
  );
}

function Settlements() {
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'settlements']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'settlements'],
    queryFn: () => api.get<{ settlements: Array<{ id: string; settlementNumber: string; supplierId: string; netCents: number; status: string; createdAt: number }> }>('/admin/finance/settlements'),
  });
  const [supplierId, setSupplierId] = useState('');
  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-ink/10 bg-paper p-4"
        onSubmit={(e) => {
          e.preventDefault();
          ask({
            title: 'Create settlement?',
            confirmLabel: 'Create from eligible earnings',
            body: <p>Groups all currently <strong>eligible</strong> earnings for supplier {supplierId.slice(0, 8)} into one settlement. Only eligible earnings are included.</p>,
            action: async () => {
              try {
                await api.post('/admin/finance/settlements', { supplierId });
                r.done('Settlement created');
              } catch (e2) { r.fail(e2); }
            },
          });
        }}
      >
        <div className="w-72"><Label>Supplier ID</Label><Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Supplier…" required /></div>
        <Button type="submit">Create settlement</Button>
      </form>
      {(q.data?.settlements ?? []).map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{s.settlementNumber}</span> <span className="text-xs text-ink-4">{time(s.createdAt)}</span><div className="mt-1"><StatusPill status={s.status} /></div></div>
          <div className="flex items-center gap-2">
            <Money cents={s.netCents} />
            {s.status === 'pending' && <Button size="sm" onClick={() => ask({ title: `Approve settlement ${s.settlementNumber}?`, confirmLabel: 'Approve', body: <p>Net <Money cents={s.netCents} /> becomes payable to the supplier.</p>, action: async () => { try { await api.post(`/admin/finance/settlements/${s.id}/approve`, {}); r.done('Settlement approved'); } catch (e) { r.fail(e); } } })}>Approve</Button>}
            {s.status === 'approved' && <Button size="sm" onClick={() => ask({ title: `Create payout for ${s.settlementNumber}?`, confirmLabel: 'Create payout', body: <p>This creates a bank payout of <Money cents={s.netCents} /> from this settlement.</p>, action: async () => { try { await api.post('/admin/finance/payouts', { settlementId: s.id, method: 'bank' }); r.done('Payout created'); } catch (e) { r.fail(e); } } })}>Pay out</Button>}
          </div>
        </div>
      ))}
      {(q.data?.settlements ?? []).length === 0 && !q.isLoading && <EmptyState title="No settlements" description="Create one from a supplier's eligible earnings." />}
      {dialog}
    </div>
  );
}

function AdminPayouts() {
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'payouts']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'payouts'],
    queryFn: () => api.get<{ items: Array<{ id: string; payoutNumber: string | null; supplierId: string; settlementId: string | null; netCents: number; status: string; method: string; createdAt: number }> }>('/payouts/all'),
  });
  const [extRef, setExtRef] = useState('');
  return (
    <div className="space-y-2">
      {q.isError && <ErrorBanner message={(q.error as ApiError).message} />}
      {(q.data?.items ?? []).map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{p.payoutNumber ?? p.id.slice(0, 8)}</span> <span className="text-xs capitalize text-ink-4">{p.method} · {time(p.createdAt)}</span><div className="mt-1"><StatusPill status={p.status} /></div></div>
          <div className="flex items-center gap-2">
            <Money cents={p.netCents} />
            {['pending', 'approved', 'processing'].includes(p.status) && (
              <Button size="sm" onClick={() => ask({
                title: `Complete payout of ${p.netCents}c?`,
                confirmLabel: 'Mark completed',
                body: (
                  <div className="space-y-3">
                    <p>Confirm the money actually reached the supplier. Completed payouts are immutable.</p>
                    <div><Label>External / bank reference</Label><Input value={extRef} onChange={(e) => setExtRef(e.target.value)} placeholder="BANK-REF-…" /></div>
                  </div>
                ),
                action: async () => {
                  try {
                    if (p.status === 'pending') await api.post(`/admin/finance/payouts/${p.id}/approve`, {});
                    if (p.status !== 'processing') await api.post(`/admin/finance/payouts/${p.id}/process`, {});
                    await api.post(`/admin/finance/payouts/${p.id}/complete`, { externalReference: extRef || undefined });
                    r.done('Payout completed');
                  } catch (e) { r.fail(e); }
                },
              })}>Complete</Button>
            )}
          </div>
        </div>
      ))}
      {(q.data?.items ?? []).length === 0 && !q.isLoading && <EmptyState title="No payouts" description="Payouts are created from approved settlements." />}
      {dialog}
    </div>
  );
}

function Recon() {
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'recon']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'recon'],
    queryFn: () => api.get<{ exceptions: Array<{ id: string; kind: string; severity: string; entityType: string | null; entityId: string | null; expectedCents: number | null; actualCents: number | null; differenceCents: number; detail: string | null; status: string; createdAt: number }> }>('/admin/finance/reconciliation/exceptions?status=open'),
  });
  const [note, setNote] = useState('');
  return (
    <div className="space-y-3">
      <Button onClick={() => ask({ title: 'Run reconciliation?', confirmLabel: 'Run engine', body: <p>Scans payments, orders, transfers, COD, earnings, settlements, payouts and refunds for unexplained rupees.</p>, action: async () => { try { const s = await api.post<{ raised: number }>('/admin/finance/reconciliation/run', {}); r.done(`Raised ${s.raised} exceptions`); } catch (e) { r.fail(e); } } })}>Run reconciliation</Button>
      {(q.data?.exceptions ?? []).map((x) => (
        <div key={x.id} className="rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><span className="font-semibold">{x.kind.replace(/_/g, ' ')}</span> <StatusPill status={x.severity} /><div className="text-xs text-ink-4">{x.detail ?? ''} · expected {x.expectedCents ?? '—'} · actual {x.actualCents ?? '—'} · diff {x.differenceCents}</div></div>
            <Button size="sm" variant="outline" onClick={() => ask({
              title: 'Resolve exception?', confirmLabel: 'Resolve',
              body: (<div className="space-y-2"><p>Record how this was explained.</p><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note…" /></div>),
              action: async () => { try { await api.post(`/admin/finance/reconciliation/exceptions/${x.id}/resolve`, { note }); r.done('Exception resolved'); } catch (e) { r.fail(e); } },
            })}>Resolve</Button>
          </div>
        </div>
      ))}
      {(q.data?.exceptions ?? []).length === 0 && !q.isLoading && <EmptyState title="No open exceptions" description="Every rupee is currently explainable." />}
      {dialog}
    </div>
  );
}

function Adjustments() {
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'adjust']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'adjust'],
    queryFn: () => api.get<{ adjustments: Array<{ id: string; adjustmentNumber: string; kind: string; accountType: string; accountId: string; amountCents: number; status: string; reason: string }> }>('/admin/finance/adjustments'),
  });
  const [form, setForm] = useState({ kind: 'credit', accountType: 'supplier', accountId: '', amountCents: '', reason: '' });
  return (
    <div className="space-y-3">
      <form
        className="grid gap-2 rounded-xl border border-ink/10 bg-paper p-4 md:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          ask({
            title: `${form.kind === 'credit' ? 'Credit' : 'Debit'} ${form.amountCents}c?`,
            confirmLabel: 'Create adjustment',
            body: <p>Creates a <strong>new correction record</strong> — completed financial history is never edited. Requires a second approver.</p>,
            action: async () => {
              try {
                await api.post('/admin/finance/adjustments', { ...form, amountCents: Number(form.amountCents) });
                r.done('Adjustment created');
              } catch (e2) { r.fail(e2); }
            },
          });
        }}
      >
        <div><Label>Kind</Label><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="credit">Credit</option><option value="debit">Debit</option></Select></div>
        <div><Label>Account</Label><Select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value })}><option value="supplier">Supplier</option><option value="business">Business</option><option value="platform">Platform</option></Select></div>
        <div className="md:col-span-2"><Label>Account ID</Label><Input value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} required /></div>
        <div><Label>Cents</Label><Input value={form.amountCents} onChange={(e) => setForm({ ...form, amountCents: e.target.value })} required inputMode="numeric" /></div>
        <div><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required /></div>
        <div className="md:col-span-6"><Button type="submit">Create</Button></div>
      </form>
      {(q.data?.adjustments ?? []).map((a) => (
        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{a.adjustmentNumber}</span> <span className="text-xs text-ink-4">{a.kind} · {a.accountType} · {a.reason}</span><div className="mt-1"><StatusPill status={a.status} /></div></div>
          <div className="flex items-center gap-2">
            <Money cents={a.amountCents} />
            {a.status === 'pending' && <Button size="sm" onClick={() => ask({ title: 'Approve adjustment?', confirmLabel: 'Approve', body: <p>A second pair of eyes is required — you cannot approve your own adjustment.</p>, action: async () => { try { await api.post(`/admin/finance/adjustments/${a.id}/approve`, {}); r.done('Adjustment approved'); } catch (e) { r.fail(e); } } })}>Approve</Button>}
            {a.status === 'approved' && <Button size="sm" onClick={() => ask({ title: 'Apply adjustment to ledger?', confirmLabel: 'Apply', body: <p>Writes the ledger leg and updates the earnings projection.</p>, action: async () => { try { await api.post(`/admin/finance/adjustments/${a.id}/apply`, {}); r.done('Adjustment applied'); } catch (e) { r.fail(e); } } })}>Apply</Button>}
          </div>
        </div>
      ))}
      {dialog}
    </div>
  );
}

function Commission() {
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'commission']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'commission'],
    queryFn: () => api.get<{ rules: Array<{ id: string; scope: string; scopeId: string | null; bps: number; name: string | null; active: boolean }> }>('/admin/finance/commission-rules'),
  });
  const [form, setForm] = useState({ scope: 'global', scopeId: '', bps: '250', name: '' });
  return (
    <div className="space-y-3">
      <form
        className="grid gap-2 rounded-xl border border-ink/10 bg-paper p-4 md:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          ask({
            title: `Set ${form.scope} commission to ${form.bps}bps?`,
            confirmLabel: 'Save rule',
            body: <p>Applies to <strong>new</strong> payments only — historical transactions keep their snapshotted rates.</p>,
            action: async () => {
              try {
                await api.post('/admin/finance/commission-rules', { scope: form.scope, scopeId: form.scopeId || undefined, bps: Number(form.bps), name: form.name || undefined });
                r.done('Commission rule saved');
              } catch (e2) { r.fail(e2); }
            },
          });
        }}
      >
        <div><Label>Scope</Label><Select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="global">Global</option><option value="category">Category</option><option value="supplier">Supplier</option><option value="product">Product</option><option value="promotional">Promotional</option></Select></div>
        <div><Label>Scope ID</Label><Input value={form.scopeId} onChange={(e) => setForm({ ...form, scopeId: e.target.value })} placeholder="—" /></div>
        <div><Label>BPS</Label><Input value={form.bps} onChange={(e) => setForm({ ...form, bps: e.target.value })} required inputMode="numeric" /></div>
        <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Optional" /></div>
        <div className="flex items-end"><Button type="submit">Save</Button></div>
      </form>
      {(q.data?.rules ?? []).map((x) => (
        <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{x.name ?? x.scope}</span> <span className="text-xs text-ink-4">{x.scope}{x.scopeId ? ` · ${x.scopeId}` : ''} · {x.bps}bps {(x.bps / 100).toFixed(2)}%</span></div>
          <Button size="sm" variant="outline" onClick={async () => { try { await api.post(`/admin/finance/commission-rules/${x.id}/${x.active ? 'deactivate' : 'activate'}`, {}); r.done('Rule updated'); } catch (e) { r.fail(e); } }}>{x.active ? 'Deactivate' : 'Activate'}</Button>
        </div>
      ))}
      {(q.data?.rules ?? []).length === 0 && !q.isLoading && <EmptyState title="No overrides" description="The global platform fee applies until scoped rules are added." />}
      {dialog}
    </div>
  );
}
