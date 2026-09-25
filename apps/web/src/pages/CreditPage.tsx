import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, EmptyState, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { PageHero, HeroStatusPill } from '@/components/brand/PageHero';
import { formatLKR } from '@/lib/format';
import {
  CREDIT_STARTING_LIMIT_CENTS,
  drawdownStatusLabel,
  remainingCents,
  termsLabel,
  unlockSlotState,
} from '@/lib/creditDisplay';
import {
  ArrowRightIcon,
  BanknoteIcon,
  CheckIcon,
  ClockIcon,
  PackageIcon,
  ShieldCheckIcon,
} from '@/components/icons';

type FacilityPayload = {
  facility: {
    limitCents: number;
    usedCents: number;
    status: string;
    defaultTerms: string;
  } | null;
  availableCents: number;
  eligible: boolean;
  reason: string | null;
  paidOrderCount: number;
  requiredPaidOrders: number;
  overdueCount: number;
};

type Drawdown = {
  id: string;
  purchaseOrderId: string;
  amountCents: number;
  repaidCents: number;
  terms: string;
  dueAt: number;
  status: string;
};

function formatDue(ts: number): string {
  return new Date(ts).toLocaleDateString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function CreditPage() {
  usePageTitle('VYRO Credit');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const facility = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<FacilityPayload>(`/credit/facility?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const drawdowns = useQuery({
    queryKey: ['credit-drawdowns', businessId],
    queryFn: () => api.get<{ items: Drawdown[] }>(`/credit/drawdowns?businessId=${businessId}`),
    enabled: !!businessId,
  });

  if (!businessId) {
    return (
      <EmptyState
        title="No business workspace"
        description="Join or create a buying entity to use VYRO Credit."
        action={
          <Link to="/onboarding/business">
            <Button>Register a business</Button>
          </Link>
        }
      />
    );
  }

  if (facility.isLoading) {
    return (
      <div className="space-y-6 max-w-6xl animate-pulse" aria-busy="true" aria-label="Loading credit">
        <div className="h-10 w-56 vyro-surface" />
        <div className="h-4 w-80 rounded bg-ink/10" />
        <div className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 h-64 vyro-surface" />
          <div className="lg:col-span-4 h-64 vyro-surface" />
        </div>
      </div>
    );
  }

  if (facility.isError) return <ErrorBanner message="Could not load credit facility." />;

  const f = facility.data;
  const required = f?.requiredPaidOrders ?? 3;
  const paid = f?.paidOrderCount ?? 0;

  return (
    <div className="max-w-6xl space-y-8">
      <PageHero
        icon={ShieldCheckIcon}
        kicker="Trade Terms · Verified Buyers"
        title="VYRO Credit"
        description="Pay mill-gate lots on Net 14 or Net 30 after three settled purchase orders. No interest on v1 — overdue draws simply pause new credit."
        status={
          f?.facility ? (
            <HeroStatusPill label={`Facility ${f.facility.status}`} tone={f.eligible ? 'mint' : 'amber'} />
          ) : (
            <HeroStatusPill label={`${paid}/${required} orders to unlock`} tone="amber" />
          )
        }
        footer={
          <>
            <span>Draws settle automatically on PO payment</span>
            {f?.facility && (
              <span className="text-paper/40">
                {formatLKR(f.availableCents)} available of {formatLKR(f.facility.limitCents)}
              </span>
            )}
          </>
        }
      />

      {!f?.facility ? (
        <>
          <UnlockCredit paid={paid} required={required} />
          <HowCreditWorks />
        </>
      ) : (
        <ActiveFacility
          facility={f.facility}
          availableCents={f.availableCents}
          overdueCount={f.overdueCount}
          eligible={f.eligible}
          drawdowns={drawdowns.data?.items ?? []}
          drawdownsLoading={drawdowns.isLoading}
        />
      )}
    </div>
  );
}

function UnlockCredit({ paid, required }: { paid: number; required: number }) {
  const pct = Math.min(100, Math.round((paid / Math.max(required, 1)) * 100));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <Surface className="lg:col-span-8 p-6 sm:p-8 rounded-2xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="vyro-kicker text-copper">Unlock path</div>
            <h2 className="mt-1 text-xl font-bold text-ink">Complete {required} paid orders</h2>
            <p className="text-sm text-ink-3 mt-1 max-w-lg">
              Credit is granted automatically once this workspace has {required} fully paid purchase
              orders. Paying on terms does not count toward the unlock.
            </p>
          </div>
          <div className="font-mono text-sm font-bold text-ink tabular-nums shrink-0">
            {paid}/{required}
          </div>
        </div>

        <div>
          <div className="h-2 rounded-full bg-bone overflow-hidden">
            <div
              className="h-full bg-ink transition-[width] duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-mono uppercase tracking-wider text-ink-4">
            {paid === 0 ? 'No settled POs yet' : `${paid} settled · ${Math.max(required - paid, 0)} remaining`}
          </p>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: required }, (_, i) => {
            const state = unlockSlotState(i, paid);
            return (
              <li
                key={i}
                className={cn(
                  'rounded-xl border p-4 min-h-[5.5rem]',
                  state === 'done' && 'border-mint/40 bg-mint/10',
                  state === 'current' && 'border-ink bg-ink/[0.03] ring-1 ring-volt/40',
                  state === 'todo' && 'border-ink/10 bg-paper',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                    Order {i + 1}
                  </span>
                  {state === 'done' ? (
                    <span className="size-5 rounded-full bg-mint text-paper inline-flex items-center justify-center">
                      <CheckIcon size={12} />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'size-5 rounded-full border inline-flex items-center justify-center text-[10px] font-mono',
                        state === 'current' ? 'border-ink text-ink' : 'border-ink/20 text-ink-4',
                      )}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">
                  {state === 'done' ? 'Paid in full' : state === 'current' ? 'Next to complete' : 'Waiting'}
                </p>
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/search">
            <Button>
              Browse catalog
            </Button>
          </Link>
          <Link to="/orders">
            <Button variant="secondary">View purchase orders</Button>
          </Link>
        </div>
      </Surface>

      <Surface kind="ink" className="lg:col-span-4 p-6 rounded-2xl space-y-4">
        <div className="vyro-kicker text-volt">Starting facility</div>
        <p className="text-xs text-paper/70">Once unlocked, this workspace receives</p>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-paper/50">Credit limit</div>
          <div className="font-mono text-3xl font-bold text-volt tabular-nums mt-1">
            {formatLKR(CREDIT_STARTING_LIMIT_CENTS)}
          </div>
        </div>
        <ul className="space-y-2 text-sm text-paper/80">
          <li className="flex gap-2">
            <ClockIcon size={16} className="text-volt shrink-0 mt-0.5" />
            Default terms Net 30 · Net 14 at checkout
          </li>
          <li className="flex gap-2">
            <ShieldCheckIcon size={16} className="text-volt shrink-0 mt-0.5" />
            Overdue draws freeze new credit until repaid
          </li>
          <li className="flex gap-2">
            <BanknoteIcon size={16} className="text-volt shrink-0 mt-0.5" />
            VYRO can raise the limit after clean repayment
          </li>
        </ul>
      </Surface>
    </div>
  );
}

function ActiveFacility({
  facility,
  availableCents,
  overdueCount,
  eligible,
  drawdowns,
  drawdownsLoading,
}: {
  facility: NonNullable<FacilityPayload['facility']>;
  availableCents: number;
  overdueCount: number;
  eligible: boolean;
  drawdowns: Drawdown[];
  drawdownsLoading: boolean;
}) {
  const usedPct =
    facility.limitCents > 0
      ? Math.min(100, Math.round((facility.usedCents / facility.limitCents) * 100))
      : 0;
  const paused = facility.status !== 'active' || overdueCount > 0;

  return (
    <div className="space-y-5">
      {overdueCount > 0 && (
        <ErrorBanner
          message={`${overdueCount} drawdown${overdueCount === 1 ? '' : 's'} overdue. Repay open POs to unlock new credit draws.`}
        />
      )}
      {facility.status !== 'active' && (
        <ErrorBanner message={`Facility is ${facility.status}. Contact VYRO support to restore terms.`} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard
          label="Credit limit"
          value={formatLKR(facility.limitCents)}
          icon={<BanknoteIcon size={15} />}
          iconTile="bg-ink/[0.05] text-ink-3"
        />
        <MetricCard
          label="Drawn"
          value={formatLKR(facility.usedCents)}
          icon={<ClockIcon size={15} />}
          iconTile="bg-amber/15 text-amber"
        />
        <MetricCard
          label="Available"
          value={formatLKR(availableCents)}
          hint={paused ? 'Paused' : eligible ? termsLabel(facility.defaultTerms) : 'Not eligible'}
          icon={<ShieldCheckIcon size={15} />}
          iconTile="bg-volt/20 text-volt"
          accent
        />
      </div>

      <Surface className="p-5 rounded-2xl space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Limit used</span>
          <span className="text-xs font-mono font-semibold text-ink">
            {formatLKR(facility.usedCents)} of {formatLKR(facility.limitCents)} · {usedPct}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-ink/[0.07] overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', overdueCount > 0 ? 'bg-rose' : usedPct >= 80 ? 'bg-amber' : 'bg-volt')}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <p className="text-xs text-ink-3">
          Default terms {termsLabel(facility.defaultTerms)}. Choose Net 14 or Net 30 when you check out
          on credit.
        </p>
        <div className="flex flex-wrap gap-2">
          {paused ? (
            <Button size="sm" disabled>
              Shop on terms
            </Button>
          ) : (
            <Link to="/search">
              <Button size="sm">Shop on terms</Button>
            </Link>
          )}
          <Link to="/orders">
            <Button size="sm" variant="secondary">
              Purchase orders
            </Button>
          </Link>
        </div>
      </Surface>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 border-b border-ink/10 pb-3">
          <div>
            <div className="vyro-kicker text-copper">Drawdowns</div>
            <h2 className="mt-1 text-lg font-bold text-ink">Open and settled draws</h2>
          </div>
        </div>

        {drawdownsLoading && (
          <div className="h-24 vyro-surface animate-pulse" aria-label="Loading drawdowns" />
        )}

        {!drawdownsLoading && drawdowns.length === 0 && (
          <EmptyState
            icon={<BanknoteIcon size={20} />}
            title="No credit draws yet"
            description="At checkout, choose Pay on terms to draw against this facility."
          />
        )}

        {!drawdownsLoading && drawdowns.length > 0 && (
          <ul className="space-y-2">
            {drawdowns.map((d) => {
              const left = remainingCents(d.amountCents, d.repaidCents);
              return (
                <li key={d.id}>
                  <Surface className="p-4 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="size-9 rounded-lg bg-copper/15 text-copper-deep flex items-center justify-center shrink-0">
                        <BanknoteIcon size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{termsLabel(d.terms)}</span>
                          <StatusPill status={d.status} />
                        </div>
                        <p className="text-xs text-ink-3 mt-1">
                          Due {formatDue(d.dueAt)} · Remaining {formatLKR(left)} of {formatLKR(d.amountCents)}
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/orders/${d.purchaseOrderId}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:text-copper transition-colors px-3 py-1.5 rounded-full bg-bone border border-ink/10 hover:border-ink shrink-0"
                    >
                      View PO <ArrowRightIcon size={12} />
                    </Link>
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
  iconTile = 'bg-ink/[0.05] text-ink-3',
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  iconTile?: string;
  accent?: boolean;
}) {
  return (
    <Surface className={cn('p-5 rounded-2xl', accent && 'bg-ink text-paper')}>
      <div className="flex items-center justify-between gap-2">
        <div className={cn('text-[10px] font-mono uppercase tracking-wider', accent ? 'text-paper/50' : 'text-ink-4')}>
          {label}
        </div>
        {icon && (
          <span className={cn('size-8 rounded-lg flex items-center justify-center shrink-0', iconTile)}>
            {icon}
          </span>
        )}
      </div>
      <div className={cn('font-mono text-2xl font-bold tabular-nums mt-2', accent ? 'text-volt' : 'text-ink')}>
        {value}
      </div>
      {hint && (
        <div className={cn('text-[11px] mt-1', accent ? 'text-paper/60' : 'text-ink-4')}>{hint}</div>
      )}
    </Surface>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-mono uppercase tracking-wider font-bold px-2 py-0.5 rounded-md',
        status === 'overdue' && 'bg-rose/15 text-rose',
        status === 'repaid' && 'bg-ink/10 text-ink-3',
        status === 'active' && 'bg-mint/15 text-mint',
        status !== 'overdue' && status !== 'repaid' && status !== 'active' && 'bg-ink/10 text-ink-3',
      )}
    >
      {drawdownStatusLabel(status)}
    </span>
  );
}

function HowCreditWorks() {
  const steps = [
    {
      icon: PackageIcon,
      title: 'Buy as usual',
      body: 'Place mill-gate POs from the catalog. The first three must be paid in full — not on terms.',
    },
    {
      icon: ShieldCheckIcon,
      title: 'Facility unlocks',
      body: `After three settled orders, VYRO grants a ${formatLKR(CREDIT_STARTING_LIMIT_CENTS)} limit on this workspace automatically.`,
    },
    {
      icon: ClockIcon,
      title: 'Checkout on terms',
      body: 'Choose Net 14 or Net 30 at checkout. Settle the PO by the due date to keep the line open.',
    },
  ];

  return (
    <section className="space-y-4">
      <div>
        <div className="vyro-kicker text-copper">How it works</div>
        <h2 className="mt-1 text-lg font-bold text-ink">Trade credit, not a loan form</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((s, i) => (
          <Surface key={s.title} className="p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <s.icon size={18} className="text-copper" />
              <span className="text-[10px] font-mono text-ink-4">0{i + 1}</span>
            </div>
            <h3 className="text-sm font-bold text-ink">{s.title}</h3>
            <p className="text-xs text-ink-3 leading-relaxed">{s.body}</p>
          </Surface>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Surface className="p-5 rounded-2xl">
          <h3 className="text-sm font-bold text-ink">Net 14</h3>
          <p className="text-xs text-ink-3 mt-1 leading-relaxed">
            Full PO balance due 14 days after you draw. Use it when stock turns quickly.
          </p>
        </Surface>
        <Surface className="p-5 rounded-2xl">
          <h3 className="text-sm font-bold text-ink">Net 30</h3>
          <p className="text-xs text-ink-3 mt-1 leading-relaxed">
            Full PO balance due in 30 days. Default terms on a new facility.
          </p>
        </Surface>
      </div>
    </section>
  );
}
