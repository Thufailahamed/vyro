import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Surface, ErrorBanner, Button, EmptyState, StatusBadge } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useRefundQueue,
  useApproveRefund,
  useRejectRefund,
  usePayoutBatchQueue,
  useCreatePayoutBatch,
  useApprovePayoutBatch,
  useLedgerSummary,
  useOpenChargebacks,
  useResolveChargeback,
} from './useAdminMoney';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  ArrowRightIcon,
  TrendingUpIcon,
  PackageIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';

type Tab = 'refunds' | 'payouts' | 'ledger' | 'chargebacks';

function formatFullDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'refunds';

  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  // Top KPI Queries
  const refundQueue = useRefundQueue();
  const payoutBatches = usePayoutBatchQueue();
  const chargebacks = useOpenChargebacks();
  const ledgerSummary = useLedgerSummary({});

  const pendingRefunds = useMemo(() => {
    return (refundQueue.data ?? []).filter((r) => r.status === 'requested');
  }, [refundQueue.data]);

  const pendingRefundsTotalCents = useMemo(() => {
    return pendingRefunds.reduce((sum, r) => sum + r.amountCents, 0);
  }, [pendingRefunds]);

  const pendingBatches = useMemo(() => {
    return (payoutBatches.data ?? []).filter((b) => b.status === 'pending');
  }, [payoutBatches.data]);

  const pendingBatchesTotalCents = useMemo(() => {
    return pendingBatches.reduce((sum, b) => sum + b.totalCents, 0);
  }, [pendingBatches]);

  const openChargebacksCount = chargebacks.data?.length ?? 0;
  const netLedgerCents = ledgerSummary.data?.netCents ?? 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <p className="vyro-kicker flex items-center gap-1.5 text-ink-4">
            <span>COMMERCE & SUPPLY</span>
            <span>/</span>
            <span>TREASURY & FINANCIAL SETTLEMENT</span>
          </p>
          <h1 className="vyro-display text-3xl font-bold tracking-tight text-ink mt-0.5">
            Money & Orders Control
          </h1>
          <p className="text-sm text-ink-3 mt-1">
            Approve refund disbursements, manage supplier payout batches, audit double-entry ledger, and resolve chargebacks.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/admin/payments"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium border border-ink/15 hover:bg-sand/40 bg-paper transition text-ink"
          >
            <span>All Payments Search</span>
            <ArrowRightIcon size={12} />
          </Link>
        </div>
      </div>

      {/* 2. Operations KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Pending Refunds</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-amber/15 text-amber">
              {pendingRefunds.length} req
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {formatLKR(pendingRefundsTotalCents)}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Awaiting authorization</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Pending Batches</span>
            <PackageIcon size={16} className="text-copper" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-copper-deep tracking-tight">
            {formatLKR(pendingBatchesTotalCents)}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">{pendingBatches.length} unreleased batches</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Open Chargebacks</span>
            <AlertCircleIcon size={16} className={openChargebacksCount > 0 ? 'text-rose' : 'text-ink-4'} />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {openChargebacksCount}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Disputed transactions</div>
        </Surface>

        <Surface className="p-4 border border-ink/10 bg-paper hover:border-ink/25 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Ledger Net Balance</span>
            <TrendingUpIcon size={16} className="text-mint" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-ink tracking-tight">
            {formatCompactLKR(netLedgerCents)}
          </div>
          <div className="mt-1 text-[11px] text-ink-4">Platform settled capital</div>
        </Surface>
      </div>

      {/* 3. Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-ink/10">
        <TabBtn
          active={tab === 'refunds'}
          onClick={() => switchTab('refunds')}
          count={pendingRefunds.length}
        >
          Refund queue
        </TabBtn>
        <TabBtn
          active={tab === 'payouts'}
          onClick={() => switchTab('payouts')}
          count={pendingBatches.length}
        >
          Payout batches
        </TabBtn>
        <TabBtn active={tab === 'ledger'} onClick={() => switchTab('ledger')}>
          General Ledger
        </TabBtn>
        <TabBtn
          active={tab === 'chargebacks'}
          onClick={() => switchTab('chargebacks')}
          count={openChargebacksCount}
        >
          Chargebacks
        </TabBtn>
      </div>

      {/* 4. Tab Content */}
      {tab === 'refunds' ? <RefundQueueTab /> : null}
      {tab === 'payouts' ? <PayoutBatchesTab /> : null}
      {tab === 'ledger' ? <LedgerTab /> : null}
      {tab === 'chargebacks' ? <ChargebacksTab /> : null}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs font-mono font-semibold transition border-b-2 -mb-px flex items-center gap-1.5 ${
        active
          ? 'border-ink text-ink bg-sand/30'
          : 'border-transparent text-ink-4 hover:text-ink hover:border-ink/20'
      }`}
    >
      <span>{children}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono ${
            active ? 'bg-ink text-paper' : 'bg-amber/20 text-ink'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function RefundQueueTab() {
  const canRefund = usePermission('payment:refund');
  const queue = useRefundQueue();
  const approve = useApproveRefund();
  const reject = useRejectRefund();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (!canRefund) return <ErrorBanner message="You need payment:refund permission to view or manage refunds." />;

  const refunds = queue.data ?? [];

  return (
    <div className="space-y-4">
      {queue.isError ? <ErrorBanner message={(queue.error as Error).message} /> : null}
      {reject.isError ? <ErrorBanner message={(reject.error as Error).message} /> : null}
      {approve.isError ? <ErrorBanner message={(approve.error as Error).message} /> : null}

      <Surface className="border border-ink/10 bg-paper overflow-hidden shadow-sm">
        {queue.isLoading ? (
          <div className="divide-y divide-ink/5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="h-4 bg-ink/10 rounded w-1/4" />
                <div className="h-4 bg-ink/5 rounded w-1/4" />
                <div className="h-6 bg-ink/10 rounded w-20" />
              </div>
            ))}
          </div>
        ) : refunds.length === 0 ? (
          <EmptyState
            icon={<CheckCircleIcon size={24} />}
            title="Refund queue clear"
            description="All merchant and customer refund requests have been authorized or reviewed."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Refund ID</th>
                  <th className="py-3 px-4">Payment Reference</th>
                  <th className="py-3 px-4 text-right">Amount (LKR)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Requested At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {refunds.map((r) => (
                  <tr key={r.id} className="hover:bg-sand/20 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-xs text-ink">
                      {r.id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <Link
                        to={`/admin/payments?q=${r.paymentId}`}
                        className="text-copper hover:underline"
                        title="Inspect payment details"
                      >
                        {r.paymentId}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-ink tabular-nums">
                      {formatLKR(r.amountCents)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-3.5 px-4 text-ink-4 font-mono text-[11px]">
                      {formatFullDate(r.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {r.status === 'requested' ? (
                        rejecting === r.id ? (
                          <div className="inline-flex items-center gap-2">
                            <input
                              autoFocus
                              placeholder="Reason (min 5 chars)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              className="border border-ink/20 px-2 py-1 text-xs bg-paper focus:outline-none focus:border-ink w-44"
                            />
                            <button
                              type="button"
                              disabled={rejectReason.trim().length < 5 || reject.isPending}
                              onClick={() =>
                                reject.mutate(
                                  { id: r.id, reason: rejectReason.trim() },
                                  {
                                    onSuccess: () => {
                                      setRejecting(null);
                                      setRejectReason('');
                                    },
                                  },
                                )
                              }
                              className="px-2.5 py-1 text-xs font-mono font-bold bg-rose text-paper hover:bg-rose-deep disabled:opacity-40"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejecting(null)}
                              className="text-xs font-mono text-ink-3 hover:text-ink underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={approve.isPending}
                              onClick={() => approve.mutate(r.id)}
                              className="px-2.5 py-1 text-xs font-mono font-bold bg-ink text-paper hover:bg-ink-2 transition disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejecting(r.id);
                                setRejectReason('');
                              }}
                              className="px-2.5 py-1 text-xs font-mono font-medium border border-rose/30 text-rose hover:bg-rose/10 transition"
                            >
                              Reject
                            </button>
                          </div>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}

function PayoutBatchesTab() {
  const canApprove = usePermission('payout:approve');
  const canRead = usePermission('payout:read');
  const queue = usePayoutBatchQueue();
  const create = useCreatePayoutBatch();
  const approve = useApprovePayoutBatch();
  const [note, setNote] = useState('');

  if (!canRead) return <ErrorBanner message="You need payout:read permission to view payout batches." />;

  const batches = queue.data ?? [];

  return (
    <div className="space-y-6">
      {/* Create Batch Card */}
      {canApprove ? (
        <Surface className="p-4 border border-ink/10 bg-paper space-y-3">
          <div className="flex items-center justify-between border-b border-ink/10 pb-2">
            <div>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">
                Create Disbursement Batch
              </h3>
              <p className="text-[11px] text-ink-4 mt-0.5">
                Aggregates every unbatched eligible supplier payout into a single auditable disbursement batch.
              </p>
            </div>
          </div>

          {create.isError ? <ErrorBanner message={(create.error as Error).message} /> : null}

          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end pt-1">
            <label className="flex flex-col text-xs flex-1">
              <span className="text-ink-4 font-mono text-[10px] uppercase mb-1">Batch Memo / Operational Note</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. Weekly scheduled settlement dispatch (Commercial Bank batch #24)"
                className="border border-ink/20 px-3 py-2 text-xs bg-paper focus:outline-none focus:border-ink"
              />
            </label>
            <Button
              variant="primary"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(note.trim() ? { note: note.trim() } : {}, {
                  onSuccess: () => setNote(''),
                })
              }
              className="text-xs font-mono h-9"
            >
              {create.isPending ? 'Generating…' : 'Generate Batch'}
            </Button>
          </div>
        </Surface>
      ) : null}

      {/* Batches Table */}
      <Surface className="border border-ink/10 bg-paper overflow-hidden shadow-sm">
        {queue.isError ? <ErrorBanner message={(queue.error as Error).message} /> : null}

        {queue.isLoading ? (
          <div className="divide-y divide-ink/5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="h-4 bg-ink/10 rounded w-1/4" />
                <div className="h-4 bg-ink/5 rounded w-1/4" />
                <div className="h-6 bg-ink/10 rounded w-20" />
              </div>
            ))}
          </div>
        ) : batches.length === 0 ? (
          <EmptyState
            icon={<PackageIcon size={24} />}
            title="No payout batches"
            description="Create a new payout batch above to aggregate unbatched merchant disbursements."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Batch ID</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4">Operational Note</th>
                  <th className="py-3 px-4 text-right">Batch Total</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Approval</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-sand/20 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-xs text-ink">
                      {b.id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-ink-4 text-[11px]">
                      {formatFullDate(b.createdAt)}
                    </td>
                    <td className="py-3.5 px-4 text-ink-3">
                      {b.note ?? <span className="text-ink-4 font-mono">—</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-ink tabular-nums">
                      {formatLKR(b.totalCents)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {canApprove && b.status === 'pending' ? (
                        <button
                          type="button"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(b.id)}
                          className="px-3 py-1 bg-ink text-paper hover:bg-ink-2 text-xs font-mono font-bold disabled:opacity-40 transition"
                        >
                          Approve Batch
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}

function LedgerTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const summary = useLedgerSummary({
    from: from ? new Date(from).getTime() : undefined,
    to: to ? new Date(to).getTime() : undefined,
  });

  return (
    <div className="space-y-6">
      {/* Date Filter Bar */}
      <Surface className="p-4 border border-ink/10 bg-paper space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col text-xs">
              <span className="text-ink-4 font-mono text-[10px] uppercase mb-1">From Timestamp</span>
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-ink/20 px-2.5 py-1.5 text-xs font-mono bg-paper focus:outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col text-xs">
              <span className="text-ink-4 font-mono text-[10px] uppercase mb-1">To Timestamp</span>
              <input
                type="datetime-local"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-ink/20 px-2.5 py-1.5 text-xs font-mono bg-paper focus:outline-none focus:border-ink"
              />
            </label>
          </div>

          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="text-xs font-mono text-ink-3 hover:text-ink underline self-end py-1.5"
            >
              Reset to all-time
            </button>
          )}
        </div>
      </Surface>

      {summary.isError ? <ErrorBanner message={(summary.error as Error).message} /> : null}

      {/* Ledger Net Overview Cards */}
      {summary.data ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Surface className="p-4 border border-ink/10 bg-paper">
            <span className="text-[10px] font-mono uppercase text-ink-4 block">Total Credits</span>
            <div className="text-2xl font-bold font-mono text-mint tracking-tight mt-1">
              {formatLKR(summary.data.totalCreditCents)}
            </div>
            <div className="text-[11px] text-ink-4 mt-0.5">Incoming receivables & settlements</div>
          </Surface>

          <Surface className="p-4 border border-ink/10 bg-paper">
            <span className="text-[10px] font-mono uppercase text-ink-4 block">Total Debits</span>
            <div className="text-2xl font-bold font-mono text-rose tracking-tight mt-1">
              {formatLKR(summary.data.totalDebitCents)}
            </div>
            <div className="text-[11px] text-ink-4 mt-0.5">Disbursements & chargebacks</div>
          </Surface>

          <Surface className="p-4 border border-ink/10 bg-paper">
            <span className="text-[10px] font-mono uppercase text-ink-4 block">Net Settlement Volume</span>
            <div className="text-2xl font-bold font-mono text-ink tracking-tight mt-1">
              {formatLKR(summary.data.netCents)}
            </div>
            <div className="text-[11px] text-ink-4 mt-0.5">Platform retained delta</div>
          </Surface>
        </div>
      ) : null}

      {/* Breakdown by Account Type */}
      {summary.data ? (
        <Surface className="border border-ink/10 bg-paper overflow-hidden shadow-sm">
          <div className="p-4 border-b border-ink/10">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">
              Double-Entry Ledger by Account Category
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Account Category</th>
                  <th className="py-3 px-4 text-right">Credit (LKR)</th>
                  <th className="py-3 px-4 text-right">Debit (LKR)</th>
                  <th className="py-3 px-4 text-right">Net Balance (LKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 font-mono">
                {summary.data.byAccountType.map((row) => {
                  const net = row.creditCents - row.debitCents;
                  return (
                    <tr key={row.accountType} className="hover:bg-sand/20 transition-colors">
                      <td className="py-3.5 px-4 font-sans font-semibold text-ink uppercase text-xs">
                        {row.accountType}
                      </td>
                      <td className="py-3.5 px-4 text-right text-mint tabular-nums">
                        {formatLKR(row.creditCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-rose tabular-nums">
                        {formatLKR(row.debitCents)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-ink tabular-nums">
                        {formatLKR(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

function ChargebacksTab() {
  const canRefund = usePermission('payment:refund');
  const list = useOpenChargebacks();
  const resolve = useResolveChargeback();
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!canRefund) return <ErrorBanner message="You need payment:refund permission to view or resolve chargebacks." />;

  const chargebacksList = list.data ?? [];

  return (
    <div className="space-y-4">
      {list.isError ? <ErrorBanner message={(list.error as Error).message} /> : null}

      <Surface className="border border-ink/10 bg-paper overflow-hidden shadow-sm">
        {list.isLoading ? (
          <div className="divide-y divide-ink/5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 flex items-center justify-between gap-4 animate-pulse">
                <div className="h-4 bg-ink/10 rounded w-1/4" />
                <div className="h-4 bg-ink/5 rounded w-1/4" />
                <div className="h-6 bg-ink/10 rounded w-20" />
              </div>
            ))}
          </div>
        ) : chargebacksList.length === 0 ? (
          <EmptyState
            icon={<CheckCircleIcon size={24} />}
            title="No open chargebacks"
            description="All payment disputes and gateway chargeback claims have been cleared or resolved."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Chargeback ID</th>
                  <th className="py-3 px-4">Payment Reference</th>
                  <th className="py-3 px-4">Dispute Reason</th>
                  <th className="py-3 px-4">Opened Date</th>
                  <th className="py-3 px-4">Resolution Memo</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {chargebacksList.map((cb) => (
                  <tr key={cb.id} className="hover:bg-sand/20 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-xs text-ink">
                      {cb.id}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <Link
                        to={`/admin/payments?q=${cb.paymentId}`}
                        className="text-copper hover:underline"
                        title="Inspect payment"
                      >
                        {cb.paymentId}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-ink-3">
                      <span className="p-1 bg-sand/40 border border-ink/10 font-mono text-[11px]">
                        {cb.reason}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-ink-4 text-[11px]">
                      {formatFullDate(cb.createdAt)}
                    </td>
                    <td className="py-3.5 px-4">
                      <input
                        className="border border-ink/20 px-2.5 py-1 text-xs bg-paper focus:outline-none focus:border-ink w-52"
                        value={notes[cb.id] ?? ''}
                        onChange={(e) => setNotes({ ...notes, [cb.id]: e.target.value })}
                        placeholder="Resolution memo…"
                      />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        disabled={resolve.isPending}
                        onClick={() =>
                          resolve.mutate({
                            id: cb.id,
                            ...(notes[cb.id] ? { notes: notes[cb.id] } : {}),
                          })
                        }
                        className="px-3 py-1 bg-ink text-paper hover:bg-ink-2 text-xs font-mono font-bold transition disabled:opacity-40"
                      >
                        {resolve.isPending ? 'Resolving…' : 'Resolve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}

