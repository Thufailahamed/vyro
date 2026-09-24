import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { Button, Input, Label } from '@/components/ui';
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
  useCreditFacilities,
  usePatchCreditFacility,
} from './useAdminMoney';
import {
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  ArrowRightIcon,
  TrendingUpIcon,
  PackageIcon,
  FileTextIcon,
  AlertTriangleIcon,
  CreditCardIcon,
  PlusIcon,
  ScaleIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  CellStack,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  StatusPill,
  TableCard,
  TableSkeleton,
  Tabs,
  controlClass,
} from './ui';

type Tab = 'refunds' | 'payouts' | 'ledger' | 'chargebacks' | 'credit';

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

  const switchTab = (next: string) => {
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
  const kpisLoading =
    refundQueue.isLoading || payoutBatches.isLoading || chargebacks.isLoading || ledgerSummary.isLoading;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker={
          <>
            <span>Commerce &amp; Supply</span>
            <span className="text-ink-4">/</span>
            <span>Treasury &amp; Financial Settlement</span>
          </>
        }
        title="Money & Orders Control"
        description="Approve refund disbursements, manage supplier payout batches, audit the double-entry ledger, and resolve chargebacks."
        actions={
          <Link
            to="/admin/payments"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-paper px-4 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-ink hover:text-paper"
          >
            All payments search
            <ArrowRightIcon size={14} />
          </Link>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Pending refunds"
          value={formatLKR(pendingRefundsTotalCents)}
          sub={`${pendingRefunds.length} ${pendingRefunds.length === 1 ? 'request' : 'requests'} awaiting authorization`}
          icon={<ClockIcon size={16} />}
          tone={pendingRefunds.length > 0 ? 'warning' : 'neutral'}
          status={pendingRefunds.length > 0 ? <Pill tone="warning">{pendingRefunds.length} req</Pill> : undefined}
          loading={kpisLoading}
        />
        <StatCard
          label="Pending batches"
          value={formatLKR(pendingBatchesTotalCents)}
          sub={`${pendingBatches.length} unreleased ${pendingBatches.length === 1 ? 'batch' : 'batches'}`}
          icon={<PackageIcon size={16} />}
          tone={pendingBatches.length > 0 ? 'warning' : 'neutral'}
          loading={kpisLoading}
        />
        <StatCard
          label="Open chargebacks"
          value={openChargebacksCount}
          sub="Disputed transactions"
          icon={<AlertCircleIcon size={16} />}
          tone={openChargebacksCount > 0 ? 'danger' : 'neutral'}
          loading={kpisLoading}
        />
        <StatCard
          label="Ledger net balance"
          value={formatCompactLKR(netLedgerCents)}
          sub="Platform settled capital"
          icon={<TrendingUpIcon size={16} />}
          loading={kpisLoading}
        />
      </StatGrid>

      <Tabs
        items={[
          { key: 'refunds', label: 'Refund queue', icon: <ClockIcon size={15} />, count: pendingRefunds.length },
          { key: 'payouts', label: 'Payout batches', icon: <PackageIcon size={15} />, count: pendingBatches.length },
          { key: 'ledger', label: 'General ledger', icon: <FileTextIcon size={15} /> },
          { key: 'chargebacks', label: 'Chargebacks', icon: <AlertTriangleIcon size={15} />, count: openChargebacksCount },
          { key: 'credit', label: 'Credit', icon: <CreditCardIcon size={15} /> },
        ]}
        value={tab}
        onChange={switchTab}
        ariaLabel="Money control sections"
      />

      {tab === 'refunds' ? <RefundQueueTab /> : null}
      {tab === 'payouts' ? <PayoutBatchesTab /> : null}
      {tab === 'ledger' ? <LedgerTab /> : null}
      {tab === 'chargebacks' ? <ChargebacksTab /> : null}
      {tab === 'credit' ? <CreditTab /> : null}
    </AdminPage>
  );
}

function RefundQueueTab() {
  const canRefund = usePermission('payment:refund');
  const queue = useRefundQueue();
  const approve = useApproveRefund();
  const reject = useRejectRefund();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  if (!canRefund) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">payment:refund</span> permission to view or manage refunds.
      </Callout>
    );
  }

  const refunds = queue.data ?? [];

  return (
    <div className="space-y-4">
      {queue.isError ? (
        <Callout
          tone="danger"
          title="Could not load the refund queue"
          action={
            <Button variant="secondary" size="sm" onClick={() => void queue.refetch()}>
              Retry
            </Button>
          }
        >
          {(queue.error as Error).message}
        </Callout>
      ) : null}
      {reject.isError ? <Callout tone="danger">{(reject.error as Error).message}</Callout> : null}
      {approve.isError ? <Callout tone="danger">{(approve.error as Error).message}</Callout> : null}

      <TableCard
        title="Refund queue"
        description="Merchant and customer refund requests awaiting authorization."
        footer={
          <span>
            <strong className="text-ink">{refunds.length}</strong> {refunds.length === 1 ? 'refund' : 'refunds'} in
            queue
          </span>
        }
      >
        {queue.isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : refunds.length === 0 ? (
          <EmptyBlock
            icon={<CheckCircleIcon size={22} />}
            title="Refund queue clear"
            description="All merchant and customer refund requests have been authorized or reviewed."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Refund</th>
                <th>Payment</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th>Requested</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td>
                    <CellStack mono primary={r.id} secondary={r.reason ?? undefined} />
                  </td>
                  <td>
                    <Link
                      to={`/admin/payments?q=${r.paymentId}`}
                      className="font-mono text-xs font-medium text-copper transition-colors hover:text-ink"
                      title="Inspect payment details"
                    >
                      {r.paymentId}
                    </Link>
                  </td>
                  <td className="text-right font-mono text-sm font-semibold text-ink num-tabular">
                    {formatLKR(r.amountCents)}
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>
                    <CellStack primary={formatFullDate(r.createdAt)} />
                  </td>
                  <td className="text-right">
                    {r.status === 'requested' ? (
                      rejecting === r.id ? (
                        <div className="inline-flex items-center gap-2">
                          <input
                            autoFocus
                            placeholder="Reason (min 5 chars)"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className={cn(controlClass, 'h-9 w-44 text-xs')}
                          />
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={rejectReason.trim().length < 5}
                            loading={reject.isPending}
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
                          >
                            Confirm
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setRejecting(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="success"
                            size="sm"
                            loading={approve.isPending}
                            onClick={() => approve.mutate(r.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose hover:bg-rose/10"
                            onClick={() => {
                              setRejecting(r.id);
                              setRejectReason('');
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
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

  if (!canRead) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">payout:read</span> permission to view payout batches.
      </Callout>
    );
  }

  const batches = queue.data ?? [];

  return (
    <div className="space-y-6">
      {canApprove ? (
        <Panel
          title="Create disbursement batch"
          description="Aggregates every unbatched eligible supplier payout into a single auditable disbursement batch."
          icon={<PlusIcon size={16} />}
        >
          <div className="space-y-4">
            {create.isError ? <Callout tone="danger">{(create.error as Error).message}</Callout> : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label htmlFor="batch-note">Batch memo / operational note</Label>
                <Input
                  id="batch-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Weekly scheduled settlement dispatch (Commercial Bank batch #24)"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                className="h-11 shrink-0"
                loading={create.isPending}
                icon={<PlusIcon size={14} />}
                onClick={() =>
                  create.mutate(note.trim() ? { note: note.trim() } : {}, {
                    onSuccess: () => setNote(''),
                  })
                }
              >
                Generate batch
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <TableCard
        title="Payout batches"
        description="Aggregated supplier disbursement batches and their approval state."
        footer={
          <span>
            <strong className="text-ink">{batches.length}</strong> {batches.length === 1 ? 'batch' : 'batches'} in
            queue
          </span>
        }
      >
        {queue.isError ? (
          <div className="p-5 sm:p-6">
            <Callout
              tone="danger"
              title="Could not load payout batches"
              action={
                <Button variant="secondary" size="sm" onClick={() => void queue.refetch()}>
                  Retry
                </Button>
              }
            >
              {(queue.error as Error).message}
            </Callout>
          </div>
        ) : queue.isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : batches.length === 0 ? (
          <EmptyBlock
            icon={<PackageIcon size={22} />}
            title="No payout batches"
            description={
              canApprove
                ? 'Create a new payout batch above to aggregate unbatched merchant disbursements.'
                : 'No disbursement batches are currently in the queue.'
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Batch</th>
                <th>Operational note</th>
                <th className="text-right">Batch total</th>
                <th>Status</th>
                <th>
                  <span className="sr-only">Approval</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>
                    <CellStack mono primary={b.id} secondary={formatFullDate(b.createdAt)} />
                  </td>
                  <td>
                    {b.note ? (
                      <span className="text-ink-3">{b.note}</span>
                    ) : (
                      <span className="font-mono text-ink-4">—</span>
                    )}
                  </td>
                  <td className="text-right font-mono text-sm font-semibold text-ink num-tabular">
                    {formatLKR(b.totalCents)}
                  </td>
                  <td>
                    <StatusPill status={b.status} />
                  </td>
                  <td className="text-right">
                    {canApprove && b.status === 'pending' ? (
                      <Button
                        variant="success"
                        size="sm"
                        loading={approve.isPending}
                        onClick={() => approve.mutate(b.id)}
                      >
                        Approve batch
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
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
      <Panel
        title="Reporting window"
        description="Restrict the ledger summary to a timestamp range. Leave empty for all-time."
        icon={<FileTextIcon size={16} />}
        actions={
          from || to ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              Reset to all-time
            </Button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:max-w-md sm:grid-cols-2">
          <div>
            <Label htmlFor="ledger-from">From timestamp</Label>
            <Input
              id="ledger-from"
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ledger-to">To timestamp</Label>
            <Input
              id="ledger-to"
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </Panel>

      {summary.isError ? (
        <Callout
          tone="danger"
          title="Could not load the ledger summary"
          action={
            <Button variant="secondary" size="sm" onClick={() => void summary.refetch()}>
              Retry
            </Button>
          }
        >
          {(summary.error as Error).message}
        </Callout>
      ) : null}

      {summary.isLoading ? (
        <StatGrid cols={3}>
          <StatCard label="Total credits" value="—" loading />
          <StatCard label="Total debits" value="—" loading />
          <StatCard label="Net settlement volume" value="—" loading />
        </StatGrid>
      ) : summary.data ? (
        <StatGrid cols={3}>
          <StatCard
            label="Total credits"
            value={formatLKR(summary.data.totalCreditCents)}
            sub="Incoming receivables & settlements"
            icon={<TrendingUpIcon size={16} />}
            tone="success"
          />
          <StatCard
            label="Total debits"
            value={formatLKR(summary.data.totalDebitCents)}
            sub="Disbursements & chargebacks"
            icon={<AlertCircleIcon size={16} />}
            tone="danger"
          />
          <StatCard
            label="Net settlement volume"
            value={formatLKR(summary.data.netCents)}
            sub="Platform retained delta"
            icon={<ScaleIcon size={16} />}
          />
        </StatGrid>
      ) : null}

      {summary.data ? (
        <TableCard
          title="Double-entry ledger"
          description="Credits and debits grouped by account category."
          footer={
            <span>
              <strong className="text-ink">{summary.data.byAccountType.length}</strong> account{' '}
              {summary.data.byAccountType.length === 1 ? 'category' : 'categories'}
              {from || to ? ' · filtered window' : ' · all-time'}
            </span>
          }
        >
          {summary.data.byAccountType.length === 0 ? (
            <EmptyBlock
              icon={<FileTextIcon size={22} />}
              title="No ledger activity"
              description="No ledger entries were recorded in the selected window."
            />
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Account category</th>
                  <th className="text-right">Credit (LKR)</th>
                  <th className="text-right">Debit (LKR)</th>
                  <th className="text-right">Net balance (LKR)</th>
                </tr>
              </thead>
              <tbody>
                {summary.data.byAccountType.map((row) => {
                  const net = row.creditCents - row.debitCents;
                  return (
                    <tr key={row.accountType}>
                      <td>
                        <span className="font-semibold uppercase tracking-wide text-ink">{row.accountType}</span>
                      </td>
                      <td className="text-right font-mono text-mint num-tabular">{formatLKR(row.creditCents)}</td>
                      <td className="text-right font-mono text-rose num-tabular">{formatLKR(row.debitCents)}</td>
                      <td className="text-right font-mono text-sm font-semibold text-ink num-tabular">
                        {formatLKR(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </TableCard>
      ) : null}
    </div>
  );
}

function ChargebacksTab() {
  const canRefund = usePermission('payment:refund');
  const list = useOpenChargebacks();
  const resolve = useResolveChargeback();
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!canRefund) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">payment:refund</span> permission to view or resolve
        chargebacks.
      </Callout>
    );
  }

  const chargebacksList = list.data ?? [];

  return (
    <div className="space-y-4">
      {list.isError ? (
        <Callout
          tone="danger"
          title="Could not load chargebacks"
          action={
            <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
              Retry
            </Button>
          }
        >
          {(list.error as Error).message}
        </Callout>
      ) : null}
      {resolve.isError ? <Callout tone="danger">{(resolve.error as Error).message}</Callout> : null}

      <TableCard
        title="Open chargebacks"
        description="Gateway chargeback claims and payment disputes awaiting resolution."
        footer={
          <span>
            <strong className="text-ink">{chargebacksList.length}</strong> open{' '}
            {chargebacksList.length === 1 ? 'dispute' : 'disputes'}
          </span>
        }
      >
        {list.isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : chargebacksList.length === 0 ? (
          <EmptyBlock
            icon={<CheckCircleIcon size={22} />}
            title="No open chargebacks"
            description="All payment disputes and gateway chargeback claims have been cleared or resolved."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Chargeback</th>
                <th>Payment</th>
                <th>Dispute reason</th>
                <th>Opened</th>
                <th>Resolution memo</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {chargebacksList.map((cb) => (
                <tr key={cb.id}>
                  <td>
                    <CellStack mono primary={cb.id} />
                  </td>
                  <td>
                    <Link
                      to={`/admin/payments?q=${cb.paymentId}`}
                      className="font-mono text-xs font-medium text-copper transition-colors hover:text-ink"
                      title="Inspect payment"
                    >
                      {cb.paymentId}
                    </Link>
                  </td>
                  <td>
                    <Pill tone="warning" className="font-mono normal-case tracking-normal">
                      {cb.reason}
                    </Pill>
                  </td>
                  <td>
                    <CellStack primary={formatFullDate(cb.createdAt)} />
                  </td>
                  <td>
                    <input
                      className={cn(controlClass, 'h-9 w-52 text-xs')}
                      value={notes[cb.id] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [cb.id]: e.target.value })}
                      placeholder="Resolution memo…"
                    />
                  </td>
                  <td className="text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={resolve.isPending}
                      onClick={() =>
                        resolve.mutate({
                          id: cb.id,
                          ...(notes[cb.id] ? { notes: notes[cb.id] } : {}),
                        })
                      }
                    >
                      Resolve
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}

function CreditTab() {
  const canManage = usePermission('payment:refund');
  const list = useCreditFacilities();
  const patch = usePatchCreditFacility();
  const [limits, setLimits] = useState<Record<string, string>>({});

  if (!canManage) {
    return (
      <Callout tone="warning" title="Insufficient permissions">
        You need the <span className="font-mono text-xs">payment:refund</span> permission to manage credit
        facilities.
      </Callout>
    );
  }

  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      {list.isError ? (
        <Callout
          tone="danger"
          title="Could not load credit facilities"
          action={
            <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
              Retry
            </Button>
          }
        >
          {(list.error as Error).message}
        </Callout>
      ) : null}
      {patch.isError ? <Callout tone="danger">{(patch.error as Error).message}</Callout> : null}

      <TableCard
        title="Credit facilities"
        description="Per-business credit limits, utilization, and facility status."
        footer={
          <span>
            <strong className="text-ink">{rows.length}</strong> {rows.length === 1 ? 'facility' : 'facilities'}
          </span>
        }
      >
        {list.isLoading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : rows.length === 0 ? (
          <EmptyBlock
            icon={<CreditCardIcon size={22} />}
            title="No credit facilities"
            description="Facilities appear after businesses meet the 3-paid-orders rule or an admin creates one."
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Business</th>
                <th className="text-right">Limit</th>
                <th className="text-right">Used</th>
                <th>Status</th>
                <th>New limit (cents)</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const usedPct = r.limitCents > 0 ? Math.min(100, Math.round((r.usedCents / r.limitCents) * 100)) : 0;
                return (
                  <tr key={r.businessId}>
                    <td>
                      <CellStack mono primary={r.businessId} secondary={`Terms ${r.defaultTerms}`} />
                    </td>
                    <td className="text-right font-mono text-sm text-ink num-tabular">{formatLKR(r.limitCents)}</td>
                    <td className="text-right">
                      <CellStack
                        primary={<span className="font-mono text-sm num-tabular">{formatLKR(r.usedCents)}</span>}
                        secondary={`${usedPct}% of limit`}
                      />
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td>
                      <input
                        className={cn(controlClass, 'h-9 w-36 font-mono text-xs')}
                        value={limits[r.businessId] ?? ''}
                        onChange={(e) => setLimits({ ...limits, [r.businessId]: e.target.value })}
                        placeholder={String(r.limitCents)}
                        inputMode="numeric"
                      />
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!limits[r.businessId]}
                          loading={patch.isPending}
                          onClick={() =>
                            patch.mutate({
                              businessId: r.businessId,
                              patch: { limitCents: Number(limits[r.businessId]) },
                            })
                          }
                        >
                          Set limit
                        </Button>
                        {r.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose hover:bg-rose/10"
                            disabled={patch.isPending}
                            onClick={() => {
                              const reason = window.prompt('Suspend reason (required for audit):');
                              if (!reason) return;
                              patch.mutate({ businessId: r.businessId, patch: { status: 'suspended', reason } });
                            }}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={patch.isPending}
                            onClick={() =>
                              patch.mutate({ businessId: r.businessId, patch: { status: 'active' } })
                            }
                          >
                            Resume
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>
  );
}
