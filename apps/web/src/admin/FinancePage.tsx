import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { Surface, ErrorBanner, SuccessBanner, Button, EmptyState } from '@/components/ui';
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
  CheckCircle2Icon,
  FileTextIcon,
  DownloadIcon,
  ExternalLinkIcon,
  BanknoteIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  ClockIcon,
  ArrowRightIcon,
  ScaleIcon,
  SearchIcon,
  XIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';

type Tab = 'payouts' | 'refunds' | 'invoices' | 'ledger';

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

  const switchTab = (next: Tab) => {
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
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-ink/10 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink/60 mb-1">
            <span>Commerce & Supply</span>
            <span>/</span>
            <span className="text-copper font-bold">Finance Operations</span>
          </div>
          <h1 className="vyro-display text-3xl md:text-4xl text-ink tracking-tight">Finance Ops</h1>
          <p className="text-sm text-ink-500 mt-1 max-w-2xl">
            Exception management, failed disbursement recovery, direct payment refunds & compliance reconciliation.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <a
            href="/api/admin/audit/export?limit=1000"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-mono"
            download
            title="Export latest 1,000 financial audit records"
          >
            <DownloadIcon size={14} />
            Export Audit (CSV)
          </a>
          <Link
            to="/admin/money"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-medium"
          >
            Money Hub
            <ArrowRightIcon size={14} />
          </Link>
          <Link
            to="/admin/payments"
            className="vyro-btn vyro-btn-secondary text-xs h-9 px-3 gap-1.5 flex items-center font-medium"
          >
            Payments Registry
            <ExternalLinkIcon size={14} />
          </Link>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Failed Payouts */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Failed Disbursements
            </span>
            <div
              className={`p-2 rounded-md ${
                failedCount > 0 ? 'bg-rose/10 text-rose' : 'bg-mint/10 text-mint'
              }`}
            >
              {failedCount > 0 ? <AlertTriangleIcon size={18} /> : <CheckCircleIcon size={18} />}
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {failedCount}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs">
              {failedCount > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold text-rose">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose animate-pulse" />
                  Requires Retry
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-mint">
                  <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                  Disbursements Healthy
                </span>
              )}
              <span className="text-ink-4">• Blocked transfers</span>
            </div>
          </div>
        </Surface>

        {/* At-Risk Failed Amount */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Blocked Capital
            </span>
            <div className="p-2 rounded-md bg-sand/30 text-ink">
              <BanknoteIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {formatLKR(totalFailedAmount)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="font-semibold text-ink">
                {formatCompactLKR(totalFailedAmount)}
              </span>
              <span>• Awaiting operator retry</span>
            </div>
          </div>
        </Surface>

        {/* Pending Payouts */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Scheduled Payouts
            </span>
            <div className="p-2 rounded-md bg-sand/30 text-ink">
              <TrendingUpIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              {pendingCount}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="font-semibold text-copper">Pending</span>
              <span>• Queued for next batch</span>
            </div>
          </div>
        </Surface>

        {/* Direct Refund Gateway */}
        <Surface className="p-4 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
              Refund Gateway
            </span>
            <div className="p-2 rounded-md bg-sand/30 text-ink">
              <ShieldCheckIcon size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-mono text-ink tracking-tight">
              Audited
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1 font-semibold text-mint">
                <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                Live
              </span>
              <span>• Cryptographic audit trail</span>
            </div>
          </div>
        </Surface>
      </section>

      {/* Modern High-Contrast Navigation Tabs */}
      <nav className="flex items-center gap-1 border-b border-ink/15 overflow-x-auto pt-2">
        <TabButton
          active={tab === 'payouts'}
          onClick={() => switchTab('payouts')}
          icon={<RefreshCwIcon size={15} />}
          badge={failedCount > 0 ? failedCount : undefined}
          badgeColor="danger"
        >
          Payout Recovery
        </TabButton>
        <TabButton
          active={tab === 'refunds'}
          onClick={() => switchTab('refunds')}
          icon={<BanknoteIcon size={15} />}
        >
          Direct Refund
        </TabButton>
        <TabButton
          active={tab === 'invoices'}
          onClick={() => switchTab('invoices')}
          icon={<FileTextIcon size={15} />}
        >
          Invoices & Billing
        </TabButton>
        <TabButton
          active={tab === 'ledger'}
          onClick={() => switchTab('ledger')}
          icon={<ScaleIcon size={15} />}
        >
          Ledger & Audit
        </TabButton>
      </nav>

      {/* Tab Panels */}
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
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  badge,
  badgeColor = 'default',
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  badge?: number | undefined;
  badgeColor?: 'default' | 'danger' | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium transition flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap ${
        active
          ? 'bg-sand/30 border-ink text-ink font-semibold shadow-sm'
          : 'border-transparent text-ink-500 hover:text-ink hover:bg-sand/10'
      }`}
    >
      {icon}
      <span>{children}</span>
      {badge !== undefined && (
        <span
          className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded-full ${
            badgeColor === 'danger'
              ? 'bg-rose text-paper'
              : 'bg-ink/10 text-ink'
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ========================================================================= */
/* TAB 1: Payout Recovery Tab                                                */
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

  return (
    <div className="space-y-4">
      {/* Action & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-paper p-3 rounded-lg border border-ink/10">
        <div className="relative flex-1 max-w-md">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by payout ID, supplier, reason, or reference…"
            className="w-full pl-9 pr-8 py-1.5 text-sm bg-paper border border-ink/20 rounded focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink"
            >
              <XIcon size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
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
            className="vyro-btn vyro-btn-secondary text-xs h-8 px-3 gap-1.5 flex items-center font-medium"
          >
            Full Payout Batches
            <ExternalLinkIcon size={13} />
          </Link>
        </div>
      </div>

      {isError && (
        <ErrorBanner message="Failed to load failed payouts summary. Please retry." />
      )}

      {/* Main Table or Empty State */}
      {isLoading ? (
        <Surface className="p-8 text-center space-y-3">
          <div className="animate-spin w-6 h-6 border-2 border-ink border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-ink-500 font-mono">Checking payout exceptions…</p>
        </Surface>
      ) : filtered.length === 0 ? (
        failedPayouts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2Icon size={24} />}
            title="All Disbursements Healthy"
            description="No failed payouts require manual retry or intervention. All scheduled supplier disbursements have either settled or are processing normally."
            action={
              <div className="flex justify-center gap-3">
                <Link
                  to="/admin/money?tab=payouts"
                  className="vyro-btn vyro-btn-primary text-xs h-9 px-4 inline-flex items-center gap-1.5 font-medium"
                >
                  View Payout Batches
                  <ArrowRightIcon size={14} />
                </Link>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => refetch()}
                  className="h-9 text-xs"
                >
                  Refresh Status
                </Button>
              </div>
            }
          />
        ) : (
          <Surface className="p-8 text-center text-ink-500">
            <p className="text-sm">No failed payouts match the search query "{search}".</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearch('')}
              className="mt-3 text-xs"
            >
              Clear filter
            </Button>
          </Surface>
        )
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-sand/20 border-b border-ink/10 text-xs font-mono uppercase tracking-wider text-ink-500">
                  <th className="py-3 px-4">Disbursement ID</th>
                  <th className="py-3 px-4">Beneficiary / Supplier</th>
                  <th className="py-3 px-4 text-right">Net Amount</th>
                  <th className="py-3 px-4">Method & Ref</th>
                  <th className="py-3 px-4">Failure Diagnostic</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {filtered.map((p) => {
                  const net = p.netCents ?? p.amountCents ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-sand/10 transition">
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-bold text-ink">
                          {p.id}
                        </div>
                        {p.batchId && (
                          <div className="text-[11px] font-mono text-ink-4 mt-0.5">
                            Batch: {p.batchId}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-ink">
                          {p.supplierName || 'Unknown Supplier'}
                        </div>
                        {p.supplierId && (
                          <div className="text-[11px] font-mono text-ink-4">
                            ID: {p.supplierId}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="font-mono font-bold text-ink text-sm">
                          {formatLKR(net)}
                        </div>
                        {p.feeCents !== undefined && p.feeCents > 0 && (
                          <div className="text-[11px] font-mono text-ink-4">
                            Fee: {formatLKR(p.feeCents)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-ink/5 border border-ink/10 rounded text-xs font-mono capitalize">
                            {p.method ?? 'Bank'}
                          </span>
                        </div>
                        {p.reference && (
                          <div className="text-[11px] font-mono text-ink-4 mt-0.5 truncate max-w-[140px]" title={p.reference}>
                            Ref: {p.reference}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-start gap-1.5 text-xs text-rose font-medium bg-rose/10 p-1.5 rounded border border-rose/20">
                          <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {p.failureReason || 'Disbursement rejected by payment gateway or bank.'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-ink-500 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <ClockIcon size={12} className="text-ink-4" />
                          <span>{formatFullDate(p.createdAt)}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setActivePayoutForRetry(p)}
                          className="h-8 text-xs font-medium"
                          icon={<RefreshCwIcon size={12} />}
                        >
                          Retry
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* Retry Modal Dialog */}
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
/* RETRY PAYOUT MODAL DIALOG                                                 */
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-paper w-full max-w-lg rounded-xl shadow-2xl border border-ink/20 overflow-hidden">
        <div className="px-6 py-4 bg-sand/30 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCwIcon size={18} className="text-copper" />
            <h3 className="font-bold text-ink text-base">Retry Failed Disbursement</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-4 hover:text-ink p-1 rounded transition"
          >
            <XIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Summary Box */}
          <div className="bg-sand/20 rounded-lg p-3.5 border border-ink/10 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-500">Payout ID:</span>
              <span className="font-mono font-semibold text-ink">{payout.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Beneficiary:</span>
              <span className="font-semibold text-ink">{payout.supplierName || payout.supplierId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Disbursement Amount:</span>
              <span className="font-mono font-bold text-ink">{formatLKR(net)}</span>
            </div>
            {payout.failureReason && (
              <div className="pt-2 border-t border-ink/10">
                <span className="text-ink-500 block mb-1">Previous Failure Reason:</span>
                <span className="text-rose font-medium bg-rose/10 px-2 py-1 rounded block">
                  {payout.failureReason}
                </span>
              </div>
            )}
          </div>

          {/* Audit Reason Field */}
          <div>
            <label className="block text-xs font-semibold text-ink mb-1.5">
              Operational Reason for Retry <span className="text-rose">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Bank account routing verified with supplier, network glitch cleared by gateway…"
              className="w-full px-3 py-2 text-sm bg-paper border border-ink/20 rounded-md focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
              disabled={retry.isPending}
            />
            <div className="flex justify-between items-center mt-1 text-[11px] text-ink-500">
              <span>Required for compliance audit trail</span>
              <span className={reason.trim().length < 5 ? 'text-copper font-medium' : 'text-mint font-medium'}>
                {reason.trim().length}/5 min chars
              </span>
            </div>
          </div>

          <div className="text-xs text-ink-500 bg-sand/30 p-3 rounded-md border border-ink/10">
            <p className="font-medium text-ink mb-0.5">Audit Compliance Notice</p>
            Retrying this payout resets its status to <span className="font-mono font-semibold">pending</span> for the next settlement batch run and logs an immutable audit event with your admin signature.
          </div>

          {error && <ErrorBanner message={error} />}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={retry.isPending}
            >
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
              Confirm Retry
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 2: Direct Refund Tab                                                  */
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Refund Form */}
      <Surface className="p-6 lg:col-span-2 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <BanknoteIcon size={20} className="text-copper" />
            <h2 className="text-lg font-bold text-ink">Direct Payment Refund</h2>
          </div>
          <p className="text-xs text-ink-500 mt-1">
            Issue emergency or manual customer refunds directly against a verified payment transaction reference.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Payment Reference ID <span className="text-rose">*</span>
            </label>
            <input
              type="text"
              value={paymentId}
              onChange={(e) => setPaymentId(e.target.value)}
              placeholder="e.g. pay_9f81a7b2... or ord_payment_..."
              className="w-full px-3 py-2 text-sm font-mono bg-paper border border-ink/20 rounded-md focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
              disabled={issue.isPending}
            />
            <p className="text-[11px] text-ink-4 mt-1">
              Find reference IDs in the <Link to="/admin/payments" className="underline hover:text-ink">Payments Registry</Link> or <Link to="/admin/orders" className="underline hover:text-ink">Orders</Link>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Refund Amount (LKR) <span className="text-rose">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-ink/50">
                Rs.
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountLKR}
                onChange={(e) => setAmountLKR(e.target.value)}
                placeholder="0.00"
                className="w-full pl-11 pr-3 py-2 text-sm font-mono font-bold bg-paper border border-ink/20 rounded-md focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
                disabled={issue.isPending}
              />
            </div>
            {amountCents > 0 && (
              <p className="text-[11px] text-copper font-mono mt-1 font-medium">
                Equivalent to {amountCents.toLocaleString()} cents in payment gateway
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink mb-1">
              Operational Reason <span className="text-rose">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Detailed reason for refund (e.g. Customer returned damaged organic staples, duplicate charge waived)…"
              className="w-full px-3 py-2 text-sm bg-paper border border-ink/20 rounded-md focus:border-ink focus:outline-none placeholder:text-ink-4 text-ink"
              disabled={issue.isPending}
            />
            <div className="flex justify-between items-center mt-1 text-[11px] text-ink-500">
              <span>Required for financial audit logging</span>
              <span className={reason.trim().length < 5 ? 'text-copper font-medium' : 'text-mint font-medium'}>
                {reason.trim().length}/5 min chars
              </span>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}
          {done && (
            <SuccessBanner message="Refund successfully issued! Transaction recorded and audited with idempotent signature." />
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={issue.isPending}
              disabled={!paymentId.trim() || amountCents <= 0 || reason.trim().length < 5}
              icon={<BanknoteIcon size={16} />}
              className="w-full sm:w-auto"
            >
              Issue Audited Refund
            </Button>
          </div>
        </form>
      </Surface>

      {/* Guidelines & Quick Links */}
      <div className="space-y-4">
        <Surface className="p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
            Refund Guidelines
          </h3>
          <ul className="text-xs text-ink-500 space-y-2.5">
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Idempotent Execution:</strong> Every refund generates a unique UUID idempotency key to prevent accidental duplicate customer credits.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Ledger Integration:</strong> Direct refunds post an automatic debit entry to the General Ledger and notify the merchant.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
              <span>
                <strong className="text-ink">Full Audit Trail:</strong> Your operator user ID, IP address, and timestamp are sealed in the administrative audit record.
              </span>
            </li>
          </ul>
        </Surface>

        <Surface className="p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500 font-semibold">
            Related Workspaces
          </h3>
          <div className="space-y-2 text-xs">
            <Link
              to="/admin/money?tab=refunds"
              className="flex items-center justify-between p-2.5 rounded bg-sand/20 hover:bg-sand/40 transition font-medium text-ink"
            >
              <span>General Refund Queue</span>
              <ArrowRightIcon size={14} className="text-ink-4" />
            </Link>
            <Link
              to="/admin/payments"
              className="flex items-center justify-between p-2.5 rounded bg-sand/20 hover:bg-sand/40 transition font-medium text-ink"
            >
              <span>Payment Gateway Search</span>
              <ExternalLinkIcon size={14} className="text-ink-4" />
            </Link>
            <Link
              to="/admin/orders"
              className="flex items-center justify-between p-2.5 rounded bg-sand/20 hover:bg-sand/40 transition font-medium text-ink"
            >
              <span>Customer Orders Registry</span>
              <ExternalLinkIcon size={14} className="text-ink-4" />
            </Link>
          </div>
        </Surface>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 3: Invoices & Billing Hub                                             */
/* ========================================================================= */

function InvoicesTab() {
  return (
    <div className="space-y-6">
      <Surface className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ink/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Invoicing & Billing Operations</h2>
            <p className="text-xs text-ink-500 mt-1">
              Automated invoice reconciliation, tax compliance, and merchant commission settlements.
            </p>
          </div>
          <a
            href="/api/admin/audit/export?limit=1000"
            className="vyro-btn vyro-btn-secondary text-xs h-8 px-3 gap-1.5 flex items-center font-mono"
            download
          >
            <DownloadIcon size={14} />
            Export Invoicing Audit (CSV)
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-sand/20 border border-ink/10 space-y-2">
            <span className="text-xs font-mono uppercase text-ink-500 font-semibold">
              Tax Invoices
            </span>
            <div className="text-xl font-bold font-mono text-ink">Automated</div>
            <p className="text-xs text-ink-500">
              Sri Lanka VAT / SVAT invoice generation for wholesale orders.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-sand/20 border border-ink/10 space-y-2">
            <span className="text-xs font-mono uppercase text-ink-500 font-semibold">
              Billing Cycle
            </span>
            <div className="text-xl font-bold font-mono text-ink">Weekly</div>
            <p className="text-xs text-ink-500">
              Supplier disbursement settlement batches every Tuesday.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-sand/20 border border-ink/10 space-y-2">
            <span className="text-xs font-mono uppercase text-ink-500 font-semibold">
              Dispute Window
            </span>
            <div className="text-xl font-bold font-mono text-ink">7 Days</div>
            <p className="text-xs text-ink-500">
              Merchant invoice reconciliation claim period post delivery.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-sand/20 border border-ink/10 space-y-2">
            <span className="text-xs font-mono uppercase text-ink-500 font-semibold">
              Ledger Sync
            </span>
            <div className="text-xl font-bold font-mono text-mint">100%</div>
            <p className="text-xs text-ink-500">
              All line items posted directly to double-entry ledger.
            </p>
          </div>
        </div>
      </Surface>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Surface className="p-5 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-ink font-bold text-sm">
              <FileTextIcon size={16} className="text-copper" />
              <span>Supplier Payouts & Batches</span>
            </div>
            <p className="text-xs text-ink-500 mt-2">
              Review and disburse weekly vendor settlements with automated fee deductions.
            </p>
          </div>
          <Link
            to="/admin/money?tab=payouts"
            className="vyro-btn vyro-btn-secondary text-xs h-8 px-3 gap-1.5 flex items-center justify-center font-medium mt-3"
          >
            Manage Payout Batches
            <ArrowRightIcon size={13} />
          </Link>
        </Surface>

        <Surface className="p-5 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-ink font-bold text-sm">
              <BanknoteIcon size={16} className="text-copper" />
              <span>Customer Payments Registry</span>
            </div>
            <p className="text-xs text-ink-500 mt-2">
              Browse processed credit card, bank transfer, and cash-on-delivery transactions.
            </p>
          </div>
          <Link
            to="/admin/payments"
            className="vyro-btn vyro-btn-secondary text-xs h-8 px-3 gap-1.5 flex items-center justify-center font-medium mt-3"
          >
            Search Payments
            <ExternalLinkIcon size={13} />
          </Link>
        </Surface>

        <Surface className="p-5 space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-ink font-bold text-sm">
              <AlertTriangleIcon size={16} className="text-copper" />
              <span>Disputes & Claims</span>
            </div>
            <p className="text-xs text-ink-500 mt-2">
              Manage chargebacks, damaged stock claims, and billing adjustments.
            </p>
          </div>
          <Link
            to="/admin/money?tab=chargebacks"
            className="vyro-btn vyro-btn-secondary text-xs h-8 px-3 gap-1.5 flex items-center justify-center font-medium mt-3"
          >
            View Chargebacks
            <ArrowRightIcon size={13} />
          </Link>
        </Surface>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* TAB 4: Ledger & Audit Tab                                                 */
/* ========================================================================= */

function LedgerTab() {
  return (
    <div className="space-y-6">
      <Surface className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-ink/10 pb-4">
          <div>
            <h2 className="text-lg font-bold text-ink">General Ledger & Financial Audit</h2>
            <p className="text-xs text-ink-500 mt-1">
              Immutable double-entry book-keeping stream and compliance activity records.
            </p>
          </div>
          <a
            href="/api/admin/audit/export?limit=1000"
            className="vyro-btn vyro-btn-primary text-xs h-9 px-4 gap-2 flex items-center font-mono"
            download
          >
            <DownloadIcon size={14} />
            Download Audit Trail CSV
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <ScaleIcon size={16} className="text-copper" />
              Double-Entry Ledger Architecture
            </h3>
            <p className="text-xs text-ink-500 leading-relaxed">
              Every financial event across VYRO produces balanced credit and debit ledger entries.
              Accounts include Customer Clearing, Platform Commission, Supplier Payables, Delivery Fees, and Tax Withholdings.
            </p>
            <div className="p-3 bg-sand/20 rounded-lg border border-ink/10 text-xs font-mono space-y-1">
              <div className="text-ink font-semibold">Account Classes:</div>
              <div className="text-ink-500">• 1000 — Cash & Clearing Accounts</div>
              <div className="text-ink-500">• 2000 — Supplier Payables</div>
              <div className="text-ink-500">• 3000 — Platform Revenue & Fees</div>
              <div className="text-ink-500">• 4000 — Tax & Regulatory Reserves</div>
            </div>
            <Link
              to="/admin/money?tab=ledger"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:text-copper transition"
            >
              Open Live General Ledger Workspace →
            </Link>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <ShieldCheckIcon size={16} className="text-mint" />
              Compliance & Security Controls
            </h3>
            <ul className="text-xs text-ink-500 space-y-2.5">
              <li className="flex items-start gap-2">
                <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
                <span>
                  <strong className="text-ink">Idempotency Guarantee:</strong> All payout retries and refund postings require unique UUID keys to prevent double-spending.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
                <span>
                  <strong className="text-ink">Immutable Audit Trail:</strong> Admin actions log before/after state snapshots, IP addresses, and operator signatures.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircleIcon size={15} className="text-mint shrink-0 mt-0.5" />
                <span>
                  <strong className="text-ink">Role Separation:</strong> Disbursements require multi-signature authorization between financial operators and super admins.
                </span>
              </li>
            </ul>

            <div className="pt-2">
              <Link
                to="/admin/audit"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:text-copper transition"
              >
                Inspect Global Audit Activity Log →
              </Link>
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}
