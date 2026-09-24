import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, Input, Label } from '@/components/ui';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { cn, useToast } from '@vyro/ui';
import { formatLKR } from '@/lib/format';
import { Money, StatusPill, time, useConfirm } from '@/accounts/shared';
import { useSupplierId } from './useSupplierId';
import { LearningCta } from './learning/LearningCta';
import { SupplierErrorState, SupplierLoadingState } from './SupplierPageState';
import {
  ArrowRightIcon,
  BanknoteIcon,
  Building2Icon,
  CheckCircle2Icon,
  ClockIcon,
  CreditCardIcon,
  FileTextIcon,
  LayersIcon,
  PercentIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
} from '@/components/icons';

type Tab = 'earnings' | 'settlements' | 'payouts' | 'transactions' | 'bank';

const TABS: Array<{ id: Tab; label: string; icon: typeof BanknoteIcon }> = [
  { id: 'earnings', label: 'Earnings', icon: TrendingUpIcon },
  { id: 'settlements', label: 'Settlements', icon: LayersIcon },
  { id: 'payouts', label: 'Payouts', icon: BanknoteIcon },
  { id: 'transactions', label: 'Transactions', icon: FileTextIcon },
  { id: 'bank', label: 'Bank details', icon: Building2Icon },
];

type Overview = {
  grossCents: number;
  commissionCents: number;
  refundCents: number;
  adjustmentCents: number;
  netCents: number;
  paidOutCents: number;
  pendingSettlementCents: number;
  availableCents: number;
  todayCents: number;
  monthCents: number;
};

type BankAccount = {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumberMasked: string;
  branch: string | null;
  verificationStatus: string;
  isDefault: boolean;
};

export function SupplierAccountsPage() {
  const { supplierId, supplierName } = useSupplierId();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'earnings';
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p);
  };

  const overview = useQuery({
    queryKey: ['supplier-accounts', 'overview', supplierId],
    queryFn: () => api.get<Overview>(`/finance/supplier/overview?supplierId=${supplierId}`),
  });

  const bank = useQuery({
    queryKey: ['supplier-accounts', 'bank', supplierId],
    queryFn: () => api.get<{ accounts: BankAccount[] }>(`/finance/supplier/bank-accounts?supplierId=${supplierId}`),
  });

  const handleRefresh = async () => {
    toast.info('Refreshing accounts…');
    await Promise.all([overview.refetch(), bank.refetch()]);
    toast.success('Accounts synchronized');
  };

  if (overview.isLoading && !overview.data) {
    return <SupplierLoadingState label="Loading accounts ledger" />;
  }

  if (overview.isError && !overview.data) {
    return (
      <SupplierErrorState
        message={(overview.error as ApiError).message ?? 'Could not load accounts.'}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const d = overview.data;
  const defaultBank = (bank.data?.accounts ?? []).find((a) => a.isDefault) ?? bank.data?.accounts?.[0];
  const hasActivity = (d?.grossCents ?? 0) > 0 || (d?.netCents ?? 0) > 0 || (d?.availableCents ?? 0) > 0;

  const heroHint = !d
    ? ''
    : d.pendingSettlementCents > 0
      ? `${formatLKR(d.pendingSettlementCents)} is settling now and sweeps to your bank on the next payout run.`
      : d.availableCents > 0
        ? 'Eligible and ready for the next payout sweep.'
        : d.paidOutCents > 0
          ? `Everything earned so far is paid out — ${formatLKR(d.paidOutCents)} to date.`
          : 'Confirmed buyer payments land here as soon as your first order completes.';

  const flowSegments = d
    ? [
        { key: 'paid', label: 'Paid out', cents: d.paidOutCents, tone: 'bg-mint' },
        { key: 'available', label: 'Available', cents: d.availableCents, tone: 'bg-volt' },
        { key: 'pending', label: 'Pending settlement', cents: d.pendingSettlementCents, tone: 'bg-amber' },
      ]
    : [];
  const flowTotal = flowSegments.reduce((sum, s) => sum + Math.max(0, s.cents), 0);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.16em] text-copper font-semibold">
            {supplierName} · Treasury & Settlement
          </div>
          <h1 className="vyro-display text-2xl sm:text-3xl font-bold text-ink mt-1">Accounts</h1>
          <p className="text-sm text-ink-3 mt-1 max-w-xl">
            Sales, VYRO fees, what you are owed, and what has already been paid out.
          </p>
        </div>
        <div className="hidden sm:block pb-1 text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">
          All amounts in LKR
        </div>
      </header>

      <LearningCta variant="banner" />

      {d && (
        <>
          <Surface kind="ink" className="grain rounded-xl shadow-soft-lg">
            <div className="pointer-events-none absolute -top-28 -right-20 size-80 rounded-full bg-volt/15 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-copper/25 blur-3xl" aria-hidden />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] font-semibold text-volt">
                    <BanknoteIcon size={13} />
                    Available to settle
                  </div>
                  <MetricNumber size="xl" className="mt-3 text-volt">
                    {formatLKR(d.availableCents)}
                  </MetricNumber>
                  <p className="mt-2.5 max-w-md text-sm leading-relaxed text-paper/60">{heroHint}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-3 py-1.5 font-mono text-xs">
                    <span className={cn('size-2 rounded-full', hasActivity ? 'bg-volt animate-pulse' : 'bg-amber')} />
                    <span className="font-semibold text-paper">{hasActivity ? 'Ledger live' : 'Awaiting first sale'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={overview.isFetching}
                    title="Refresh balances"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-paper/15 bg-paper/5 px-3 text-xs font-semibold text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper disabled:opacity-50"
                  >
                    <RefreshCwIcon size={13} className={overview.isFetching ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-7 grid gap-6 border-t border-paper/10 pt-6 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="min-w-0">
                  {flowTotal > 0 ? (
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-paper/10">
                      {flowSegments.map((s) =>
                        s.cents > 0 ? (
                          <div
                            key={s.key}
                            className={cn('h-full', s.tone)}
                            style={{ width: `${(Math.max(0, s.cents) / flowTotal) * 100}%`, minWidth: '6px' }}
                          />
                        ) : null,
                      )}
                    </div>
                  ) : (
                    <div className="flex h-2.5 w-full items-center rounded-full border border-dashed border-paper/25 bg-paper/5" />
                  )}
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {flowSegments.map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-2 text-xs text-paper/60">
                        <span className={cn('size-2 rounded-full', s.tone)} />
                        {s.label}
                        <span className="font-mono font-semibold tabular-nums text-paper">{formatLKR(s.cents)}</span>
                      </span>
                    ))}
                  </div>
                </div>

                {defaultBank ? (
                  <div className="flex items-center gap-3 rounded-xl border border-paper/15 bg-paper/5 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-volt/15 text-volt">
                      <Building2Icon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-paper/50">Payout destination</div>
                      <div className="truncate text-sm font-semibold text-paper">
                        {defaultBank.bankName} · {defaultBank.accountNumberMasked}
                      </div>
                    </div>
                    {defaultBank.verificationStatus !== 'verified' ? (
                      <span className="shrink-0 font-mono text-[10px] font-semibold text-amber">
                        {defaultBank.verificationStatus.replace(/_/g, ' ')}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTab('bank')}
                    className="group flex items-center gap-3 rounded-xl border border-dashed border-volt/40 bg-volt/10 px-4 py-3 text-left transition-colors hover:bg-volt/15"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-volt/20 text-volt">
                      <PlusIcon size={15} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-mono uppercase tracking-[0.14em] text-volt/80">No payout account</span>
                      <span className="block text-sm font-semibold text-volt">Add bank details</span>
                    </span>
                    <ArrowRightIcon size={14} className="shrink-0 text-volt transition-transform group-hover:translate-x-0.5" />
                  </button>
                )}
              </div>
            </div>
          </Surface>

          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi
              icon={<TrendingUpIcon size={13} />}
              label="Net earnings"
              cents={d.netCents}
              hint={`Today ${formatLKR(d.todayCents)} · This month ${formatLKR(d.monthCents)}`}
            />
            <Kpi
              icon={<FileTextIcon size={13} />}
              label="Gross sales"
              cents={d.grossCents}
              hint={d.refundCents > 0 ? `Refunds ${formatLKR(d.refundCents)}` : 'Confirmed buyer payments'}
            />
            <Kpi
              icon={<PercentIcon size={13} />}
              label="VYRO fees"
              cents={d.commissionCents}
              hint={d.adjustmentCents !== 0 ? `Adjustments ${formatLKR(d.adjustmentCents)}` : 'Platform commission'}
            />
          </div>

          {tab === 'earnings' && (
            <Surface kind="elevated" className="p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-3 mb-6">
                <div className="text-xs font-mono uppercase tracking-wider font-bold text-ink flex items-center gap-2">
                  <span className="size-2 rounded-full bg-volt" />
                  How your money moves
                </div>
                <span className="text-xs text-ink-4 font-mono">Gross − fees = net · net settles into payouts</span>
              </div>
              <div className="grid gap-6 sm:grid-cols-4 sm:gap-4">
                <FlowStep
                  phase="1"
                  title="Buyer pays"
                  body="Gross sales land when a buyer payment confirms."
                  value={formatLKR(d.grossCents)}
                  icon={<CreditCardIcon size={15} className="text-copper" />}
                />
                <FlowStep
                  phase="2"
                  title="VYRO takes fees"
                  body="Commission (and any refunds) come off the top."
                  value={formatLKR(d.commissionCents)}
                  icon={<PercentIcon size={15} className="text-copper" />}
                />
                <FlowStep
                  phase="3"
                  title="You earn"
                  body="Net earnings become eligible, then settle."
                  value={formatLKR(d.netCents)}
                  icon={<CheckCircle2Icon size={15} className="text-mint" />}
                />
                <FlowStep
                  phase="4"
                  title="You get paid"
                  body={
                    defaultBank
                      ? `Swept to ${defaultBank.bankName} ${defaultBank.accountNumberMasked}.`
                      : 'Add a bank account to receive settlements.'
                  }
                  value={formatLKR(d.paidOutCents)}
                  icon={<Building2Icon size={15} className="text-copper" />}
                  last
                  action={
                    !defaultBank ? (
                      <button type="button" onClick={() => setTab('bank')} className="text-xs text-copper hover:underline font-semibold">
                        Add payout account →
                      </button>
                    ) : defaultBank.verificationStatus !== 'verified' ? (
                      <span className="text-[11px] text-amber font-semibold">Bank {defaultBank.verificationStatus.replace(/_/g, ' ')}</span>
                    ) : null
                  }
                />
              </div>
            </Surface>
          )}
        </>
      )}

      <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-ink/[0.05] p-1 scrollbar-none">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium transition-all cursor-pointer',
                active ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:text-ink',
              )}
            >
              <Icon size={14} className={active ? 'text-volt' : 'text-ink-4'} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div key={tab} className="animate-fade-in">
        {tab === 'earnings' && <Earnings supplierId={supplierId} />}
        {tab === 'settlements' && <Settlements supplierId={supplierId} />}
        {tab === 'payouts' && <Payouts supplierId={supplierId} />}
        {tab === 'transactions' && <Transactions supplierId={supplierId} />}
        {tab === 'bank' && <BankDetails supplierId={supplierId} />}
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  cents,
  hint,
}: {
  icon: ReactNode;
  label: string;
  cents: number;
  hint: string;
}) {
  return (
    <div className="group relative overflow-hidden vyro-surface p-5 transition-all duration-200 hover:border-ink/20 hover:shadow-soft-md">
      <div
        className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-copper/70 via-copper/25 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        aria-hidden
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 font-semibold">{label}</span>
        <span className="flex size-7 items-center justify-center rounded-lg bg-copper/10 text-copper transition-colors duration-200 group-hover:bg-copper/20">
          {icon}
        </span>
      </div>
      <MetricNumber size="md" className="mt-2.5 text-ink">
        {formatLKR(cents)}
      </MetricNumber>
      <div className="mt-1.5 text-xs text-ink-4">{hint}</div>
    </div>
  );
}

function FlowStep({
  phase,
  title,
  body,
  value,
  icon,
  action,
  last = false,
}: {
  phase: string;
  title: string;
  body: string;
  value: string;
  icon: ReactNode;
  action?: ReactNode;
  last?: boolean;
}) {
  return (
    <div className="relative flex gap-4 sm:block">
      {!last && (
        <>
          <div
            className="absolute left-[19px] top-11 -bottom-6 w-0.5 rounded-full bg-gradient-to-b from-copper/50 via-ink/20 to-ink/10 sm:hidden"
            aria-hidden
          />
          <div
            className="absolute top-[19px] left-11 -right-4 hidden h-0.5 overflow-hidden rounded-full bg-ink/10 sm:block"
            aria-hidden
          >
            <div className="h-full w-full animate-shimmer bg-gradient-to-r from-transparent via-copper/60 to-transparent bg-[length:200%_100%]" />
          </div>
        </>
      )}
      <div className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border border-copper/40 bg-paper shadow-soft-sm ring-4 ring-paper">
        {icon}
      </div>
      <div className="min-w-0 pb-1 sm:pt-4">
        <div className="text-[10px] font-mono text-copper font-bold uppercase tracking-[0.14em]">Phase {phase}</div>
        <div className="mt-0.5 text-sm font-semibold text-ink">{title}</div>
        <p className="mt-1 text-xs text-ink-4 leading-relaxed">{body}</p>
        <div className="vyro-metric mt-2 text-base text-ink">{value}</div>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}

function FilterPills({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-ink/[0.05] rounded-full max-w-full overflow-x-auto scrollbar-none">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            'h-8 px-3.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer capitalize',
            o.id === value
              ? 'bg-ink text-paper shadow-sm'
              : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LedgerEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Surface kind="elevated" className="flow-bg overflow-hidden p-8 sm:p-12 text-center">
      <div className="max-w-md mx-auto space-y-4">
        <div className="size-14 rounded-xl bg-volt/20 text-volt-deep mx-auto flex items-center justify-center shadow-xs ring-8 ring-volt/10">
          {icon}
        </div>
        <div className="space-y-1.5">
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
          <p className="text-xs text-ink-3 leading-relaxed">{description}</p>
        </div>
        {action ? <div className="pt-1 flex flex-wrap justify-center gap-3">{action}</div> : null}
      </div>
    </Surface>
  );
}

function LedgerTable({
  columns,
  children,
}: {
  columns: Array<{ label: string; align?: 'left' | 'right' }>;
  children: ReactNode;
}) {
  return (
    <Surface kind="elevated" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-bone/60 text-ink-4 text-[10px] font-mono uppercase tracking-[0.14em] border-b border-ink/10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.label}
                  className={cn('px-4 py-3.5 font-bold first:pl-5 last:pr-5', c.align === 'right' ? 'text-right' : 'text-left')}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">{children}</tbody>
        </table>
      </div>
    </Surface>
  );
}

function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function Earnings({ supplierId }: { supplierId: string }) {
  const [eligibility, setEligibility] = useState('');
  const q = useQuery({
    queryKey: ['supplier-accounts', 'earnings', supplierId, eligibility],
    queryFn: () =>
      api.get<{
        earnings: Array<{
          id: string;
          purchaseOrderId: string;
          grossCents: number;
          commissionBps: number;
          commissionCents: number;
          refundCents: number;
          netCents: number;
          eligibility: string;
          createdAt: number;
        }>;
      }>(`/finance/supplier/earnings?supplierId=${supplierId}${eligibility ? `&status=${eligibility}` : ''}`),
  });

  if (q.isLoading) return <div className="vyro-surface h-56 animate-pulse" aria-label="Loading earnings" />;
  if (q.isError) {
    return <SupplierErrorState message={(q.error as ApiError).message} onRetry={() => void q.refetch()} />;
  }

  const earnings = q.data?.earnings ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <FilterPills
          value={eligibility}
          onChange={setEligibility}
          options={[
            { id: '', label: 'All' },
            { id: 'eligible', label: 'Eligible' },
            { id: 'ineligible', label: 'Ineligible' },
            { id: 'held', label: 'Held' },
            { id: 'settled', label: 'Settled' },
          ]}
        />
        <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
          {earnings.length} {earnings.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {earnings.length === 0 ? (
        <LedgerEmpty
          icon={<TrendingUpIcon size={24} />}
          title={eligibility ? `No ${eligibility} earnings` : 'No earnings yet'}
          description={
            eligibility
              ? 'Nothing matches this filter. Confirmed buyer payments create earnings here automatically.'
              : 'Earnings appear when a buyer payment confirms. Gross, fees, and net will list against each order.'
          }
          action={
            <>
              {eligibility ? (
                <Button variant="ghost" size="sm" onClick={() => setEligibility('')} className="text-xs">
                  Clear filter
                </Button>
              ) : (
                <Link to="/supplier/orders">
                  <Button variant="primary" size="sm">
                    View orders
                  </Button>
                </Link>
              )}
            </>
          }
        />
      ) : (
        <LedgerTable
          columns={[
            { label: 'Order' },
            { label: 'Gross', align: 'right' },
            { label: 'Fee', align: 'right' },
            { label: 'Refunds', align: 'right' },
            { label: 'Status' },
            { label: 'Net', align: 'right' },
          ]}
        >
          {earnings.map((e) => (
            <tr key={e.id} className="hover:bg-bone/40 transition-colors">
              <td className="px-5 py-4">
                <div className="font-mono text-xs font-semibold text-ink">{e.purchaseOrderId.slice(0, 10)}…</div>
                <div className="text-[11px] text-ink-4 mt-0.5">{time(e.createdAt)}</div>
              </td>
              <td className="px-4 py-4 text-right tabular-nums text-xs">
                <Money cents={e.grossCents} />
              </td>
              <td className="px-4 py-4 text-right">
                <div className="tabular-nums text-xs text-ink-3">
                  <Money cents={e.commissionCents} />
                </div>
                <div className="text-[10px] font-mono text-ink-4">{bpsToPct(e.commissionBps)}</div>
              </td>
              <td className="px-4 py-4 text-right tabular-nums text-xs text-ink-4">
                {e.refundCents > 0 ? <Money cents={e.refundCents} /> : '—'}
              </td>
              <td className="px-4 py-4">
                <StatusPill status={e.eligibility} />
              </td>
              <td className="px-5 py-4 text-right">
                <Money cents={e.netCents} className="text-sm" />
              </td>
            </tr>
          ))}
        </LedgerTable>
      )}
    </div>
  );
}

function Settlements({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier-accounts', 'settlements', supplierId],
    queryFn: () =>
      api.get<{ settlements: Array<{ id: string; settlementNumber: string; netCents: number; status: string; createdAt: number }> }>(
        `/finance/supplier/settlements?supplierId=${supplierId}`,
      ),
  });

  if (q.isLoading) return <div className="vyro-surface h-56 animate-pulse" aria-label="Loading settlements" />;
  if (q.isError) {
    return <SupplierErrorState message={(q.error as ApiError).message} onRetry={() => void q.refetch()} />;
  }

  const settlements = q.data?.settlements ?? [];
  if (settlements.length === 0) {
    return (
      <LedgerEmpty
        icon={<ClockIcon size={24} />}
        title="No settlements yet"
        description="Eligible earnings are grouped into settlements, then paid out to your bank on the next sweep."
        action={
          <Link to="/supplier/orders">
            <Button variant="secondary" size="sm" className="text-xs">
              View orders
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <LedgerTable
      columns={[
        { label: 'Settlement' },
        { label: 'Created' },
        { label: 'Status' },
        { label: 'Net', align: 'right' },
      ]}
    >
      {settlements.map((s) => (
        <tr key={s.id} className="hover:bg-bone/40 transition-colors">
          <td className="px-5 py-4 font-semibold text-sm text-ink">{s.settlementNumber}</td>
          <td className="px-4 py-4 text-xs text-ink-4 font-mono">{time(s.createdAt)}</td>
          <td className="px-4 py-4">
            <StatusPill status={s.status} />
          </td>
          <td className="px-5 py-4 text-right">
            <Money cents={s.netCents} className="text-sm" />
          </td>
        </tr>
      ))}
    </LedgerTable>
  );
}

function Payouts({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier-accounts', 'payouts', supplierId],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          payoutNumber: string | null;
          netCents: number;
          status: string;
          method: string;
          externalReference: string | null;
          createdAt: number;
        }>;
      }>(`/payouts?supplierId=${supplierId}`),
  });

  if (q.isLoading) return <div className="vyro-surface h-56 animate-pulse" aria-label="Loading payouts" />;
  if (q.isError) {
    return <SupplierErrorState message={(q.error as ApiError).message} onRetry={() => void q.refetch()} />;
  }

  const payouts = q.data?.items ?? [];
  if (payouts.length === 0) {
    return (
      <LedgerEmpty
        icon={<BanknoteIcon size={24} />}
        title="No payouts yet"
        description="Completed payouts appear here once a settlement is transferred to your linked bank account."
        action={
          <Link to="/supplier/accounts?tab=bank">
            <Button variant="secondary" size="sm" className="text-xs gap-1.5">
              <Building2Icon size={14} />
              Check bank details
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <LedgerTable
      columns={[
        { label: 'Payout' },
        { label: 'Method' },
        { label: 'Status' },
        { label: 'Net', align: 'right' },
      ]}
    >
      {payouts.map((p) => (
        <tr key={p.id} className="hover:bg-bone/40 transition-colors">
          <td className="px-5 py-4">
            <div className="font-semibold text-sm text-ink">{p.payoutNumber ?? p.id.slice(0, 8)}</div>
            <div className="text-[11px] text-ink-4 font-mono mt-0.5">{time(p.createdAt)}</div>
          </td>
          <td className="px-4 py-4 text-xs capitalize text-ink-3">
            {p.method}
            {p.externalReference ? <span className="block font-mono text-[11px] text-ink-4 mt-0.5">{p.externalReference}</span> : null}
          </td>
          <td className="px-4 py-4">
            <StatusPill status={p.status} />
          </td>
          <td className="px-5 py-4 text-right">
            <Money cents={p.netCents} className="text-sm" />
          </td>
        </tr>
      ))}
    </LedgerTable>
  );
}

function Transactions({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier-accounts', 'transactions', supplierId],
    queryFn: () =>
      api.get<{
        transactions: Array<{
          id: string;
          direction: string;
          amountCents: number;
          category: string | null;
          refType: string;
          description: string;
          createdAt: number;
        }>;
      }>(`/finance/supplier/transactions?supplierId=${supplierId}`),
  });

  if (q.isLoading) return <div className="vyro-surface h-56 animate-pulse" aria-label="Loading transactions" />;
  if (q.isError) {
    return <SupplierErrorState message={(q.error as ApiError).message} onRetry={() => void q.refetch()} />;
  }

  const transactions = q.data?.transactions ?? [];
  if (transactions.length === 0) {
    return (
      <LedgerEmpty
        icon={<FileTextIcon size={24} />}
        title="No transactions yet"
        description="Sales, commissions, settlements, and payouts will post here as a running ledger."
      />
    );
  }

  return (
    <LedgerTable
      columns={[
        { label: 'Entry' },
        { label: 'Type' },
        { label: 'Amount', align: 'right' },
      ]}
    >
      {transactions.map((t) => {
        const credit = t.direction === 'credit';
        const cents = credit ? t.amountCents : -t.amountCents;
        return (
          <tr key={t.id} className="hover:bg-bone/40 transition-colors">
            <td className="px-5 py-4">
              <div className="font-medium text-sm text-ink">{t.description}</div>
              <div className="text-[11px] text-ink-4 mt-0.5">{time(t.createdAt)}</div>
            </td>
            <td className="px-4 py-4 text-xs capitalize text-ink-3">{t.category ?? t.refType}</td>
            <td className="px-5 py-4 text-right">
              <Money cents={cents} className={cn('text-sm', credit ? 'text-mint' : 'text-ink')} />
            </td>
          </tr>
        );
      })}
    </LedgerTable>
  );
}

function BankDetails({ supplierId }: { supplierId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const q = useQuery({
    queryKey: ['supplier-accounts', 'bank', supplierId],
    queryFn: () => api.get<{ accounts: BankAccount[] }>(`/finance/supplier/bank-accounts?supplierId=${supplierId}`),
  });
  const [form, setForm] = useState({
    bankName: '',
    accountHolder: '',
    accountNumber: '',
    branch: '',
    accountType: '',
  });

  if (q.isLoading) return <div className="vyro-surface h-56 animate-pulse" aria-label="Loading bank details" />;
  if (q.isError) {
    return <SupplierErrorState message={(q.error as ApiError).message} onRetry={() => void q.refetch()} />;
  }

  const accounts = q.data?.accounts ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-5 space-y-4">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-mono uppercase tracking-wider font-bold text-ink">Payout accounts</h3>
          <span className="text-[11px] font-mono text-ink-4">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber/40 bg-amber/10 p-6 space-y-3">
            <div className="size-10 rounded-lg bg-amber/15 text-amber flex items-center justify-center">
              <Building2Icon size={18} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">No payout account</h4>
              <p className="text-xs text-ink-3 mt-1 leading-relaxed">
                Add a bank account so settlements can be transferred via SLIPS / CEFT.
              </p>
            </div>
          </div>
        ) : (
          accounts.map((a) => {
            const verified = a.verificationStatus === 'verified';
            return (
              <div
                key={a.id}
                className={cn(
                  'relative overflow-hidden rounded-xl border bg-paper p-5 shadow-soft-sm',
                  verified ? 'border-mint/40' : 'border-ink/10',
                )}
              >
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-1',
                    verified ? 'bg-mint' : 'bg-amber',
                  )}
                  aria-hidden
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-lg bg-ink text-volt flex items-center justify-center shrink-0">
                      <Building2Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink truncate">{a.bankName}</span>
                        {a.isDefault ? (
                          <span className="shrink-0 rounded-full bg-volt/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <div className="font-mono text-sm text-ink-3 tracking-wider mt-0.5">{a.accountNumberMasked}</div>
                    </div>
                  </div>
                  <StatusPill status={a.verificationStatus} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-4">
                  <span>{a.accountHolder}</span>
                  {a.branch ? (
                    <>
                      <span>·</span>
                      <span>{a.branch}</span>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        )}

        <p className="flex items-start gap-2 text-[11px] text-ink-4 leading-relaxed px-1">
          <ShieldCheckIcon size={14} className="shrink-0 mt-0.5 text-copper" />
          Full account numbers are never stored or displayed — only a masked reference. Changes are audited.
        </p>
      </div>

      <form
        className="lg:col-span-7 space-y-4 vyro-surface p-5 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          ask({
            title: 'Add payout account?',
            confirmLabel: 'Save account',
            body: (
              <p>
                Account <strong>{form.bankName}</strong> ending <strong>{form.accountNumber.slice(-4)}</strong> will be
                saved. Only masked details are ever displayed.
              </p>
            ),
            action: async () => {
              await api.post('/finance/supplier/bank-accounts', { supplierId, ...form });
              toast.success('Bank account saved — pending verification');
              setForm({ bankName: '', accountHolder: '', accountNumber: '', branch: '', accountType: '' });
              void qc.invalidateQueries({ queryKey: ['supplier-accounts', 'bank', supplierId] });
            },
          });
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <h3 className="text-sm font-bold text-ink">Add payout account</h3>
            <p className="text-xs text-ink-4 mt-1">Used for settlement sweeps. Verification is required before the first payout.</p>
          </div>
          <div className="size-8 rounded-lg bg-ink text-volt flex items-center justify-center shrink-0">
            <PlusIcon size={15} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Bank name</Label>
            <Input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              placeholder="e.g. Commercial Bank"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Account holder</Label>
            <Input
              value={form.accountHolder}
              onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
              placeholder="Name on the account"
              required
            />
          </div>
          <div>
            <Label>Account number</Label>
            <Input
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              placeholder="Digits only"
              required
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Branch (optional)</Label>
            <Input
              value={form.branch}
              onChange={(e) => setForm({ ...form, branch: e.target.value })}
              placeholder="Branch name or code"
            />
          </div>
        </div>

        <div className="flex items-center justify-end pt-1">
          <Button type="submit">Save account</Button>
        </div>
      </form>
      {dialog}
    </div>
  );
}
