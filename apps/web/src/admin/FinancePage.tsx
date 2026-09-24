import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { ApiError } from '@/lib/api';
import { Button, Input, Label, Textarea } from '@/components/ui';
import {
  useFailedPayouts,
  useRetryPayout,
  useIssueRefund,
  type FailedPayout,
} from './useAdminFinance';
import {
  RefreshCwIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  FileTextIcon,
  DownloadIcon,
  ExternalLinkIcon,
  BanknoteIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  ArrowRightIcon,
  ScaleIcon,
  SearchIcon,
  XIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CellStack,
  DetailList,
  EmptyBlock,
  Panel,
  Pill,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';

type Tab = 'payouts' | 'refunds' | 'invoices' | 'ledger';

const linkBtnClass =
  'inline-flex h-10 items-center gap-2 rounded-lg bg-paper px-4 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-ink hover:text-paper';

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

export function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'payouts';

  const switchTab = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  const { data, isLoading, isError, refetch } = useFailedPayouts();
  const failedPayouts = data?.failedPayouts ?? [];
  const metrics = data?.metrics;

  const totalFailedAmount = useMemo(() => {
    if (metrics?.failedAmountCents !== undefined) return metrics.failedAmountCents;
    return failedPayouts.reduce((acc, p) => acc + (p.netCents ?? p.amountCents ?? 0), 0);
  }, [metrics, failedPayouts]);

  const failedCount = metrics?.failedCount ?? failedPayouts.length;
  const pendingCount = metrics?.pendingCount ?? 0;

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
        title="Finance Ops"
        description="Exception management, failed disbursement recovery, direct payment refunds &amp; compliance reconciliation."
        actions={
          <>
            <a href="/api/admin/audit/export?limit=1000" download title="Export latest 1,000 financial audit records" className={linkBtnClass}>
              <DownloadIcon size={14} />
              Export audit CSV
            </a>
            <Link to="/admin/money" className={linkBtnClass}>
              Money hub
              <ArrowRightIcon size={14} />
            </Link>
            <Link to="/admin/payments" className={linkBtnClass}>
              Payments registry
              <ExternalLinkIcon size={14} />
            </Link>
          </>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Failed disbursements"
          value={failedCount}
          sub="Blocked supplier transfers"
          icon={failedCount > 0 ? <AlertTriangleIcon size={16} /> : <CheckCircleIcon size={16} />}
          tone={failedCount > 0 ? 'danger' : 'neutral'}
          status={
            failedCount > 0 ? (
              <Pill tone="danger" dot>
                Requires retry
              </Pill>
            ) : (
              <Pill tone="success" dot>
                Healthy
              </Pill>
            )
          }
          loading={isLoading}
        />
        <StatCard
          label="Blocked capital"
          value={formatLKR(totalFailedAmount)}
          sub={`${formatCompactLKR(totalFailedAmount)} awaiting operator retry`}
          icon={<BanknoteIcon size={16} />}
          tone={totalFailedAmount > 0 ? 'danger' : 'neutral'}
          loading={isLoading}
        />
        <StatCard
          label="Scheduled payouts"
          value={pendingCount}
          sub="Queued for next batch"
          icon={<TrendingUpIcon size={16} />}
          tone={pendingCount > 0 ? 'warning' : 'neutral'}
          loading={isLoading}
        />
        <StatCard
          label="Refund gateway"
          value="Audited"
          sub="Cryptographic audit trail"
          icon={<ShieldCheckIcon size={16} />}
          status={
            <Pill tone="success" dot>
              Live
            </Pill>
          }
        />
      </StatGrid>

      <Tabs
        items={[
          { key: 'payouts', label: 'Payout recovery', icon: <RefreshCwIcon size={15} />, count: failedCount > 0 ? failedCount : undefined },
          { key: 'refunds', label: 'Direct refund', icon: <BanknoteIcon size={15} /> },
          { key: 'invoices', label: 'Invoices & billing', icon: <FileTextIcon size={15} /> },
          { key: 'ledger', label: 'Ledger & audit', icon: <ScaleIcon size={15} /> },
        ]}
        value={tab}
        onChange={switchTab}
        ariaLabel="Finance ops sections"
      />

      {tab === 'payouts' && (
        <PayoutRecoveryTab
          failedPayouts={failedPayouts}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
        />
      )}
      {tab === 'refunds' && <IssueRefundTab />}
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'ledger' && <LedgerTab />}
    </AdminPage>
  );
}

/* ========================================================================= */
/* TAB 1: Payout Recovery                                                    */
/* ========================================================================= */

function PayoutRecoveryTab({
  failedPayouts,
  isLoading,
  isError,
  refetch,
}: {
  failedPayouts: FailedPayout[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const [search, setSearch] = useState('');
  const [activePayoutForRetry, setActivePayoutForRetry] = useState<FailedPayout | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return failedPayouts;
    return failedPayouts.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        (p.supplierName && p.supplierName.toLowerCase().includes(q)) ||
        (p.supplierId && p.supplierId.toLowerCase().includes(q)) ||
        (p.failureReason && p.failureReason.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q)),
    );
  }, [failedPayouts, search]);

  const emptySearch = !isLoading && filtered.length === 0 && failedPayouts.length > 0;

  return (
    <div className="space-y-4">
      <TableCard
        title="Failed disbursements"
        description="Supplier payouts that failed at the gateway or bank and require operator retry."
        toolbar={
          <Toolbar
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => refetch()}
                  loading={isLoading}
                  icon={<RefreshCwIcon size={14} />}
                >
                  Refresh
                </Button>
                <Link
                  to="/admin/money?tab=payouts"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-ink hover:text-paper"
                >
                  Full payout batches
                  <ExternalLinkIcon size={13} />
                </Link>
              </>
            }
          >
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by payout ID, supplier, reason, or reference…"
                className={cn(controlClass, 'w-full pl-9 pr-8')}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <XIcon size={14} />
                </button>
              ) : null}
            </div>
          </Toolbar>
        }
        footer={
          <span>
            Showing <strong className="text-ink">{filtered.length}</strong> of {failedPayouts.length} failed{' '}
            {failedPayouts.length === 1 ? 'disbursement' : 'disbursements'}
            {search ? ' · filter applied' : ''}
          </span>
        }
      >
        {isError ? (
          <div className="p-5 sm:p-6">
            <Callout
              tone="danger"
              title="Could not load failed payouts"
              action={
                <Button variant="secondary" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            >
              Failed to load the payout exceptions summary.
            </Callout>
          </div>
        ) : isLoading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : filtered.length === 0 && !emptySearch ? (
          <EmptyBlock
            icon={<CheckCircleIcon size={22} />}
            title="All disbursements healthy"
            description="No failed payouts require manual retry or intervention. All scheduled supplier disbursements have either settled or are processing normally."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link
                  to="/admin/money?tab=payouts"
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
                >
                  View payout batches
                  <ArrowRightIcon size={14} />
                </Link>
                <Button variant="secondary" size="sm" className="h-10" onClick={() => refetch()}>
                  Refresh status
                </Button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyBlock
            icon={<SearchIcon size={22} />}
            title="No matches"
            description={`No failed payouts match "${search}".`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                Clear filter
              </Button>
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Disbursement</th>
                <th>Beneficiary</th>
                <th className="text-right">Net amount</th>
                <th>Method</th>
                <th>Failure diagnostic</th>
                <th>Created</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const net = p.netCents ?? p.amountCents ?? 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <CellStack mono primary={p.id} secondary={p.batchId ? `Batch: ${p.batchId}` : undefined} />
                    </td>
                    <td>
                      <CellStack
                        primary={p.supplierName || 'Unknown supplier'}
                        secondary={p.supplierId ? `ID: ${p.supplierId}` : undefined}
                      />
                    </td>
                    <td className="text-right">
                      <CellStack
                        primary={<span className="font-mono text-sm font-semibold num-tabular">{formatLKR(net)}</span>}
                        secondary={p.feeCents !== undefined && p.feeCents > 0 ? `Fee: ${formatLKR(p.feeCents)}` : undefined}
                      />
                    </td>
                    <td>
                      <CellStack
                        primary={<Pill tone="neutral" className="capitalize">{p.method ?? 'Bank'}</Pill>}
                        secondary={p.reference ? `Ref: ${p.reference}` : undefined}
                      />
                    </td>
                    <td>
                      <div className="flex max-w-xs items-start gap-1.5 rounded-lg bg-rose/[0.07] p-2 text-xs font-medium text-rose shadow-[inset_0_0_0_1px_rgba(196,90,74,0.2)]">
                        <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">
                          {p.failureReason || 'Disbursement rejected by payment gateway or bank.'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <CellStack primary={formatFullDate(p.createdAt)} />
                    </td>
                    <td className="text-right">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setActivePayoutForRetry(p)}
                        icon={<RefreshCwIcon size={13} />}
                      >
                        Retry
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {activePayoutForRetry && (
        <RetryPayoutDialog
          payout={activePayoutForRetry}
          onClose={() => setActivePayoutForRetry(null)}
          onSuccess={() => {
            setActivePayoutForRetry(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

/* ========================================================================= */
/* Retry payout dialog                                                       */
/* ========================================================================= */

function RetryPayoutDialog({
  payout,
  onClose,
  onSuccess,
}: {
  payout: FailedPayout;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const retry = useRetryPayout();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError('Audit reason must be at least 5 characters.');
      return;
    }
    setError(null);

    retry.mutate(
      {
        id: payout.id,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: () => onSuccess(),
        onError: (err: unknown) => {
          setError(
            err instanceof ApiError
              ? `${err.code}: ${err.message}`
              : 'Retry disbursement failed. Please try again.',
          );
        },
      },
    );
  };

  const net = payout.netCents ?? payout.amountCents ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="vyro-surface w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.07] bg-bone/40 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-copper/15 text-copper">
              <RefreshCwIcon size={15} />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-ink">Retry failed disbursement</h3>
              <p className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{payout.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-lg text-ink-4 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-6">
          <DetailList
            items={[
              { label: 'Payout ID', value: <span className="font-mono text-xs">{payout.id}</span> },
              { label: 'Beneficiary', value: payout.supplierName || payout.supplierId },
              { label: 'Disbursement amount', value: <span className="font-mono font-semibold">{formatLKR(net)}</span> },
            ]}
          />

          {payout.failureReason ? (
            <Callout tone="danger" title="Previous failure reason">
              {payout.failureReason}
            </Callout>
          ) : null}

          <div>
            <Label htmlFor="retry-reason">
              Operational reason for retry <span className="text-rose">*</span>
            </Label>
            <Textarea
              id="retry-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bank account routing verified with supplier, network glitch cleared by gateway…"
              disabled={retry.isPending}
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-ink-4">
              <span>Required for compliance audit trail</span>
              <span className={reason.trim().length < 5 ? 'font-medium text-copper' : 'font-medium text-mint'}>
                {reason.trim().length}/5 min chars
              </span>
            </div>
          </div>

          <Callout tone="info" title="Audit compliance notice">
            Retrying this payout resets its status to <span className="font-mono font-semibold">pending</span> for
            the next settlement batch run and logs an immutable audit event with your admin signature.
          </Callout>

          {error ? <Callout tone="danger">{error}</Callout> : null}

          <div className="flex items-center justify-end gap-2 border-t border-ink/[0.07] pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={retry.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={retry.isPending}
              disabled={reason.trim().length < 5}
              icon={<RefreshCwIcon size={14} />}
            >
              Confirm retry
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 2: Direct Refund                                                      */
/* ========================================================================= */

function IssueRefundTab() {
  const issue = useIssueRefund();
  const [paymentId, setPaymentId] = useState('');
  const [amountLKR, setAmountLKR] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const amountCents = useMemo(() => {
    const val = parseFloat(amountLKR);
    if (isNaN(val) || val <= 0) return 0;
    return Math.round(val * 100);
  }, [amountLKR]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (!paymentId.trim()) {
      setError('Please provide a valid Payment ID.');
      return;
    }
    if (amountCents <= 0) {
      setError('Refund amount must be greater than zero.');
      return;
    }
    if (reason.trim().length < 5) {
      setError('Reason must be at least 5 characters.');
      return;
    }

    issue.mutate(
      {
        paymentId: paymentId.trim(),
        amountCents,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: () => {
          setDone(true);
          setPaymentId('');
          setAmountLKR('');
          setReason('');
        },
        onError: (err: unknown) => {
          setError(
            err instanceof ApiError
              ? `${err.code}: ${err.message}`
              : 'Failed to issue refund. Please verify the Payment ID and try again.',
          );
        },
      },
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Panel
        title="Direct payment refund"
        description="Issue emergency or manual customer refunds directly against a verified payment transaction reference."
        icon={<BanknoteIcon size={16} />}
        className="lg:col-span-2"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="refund-payment-id">
              Payment reference ID <span className="text-rose">*</span>
            </Label>
            <Input
              id="refund-payment-id"
              type="text"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              placeholder="e.g. pay_9f81a7b2… or ord_payment_…"
              className="font-mono"
              disabled={issue.isPending}
            />
            <p className="mt-1.5 text-xs text-ink-4">
              Find reference IDs in the{' '}
              <Link to="/admin/payments" className="font-medium text-copper transition-colors hover:text-ink">
                Payments registry
              </Link>{' '}
              or{' '}
              <Link to="/admin/orders" className="font-medium text-copper transition-colors hover:text-ink">
                Orders
              </Link>
              .
            </p>
          </div>

          <div>
            <Label htmlFor="refund-amount">
              Refund amount (LKR) <span className="text-rose">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-semibold text-ink-4">
                Rs.
              </span>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amountLKR}
                onChange={(e) => setAmountLKR(e.target.value)}
                placeholder="0.00"
                className="pl-11 font-mono font-semibold"
                disabled={issue.isPending}
              />
            </div>
            {amountCents > 0 ? (
              <p className="mt-1.5 font-mono text-xs font-medium text-copper">
                Equivalent to {amountCents.toLocaleString()} cents in payment gateway
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="refund-reason">
              Operational reason <span className="text-rose">*</span>
            </Label>
            <Textarea
              id="refund-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Detailed reason for refund (e.g. customer returned damaged goods, duplicate charge waived)…"
              disabled={issue.isPending}
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-ink-4">
              <span>Required for financial audit logging</span>
              <span className={reason.trim().length < 5 ? 'font-medium text-copper' : 'font-medium text-mint'}>
                {reason.trim().length}/5 min chars
              </span>
            </div>
          </div>

          {error ? <Callout tone="danger">{error}</Callout> : null}
          {done ? (
            <Callout tone="success" title="Refund issued">
              Transaction recorded and audited with idempotent signature.
            </Callout>
          ) : null}

          <div className="border-t border-ink/[0.07] pt-4">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={issue.isPending}
              disabled={!paymentId.trim() || amountCents <= 0 || reason.trim().length < 5}
              icon={<BanknoteIcon size={14} />}
            >
              Issue audited refund
            </Button>
          </div>
        </form>
      </Panel>

      <div className="space-y-4">
        <Card>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Refund guidelines</h3>
          <ul className="mt-3 space-y-3 text-xs text-ink-3">
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Idempotent execution:</strong> every refund generates a unique UUID
                idempotency key to prevent duplicate customer credits.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Ledger integration:</strong> direct refunds post an automatic debit
                entry to the general ledger and notify the merchant.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Full audit trail:</strong> your operator ID, IP address, and timestamp
                are sealed in the administrative audit record.
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Related workspaces</h3>
          <div className="mt-3 space-y-2">
            {[
              { to: '/admin/money?tab=refunds', label: 'General refund queue', icon: <ArrowRightIcon size={13} /> },
              { to: '/admin/payments', label: 'Payment gateway search', icon: <ExternalLinkIcon size={13} /> },
              { to: '/admin/orders', label: 'Customer orders registry', icon: <ExternalLinkIcon size={13} /> },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center justify-between rounded-lg bg-ink/[0.04] px-3.5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-ink/[0.08]"
              >
                <span>{l.label}</span>
                <span className="text-ink-4">{l.icon}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 3: Invoices & Billing                                                 */
/* ========================================================================= */

function InvoicesTab() {
  return (
    <div className="space-y-6">
      <Panel
        title="Invoicing & billing operations"
        description="Automated invoice reconciliation, tax compliance, and merchant commission settlements."
        icon={<FileTextIcon size={16} />}
        actions={
          <a href="/api/admin/audit/export?limit=1000" download className={cn(linkBtnClass, 'h-9 px-3 text-xs')}>
            <DownloadIcon size={14} />
            Export invoicing audit
          </a>
        }
      >
        <StatGrid cols={4}>
          <StatCard label="Tax invoices" value="Automated" sub="Sri Lanka VAT / SVAT invoice generation for wholesale orders." icon={<FileTextIcon size={16} />} />
          <StatCard label="Billing cycle" value="Weekly" sub="Supplier disbursement settlement batches every Tuesday." icon={<RefreshCwIcon size={16} />} />
          <StatCard label="Dispute window" value="7 days" sub="Merchant invoice reconciliation claim period post delivery." icon={<AlertTriangleIcon size={16} />} />
          <StatCard label="Ledger sync" value="100%" sub="All line items posted directly to double-entry ledger." icon={<ScaleIcon size={16} />} tone="success" />
        </StatGrid>
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            to: '/admin/money?tab=payouts',
            icon: <FileTextIcon size={16} />,
            title: 'Supplier payouts & batches',
            desc: 'Review and disburse weekly vendor settlements with automated fee deductions.',
            action: 'Manage payout batches',
          },
          {
            to: '/admin/payments',
            icon: <BanknoteIcon size={16} />,
            title: 'Customer payments registry',
            desc: 'Browse processed credit card, bank transfer, and cash-on-delivery transactions.',
            action: 'Search payments',
          },
          {
            to: '/admin/money?tab=chargebacks',
            icon: <AlertTriangleIcon size={16} />,
            title: 'Disputes & claims',
            desc: 'Manage chargebacks, damaged stock claims, and billing adjustments.',
            action: 'View chargebacks',
          },
        ].map((c) => (
          <Card key={c.to} className="flex flex-col justify-between gap-4">
            <div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-bone text-ink-3">{c.icon}</span>
              <h3 className="mt-3 text-sm font-semibold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-4">{c.desc}</p>
            </div>
            <Link
              to={c.to}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] transition-colors hover:bg-ink hover:text-paper"
            >
              {c.action}
              <ArrowRightIcon size={13} />
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 4: Ledger & Audit                                                     */
/* ========================================================================= */

function LedgerTab() {
  return (
    <Panel
      title="General ledger & financial audit"
      description="Immutable double-entry bookkeeping stream and compliance activity records."
      icon={<ScaleIcon size={16} />}
      actions={
        <a
          href="/api/admin/audit/export?limit=1000"
          download
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink-2"
        >
          <DownloadIcon size={14} />
          Download audit trail CSV
        </a>
      }
    >
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ScaleIcon size={16} className="text-copper" />
            Double-entry ledger architecture
          </h3>
          <p className="text-sm leading-relaxed text-ink-3">
            Every financial event across VYRO produces balanced credit and debit ledger entries. Accounts include
            customer clearing, platform commission, supplier payables, delivery fees, and tax withholdings.
          </p>
          <div className="space-y-1.5 rounded-lg bg-bone/60 p-4 font-mono text-xs shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
            <div className="font-semibold text-ink">Account classes</div>
            <div className="text-ink-3">1000 — Cash &amp; clearing accounts</div>
            <div className="text-ink-3">2000 — Supplier payables</div>
            <div className="text-ink-3">3000 — Platform revenue &amp; fees</div>
            <div className="text-ink-3">4000 — Tax &amp; regulatory reserves</div>
          </div>
          <Link
            to="/admin/money?tab=ledger"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper transition-colors hover:text-ink"
          >
            Open live general ledger workspace
            <ArrowRightIcon size={14} />
          </Link>
        </div>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheckIcon size={16} className="text-mint" />
            Compliance &amp; security controls
          </h3>
          <ul className="space-y-3 text-sm text-ink-3">
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Idempotency guarantee:</strong> all payout retries and refund postings
                require unique UUID keys to prevent double-spending.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Immutable audit trail:</strong> admin actions log before/after state
                snapshots, IP addresses, and operator signatures.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="mt-0.5 shrink-0 text-mint" />
              <span>
                <strong className="text-ink">Role separation:</strong> disbursements require multi-signature
                authorization between financial operators and super admins.
              </span>
            </li>
          </ul>
          <Link
            to="/admin/audit"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper transition-colors hover:text-ink"
          >
            Inspect global audit activity log
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    </Panel>
  );
}
