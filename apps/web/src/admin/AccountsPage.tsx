import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Select, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { Money, StatusPill, time, useConfirm } from '@/accounts/shared';
import { formatLKR } from '@/lib/format';
import {
  BanknoteIcon,
  Building2Icon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  DownloadIcon,
  Edit3Icon,
  LayoutGridIcon,
  PackageIcon,
  PercentIcon,
  RefreshCwIcon,
  ScaleIcon,
  SearchIcon,
  TrendingUpIcon,
  XCircleIcon,
} from '@/components/icons';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CellStack,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
} from './ui';

type Tab = 'overview' | 'payments' | 'refunds' | 'bank' | 'cod' | 'settlements' | 'payouts' | 'recon' | 'adjust' | 'commission';

const methodLabel = (m: string | null | undefined) => (m ?? 'unknown').replace(/_/g, ' ');

export function AdminAccountsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'overview';
  const setTab = (t: string) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p);
  };
  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Commerce &amp; Supply</span>
            <span className="text-ink-4">/</span>
            <span>Finance Operations</span>
          </>
        }
        title="Accounts"
        description="GMV, commission, supplier payable, pending money, and every exception."
      />
      <Tabs
        items={[
          { key: 'overview', label: 'Overview', icon: <LayoutGridIcon size={15} /> },
          { key: 'payments', label: 'Payments', icon: <CreditCardIcon size={15} /> },
          { key: 'refunds', label: 'Refunds', icon: <RefreshCwIcon size={15} /> },
          { key: 'bank', label: 'Bank transfers', icon: <Building2Icon size={15} /> },
          { key: 'cod', label: 'COD', icon: <BanknoteIcon size={15} /> },
          { key: 'settlements', label: 'Settlements', icon: <ScaleIcon size={15} /> },
          { key: 'payouts', label: 'Payouts', icon: <PackageIcon size={15} /> },
          { key: 'recon', label: 'Reconciliation', icon: <SearchIcon size={15} /> },
          { key: 'adjust', label: 'Adjustments', icon: <Edit3Icon size={15} /> },
          { key: 'commission', label: 'Commission', icon: <PercentIcon size={15} /> },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="Accounts sections"
      />
      <div>
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
    </AdminPage>
  );
}

/** Skeleton placeholder for card-row lists. */
function RowListSkeleton() {
  return (
    <Card padded={false}>
      <TableSkeleton rows={4} cols={4} />
    </Card>
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
      byMethod: Array<{ method: string | null; cents: number; count: number }>;
    }>('/admin/finance/overview'),
  });
  if (q.isError) {
    return (
      <Callout
        tone="danger"
        title="Could not load the finance overview"
        action={
          <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>
            Retry
          </Button>
        }
      >
        {(q.error as ApiError).message}
      </Callout>
    );
  }
  const d = q.data;
  return (
    <div className="space-y-6">
      <StatGrid cols={4}>
        <StatCard label="GMV" value={d ? formatLKR(d.gmvCents) : '—'} sub={d ? `${d.successfulPayments} successful payments` : undefined} icon={<TrendingUpIcon size={16} />} loading={q.isLoading} />
        <StatCard label="VYRO commission" value={d ? formatLKR(d.commissionCents) : '—'} sub="Platform fee revenue" icon={<PercentIcon size={16} />} loading={q.isLoading} />
        <StatCard
          label="Supplier payable"
          value={d ? formatLKR(d.supplierPayableCents) : '—'}
          sub={d ? `${formatLKR(d.pendingSettlementsCents)} pending settlement` : undefined}
          icon={<BanknoteIcon size={16} />}
          loading={q.isLoading}
        />
        <StatCard label="Paid out" value={d ? formatLKR(d.completedPayoutsCents) : '—'} sub="Completed supplier payouts" icon={<CheckCircleIcon size={16} />} loading={q.isLoading} />
        <StatCard label="Pending payments" value={d ? formatLKR(d.pendingCents) : '—'} sub={d ? `${d.pendingPayments} payments in flight` : undefined} icon={<ClockIcon size={16} />} tone={d && d.pendingPayments > 0 ? 'warning' : 'neutral'} loading={q.isLoading} />
        <StatCard label="Failed payments" value={d ? d.failedPayments : '—'} sub="Unsuccessful transactions" icon={<XCircleIcon size={16} />} tone={d && d.failedPayments > 0 ? 'danger' : 'neutral'} loading={q.isLoading} />
        <StatCard
          label="Refunded"
          value={d ? formatLKR(d.refundedCents) : '—'}
          sub={d ? `${d.refundCount} refunds · ${(d.refundRateBps / 100).toFixed(2)}%` : undefined}
          icon={<RefreshCwIcon size={16} />}
          loading={q.isLoading}
        />
        <StatCard
          label="COD outstanding"
          value={d ? formatLKR(d.codOutstandingCents) : '—'}
          sub={d ? `${d.codOutstandingCount} uncollected · ${d.bankTransferQueueCount} bank transfers queued` : undefined}
          icon={<PackageIcon size={16} />}
          loading={q.isLoading}
        />
      </StatGrid>

      {d ? (
        <Panel
          title="By payment method"
          description="Collected volume grouped by payment rail."
          icon={<CreditCardIcon size={16} />}
          footer={
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <a href="/api/admin/finance/exports/payments.csv" className="inline-flex items-center gap-1.5 text-xs font-semibold text-copper transition-colors hover:text-ink">
                <DownloadIcon size={13} />
                Export payments CSV
              </a>
              <a href="/api/admin/finance/exports/ledger.csv" className="inline-flex items-center gap-1.5 text-xs font-semibold text-copper transition-colors hover:text-ink">
                <DownloadIcon size={13} />
                Export ledger CSV
              </a>
            </div>
          }
        >
          {d.byMethod.length === 0 ? (
            <p className="text-sm text-ink-4">No payment activity recorded yet.</p>
          ) : (
            <div className="divide-y divide-ink/[0.06]">
              {d.byMethod.map((m, i) => (
                <div key={m.method ?? `method-${i}`} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2.5 text-sm">
                    <Pill tone="info" className="capitalize">{methodLabel(m.method)}</Pill>
                    <span className="text-xs text-ink-4">× {m.count} payments</span>
                  </span>
                  <Money cents={m.cents} />
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function Payments() {
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [orderId, setOrderId] = useState('');
  const q = useQuery({
    queryKey: ['admin-accounts', 'payments', status, method, orderId],
    queryFn: () => api.get<{ items: Array<{ id: string; paymentNumber: string | null; method: string | null; status: string; amountCents: number; purchaseOrderId: string; createdAt: number }> }>(
      `/admin/finance/payments?${status ? `status=${status}&` : ''}${method ? `method=${method}&` : ''}${orderId ? `orderId=${orderId}&` : ''}limit=50`,
    ),
  });
  const items = q.data?.items ?? [];
  return (
    <TableCard
      title="Payments"
      description="Every payment captured across the platform."
      toolbar={
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40"><Label>Status</Label><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="pending">Pending</option><option value="confirmed">Paid</option><option value="failed">Failed</option><option value="cancelled">Cancelled</option><option value="refunded">Refunded</option></Select></div>
          <div className="w-44"><Label>Method</Label><Select value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All</option><option value="online">PayHere</option><option value="cash">COD</option><option value="bank_transfer">Bank</option></Select></div>
          <div className="w-64"><Label>Order ID</Label><Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Filter by order…" /></div>
        </div>
      }
      footer={
        <span>
          <strong className="text-ink">{items.length}</strong> {items.length === 1 ? 'payment' : 'payments'}
          {status || method || orderId ? ' · filters applied' : ''}
        </span>
      }
    >
      {q.isError ? (
        <div className="p-5 sm:p-6">
          <Callout
            tone="danger"
            title="Could not load payments"
            action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}
          >
            {(q.error as ApiError).message}
          </Callout>
        </div>
      ) : q.isLoading ? (
        <TableSkeleton rows={6} cols={5} />
      ) : items.length === 0 ? (
        <EmptyBlock
          icon={<CreditCardIcon size={22} />}
          title="No payments"
          description="No payments match these filters."
        />
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Method</th>
              <th>Status</th>
              <th className="text-right">Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/admin/accounts/payments/${p.id}`} className="font-mono text-xs font-medium text-copper transition-colors hover:text-ink">
                    {p.paymentNumber ?? p.id.slice(0, 8)}
                  </Link>
                </td>
                <td>
                  <Pill tone="neutral" className="capitalize">{methodLabel(p.method)}</Pill>
                </td>
                <td><StatusPill status={p.status} /></td>
                <td className="text-right"><Money cents={p.amountCents} /></td>
                <td><CellStack primary={time(p.createdAt)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableCard>
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

function StatusFilterTabs({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Tabs
      items={options.map((s) => ({ key: s, label: s === '' ? 'All' : s.replace(/_/g, ' ') }))}
      value={value}
      onChange={onChange}
      ariaLabel="Filter by status"
    />
  );
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
  const refunds = q.data?.refunds ?? [];
  return (
    <div className="space-y-4">
      <StatusFilterTabs value={status} onChange={setStatus} options={['', 'requested', 'approved', 'processing', 'completed', 'failed']} />
      {q.isError ? (
        <Callout tone="danger" title="Could not load refunds" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : refunds.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<CheckCircleIcon size={22} />} title="No refunds" description="Refund requests will queue here." /></Card>
      ) : (
        refunds.map((x) => (
          <Card key={x.id} padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <CellStack
              primary={<span className="font-semibold">{x.refundNumber ?? x.id.slice(0, 8)}</span>}
              secondary={
                <span className="flex items-center gap-2">
                  <StatusPill status={x.status} />
                  <span>{x.reason ?? ''} · {time(x.createdAt)}</span>
                </span>
              }
            />
            <div className="flex items-center gap-2">
              <Money cents={x.amountCents} />
              {x.status === 'requested' && (
                <>
                  <Button size="sm" variant="success" onClick={() => act(x.id, 'approve', `Approve refund of ${formatLKR(x.amountCents)}?`, 'Approve refund', 'This moves the refund to processing. Money movement is recorded in the ledger.')}>Approve</Button>
                  <Button size="sm" variant="ghost" className="text-rose hover:bg-rose/10" onClick={() => act(x.id, 'reject', 'Reject refund?', 'Reject', 'The requester will be notified.')}>Reject</Button>
                </>
              )}
              {(x.status === 'approved' || x.status === 'processing') && (
                <Button size="sm" onClick={() => act(x.id, 'complete', `Mark refund of ${formatLKR(x.amountCents)} complete?`, 'Mark complete', 'Confirm the money actually left VYRO (provider/bank/cash). This adjusts supplier earnings.')}>Complete</Button>
              )}
            </div>
          </Card>
        ))
      )}
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
  const transfers = q.data?.transfers ?? [];
  return (
    <div className="space-y-4">
      <StatusFilterTabs value={status} onChange={setStatus} options={['', 'pending', 'pending_verification', 'verified', 'partial', 'rejected']} />
      {q.isError ? (
        <Callout tone="danger" title="Could not load bank transfers" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : transfers.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<Building2Icon size={22} />} title="Queue empty" description="Bank transfers awaiting verification will appear here." /></Card>
      ) : (
        transfers.map((t) => (
          <Card key={t.id} padded={false} className="px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CellStack
                primary={<span className="font-semibold">{t.referenceNumber}</span>}
                secondary={
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusPill status={t.status} />
                    <span>expected <Money cents={t.expectedCents} /> · transferred {t.transferredCents != null ? <Money cents={t.transferredCents} /> : '—'} · {time(t.submittedAt)}</span>
                  </span>
                }
              />
              <div className="flex items-center gap-2">
                {t.proofFileName && (
                  <a className="text-xs font-semibold text-copper transition-colors hover:text-ink" href={`/api/finance/bank-transfer/proof/${t.id}`} target="_blank" rel="noreferrer">
                    View proof ({t.proofFileName})
                  </a>
                )}
                {!['verified', 'rejected'].includes(t.status) && (
                  <Button size="sm" onClick={() => ask({
                    title: `Verify receipt of ${formatLKR(t.expectedCents)}?`,
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
          </Card>
        ))
      )}
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
  const collections = q.data?.collections ?? [];
  return (
    <div className="space-y-4">
      <StatusFilterTabs value={status} onChange={setStatus} options={['', 'unreconciled', 'matched', 'under_collected', 'over_collected', 'missing', 'disputed', 'reconciled']} />
      {q.isError ? (
        <Callout tone="danger" title="Could not load COD collections" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : collections.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<BanknoteIcon size={22} />} title="No COD collections" description="COD expectations and collections will appear here." /></Card>
      ) : (
        collections.map((c) => (
          <Card key={c.id} padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <CellStack
              primary={
                <span>
                  Expected <Money cents={c.expectedCents} /> · collected {c.collectedCents != null ? <Money cents={c.collectedCents} /> : '—'} · diff <Money cents={c.discrepancyCents} />
                </span>
              }
              secondary={
                <span className="flex gap-2">
                  <StatusPill status={c.status} />
                  <StatusPill status={c.reconciliationStatus} />
                </span>
              }
            />
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
          </Card>
        ))
      )}
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
  const settlements = q.data?.settlements ?? [];
  return (
    <div className="space-y-4">
      <Panel
        title="Create settlement"
        description="Groups all currently eligible earnings for a supplier into one settlement."
        icon={<ScaleIcon size={16} />}
      >
        <form
          className="flex flex-wrap items-end gap-3"
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
          <Button type="submit" size="sm" className="h-11">Create settlement</Button>
        </form>
      </Panel>
      {q.isError ? (
        <Callout tone="danger" title="Could not load settlements" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : settlements.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<ScaleIcon size={22} />} title="No settlements" description="Create one from a supplier's eligible earnings." /></Card>
      ) : (
        settlements.map((s) => (
          <Card key={s.id} padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <CellStack
              primary={<span className="font-semibold">{s.settlementNumber}</span>}
              secondary={
                <span className="flex items-center gap-2">
                  <StatusPill status={s.status} />
                  <span>{time(s.createdAt)}</span>
                </span>
              }
            />
            <div className="flex items-center gap-2">
              <Money cents={s.netCents} />
              {s.status === 'pending' && <Button size="sm" variant="success" onClick={() => ask({ title: `Approve settlement ${s.settlementNumber}?`, confirmLabel: 'Approve', body: <p>Net <Money cents={s.netCents} /> becomes payable to the supplier.</p>, action: async () => { try { await api.post(`/admin/finance/settlements/${s.id}/approve`, {}); r.done('Settlement approved'); } catch (e) { r.fail(e); } } })}>Approve</Button>}
              {s.status === 'approved' && <Button size="sm" onClick={() => ask({ title: `Create payout for ${s.settlementNumber}?`, confirmLabel: 'Create payout', body: <p>This creates a bank payout of <Money cents={s.netCents} /> from this settlement.</p>, action: async () => { try { await api.post('/admin/finance/payouts', { settlementId: s.id, method: 'bank' }); r.done('Payout created'); } catch (e) { r.fail(e); } } })}>Pay out</Button>}
            </div>
          </Card>
        ))
      )}
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
  const payouts = q.data?.items ?? [];
  return (
    <div className="space-y-4">
      {q.isError ? (
        <Callout tone="danger" title="Could not load payouts" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : payouts.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<PackageIcon size={22} />} title="No payouts" description="Payouts are created from approved settlements." /></Card>
      ) : (
        payouts.map((p) => (
          <Card key={p.id} padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <CellStack
              primary={<span className="font-semibold">{p.payoutNumber ?? p.id.slice(0, 8)}</span>}
              secondary={
                <span className="flex items-center gap-2">
                  <StatusPill status={p.status} />
                  <span className="capitalize">{p.method} · {time(p.createdAt)}</span>
                </span>
              }
            />
            <div className="flex items-center gap-2">
              <Money cents={p.netCents} />
              {['pending', 'approved', 'processing'].includes(p.status) && (
                <Button size="sm" onClick={() => ask({
                  title: `Complete payout of ${formatLKR(p.netCents)}?`,
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
          </Card>
        ))
      )}
      {dialog}
    </div>
  );
}

function Recon() {
  const { ask, dialog } = useConfirm();
  const r = useRefresh([['admin-accounts', 'recon']]);
  const q = useQuery({
    queryKey: ['admin-accounts', 'recon'],
    queryFn: () => api.get<{ exceptions: Array<{ id: string; kind: string | null; severity: string; entityType: string | null; entityId: string | null; expectedCents: number | null; actualCents: number | null; differenceCents: number; detail: string | null; status: string; createdAt: number }> }>('/admin/finance/reconciliation/exceptions?status=open'),
  });
  const [note, setNote] = useState('');
  const exceptions = q.data?.exceptions ?? [];
  return (
    <div className="space-y-4">
      <Card padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <CellStack primary="Reconciliation engine" secondary="Scans payments, orders, transfers, COD, earnings, settlements, payouts and refunds for unexplained rupees." />
        <Button size="sm" icon={<RefreshCwIcon size={14} />} onClick={() => ask({ title: 'Run reconciliation?', confirmLabel: 'Run engine', body: <p>Scans payments, orders, transfers, COD, earnings, settlements, payouts and refunds for unexplained rupees.</p>, action: async () => { try { const s = await api.post<{ raised: number }>('/admin/finance/reconciliation/run', {}); r.done(`Raised ${s.raised} exceptions`); } catch (e) { r.fail(e); } } })}>Run reconciliation</Button>
      </Card>
      {q.isError ? (
        <Callout tone="danger" title="Could not load exceptions" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : exceptions.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<CheckCircleIcon size={22} />} title="No open exceptions" description="Every rupee is currently explainable." /></Card>
      ) : (
        exceptions.map((x) => (
          <Card key={x.id} padded={false} className="px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CellStack
                primary={
                  <span className="flex items-center gap-2">
                    <span className="font-semibold capitalize">{methodLabel(x.kind)}</span>
                    <StatusPill status={x.severity} />
                  </span>
                }
                secondary={`${x.detail ?? ''} · expected ${x.expectedCents ?? '—'} · actual ${x.actualCents ?? '—'} · diff ${x.differenceCents}`}
              />
              <Button size="sm" variant="outline" onClick={() => ask({
                title: 'Resolve exception?', confirmLabel: 'Resolve',
                body: (<div className="space-y-2"><p>Record how this was explained.</p><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note…" /></div>),
                action: async () => { try { await api.post(`/admin/finance/reconciliation/exceptions/${x.id}/resolve`, { note }); r.done('Exception resolved'); } catch (e) { r.fail(e); } },
              })}>Resolve</Button>
            </div>
          </Card>
        ))
      )}
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
  const adjustments = q.data?.adjustments ?? [];
  return (
    <div className="space-y-4">
      <Panel
        title="New adjustment"
        description="Creates a correction record — completed financial history is never edited. Requires a second approver."
        icon={<Edit3Icon size={16} />}
      >
        <form
          className="grid gap-3 md:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            ask({
              title: `${form.kind === 'credit' ? 'Credit' : 'Debit'} ${formatLKR(Number(form.amountCents) || 0)}?`,
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
          <div className="md:col-span-6"><Button type="submit" size="sm">Create</Button></div>
        </form>
      </Panel>
      {q.isError ? (
        <Callout tone="danger" title="Could not load adjustments" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : adjustments.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<Edit3Icon size={22} />} title="No adjustments" description="Correction records will appear here." /></Card>
      ) : (
        adjustments.map((a) => (
          <Card key={a.id} padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <CellStack
              primary={<span className="font-semibold">{a.adjustmentNumber}</span>}
              secondary={
                <span className="flex items-center gap-2">
                  <StatusPill status={a.status} />
                  <span>{a.kind} · {a.accountType} · {a.reason}</span>
                </span>
              }
            />
            <div className="flex items-center gap-2">
              <Money cents={a.amountCents} />
              {a.status === 'pending' && <Button size="sm" variant="success" onClick={() => ask({ title: 'Approve adjustment?', confirmLabel: 'Approve', body: <p>A second pair of eyes is required — you cannot approve your own adjustment.</p>, action: async () => { try { await api.post(`/admin/finance/adjustments/${a.id}/approve`, {}); r.done('Adjustment approved'); } catch (e) { r.fail(e); } } })}>Approve</Button>}
              {a.status === 'approved' && <Button size="sm" onClick={() => ask({ title: 'Apply adjustment to ledger?', confirmLabel: 'Apply', body: <p>Writes the ledger leg and updates the earnings projection.</p>, action: async () => { try { await api.post(`/admin/finance/adjustments/${a.id}/apply`, {}); r.done('Adjustment applied'); } catch (e) { r.fail(e); } } })}>Apply</Button>}
            </div>
          </Card>
        ))
      )}
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
  const rules = q.data?.rules ?? [];
  return (
    <div className="space-y-4">
      <Panel
        title="Commission rule"
        description="Applies to new payments only — historical transactions keep their snapshotted rates."
        icon={<PercentIcon size={16} />}
      >
        <form
          className="grid gap-3 md:grid-cols-5"
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
          <div className="flex items-end"><Button type="submit" size="sm">Save</Button></div>
        </form>
      </Panel>
      {q.isError ? (
        <Callout tone="danger" title="Could not load commission rules" action={<Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button>}>
          {(q.error as ApiError).message}
        </Callout>
      ) : null}
      {q.isLoading ? (
        <RowListSkeleton />
      ) : rules.length === 0 ? (
        <Card padded={false}><EmptyBlock icon={<PercentIcon size={22} />} title="No overrides" description="The global platform fee applies until scoped rules are added." /></Card>
      ) : (
        rules.map((x) => (
          <Card key={x.id} padded={false} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <CellStack
              primary={
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{x.name ?? x.scope}</span>
                  <Pill tone={x.active ? 'success' : 'neutral'} dot>{x.active ? 'Active' : 'Inactive'}</Pill>
                </span>
              }
              secondary={`${x.scope}${x.scopeId ? ` · ${x.scopeId}` : ''} · ${x.bps}bps (${(x.bps / 100).toFixed(2)}%)`}
            />
            <Button size="sm" variant="outline" onClick={async () => { try { await api.post(`/admin/finance/commission-rules/${x.id}/${x.active ? 'deactivate' : 'activate'}`, {}); r.done('Rule updated'); } catch (e) { r.fail(e); } }}>{x.active ? 'Deactivate' : 'Activate'}</Button>
          </Card>
        ))
      )}
      {dialog}
    </div>
  );
}
