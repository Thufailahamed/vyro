import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ArrowRightIcon, ShieldCheckIcon, AlertCircleIcon } from '@/components/icons';

export type CommandCenterData = {
  needsAction: {
    stuckPayments: number;
    payoutFailures: number;
    slaBreaches: number;
    openDisputes: number;
  };
  recentEvents: Array<{ id: string; action: string; createdAt: number }>;
};

export function useCommandCenter() {
  return useQuery({
    queryKey: ['admin-command-center'],
    queryFn: () => api.get<CommandCenterData>('/admin/command-center'),
    refetchInterval: 60_000,
    retry: false,
  });
}

export function CommandCenter({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const { data, isLoading, isError } = useCommandCenter();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-20 animate-pulse ${
              variant === 'dark' ? 'bg-paper/5 border border-paper/10' : 'bg-slate-100 border border-ink/10'
            }`}
          />
        ))}
      </div>
    );
  }

  if (isError || !data) return null;
  const n = data.needsAction;

  const items = [
    {
      label: 'Stuck Payments',
      value: n.stuckPayments,
      to: '/admin/finance?tab=refunds',
      hint: 'Refund & escrow holds',
    },
    {
      label: 'Payout Failures',
      value: n.payoutFailures,
      to: '/admin/finance?tab=payouts',
      hint: 'Supplier bank batches',
    },
    {
      label: 'SLA Breaches',
      value: n.slaBreaches,
      to: '/admin/deliveries',
      hint: 'Dispatch time-outs',
    },
    {
      label: 'Open Disputes',
      value: n.openDisputes,
      to: '/admin/disputed',
      hint: 'Dockside GRN variances',
    },
  ];

  return (
    <section aria-label="Needs action telemetry triage" className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((i) => {
        const hasIssue = i.value > 0;
        return (
          <Link
            key={i.label}
            to={i.to}
            className={`p-3.5 transition-all duration-150 flex flex-col justify-between group ${
              variant === 'dark'
                ? hasIssue
                  ? 'border border-rose/60 bg-rose/15 hover:bg-rose/25 hover:border-rose'
                  : 'border border-paper/15 bg-paper/5 hover:border-paper/35 hover:bg-paper/10'
                : hasIssue
                  ? 'border border-rose/40 bg-rose/5 hover:border-rose hover:bg-rose/10 shadow-xs'
                  : 'border border-ink/15 bg-white hover:border-ink hover:shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[10px] font-mono uppercase tracking-wider font-semibold truncate ${
                  variant === 'dark'
                    ? 'text-paper/70 group-hover:text-paper'
                    : 'text-ink-4 group-hover:text-ink'
                }`}
              >
                {i.label}
              </span>
              {hasIssue ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase font-bold text-rose px-1.5 py-0.2 rounded bg-rose/20 border border-rose/30 animate-pulse">
                  <span className="size-1.5 rounded-full bg-rose" />
                  Action
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase font-semibold ${
                    variant === 'dark' ? 'text-mint/90' : 'text-emerald-700'
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-mint" />
                  Clear
                </span>
              )}
            </div>

            <div className="mt-2.5 flex items-baseline justify-between">
              <div
                className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight ${
                  hasIssue ? 'text-rose' : variant === 'dark' ? 'text-paper' : 'text-ink'
                }`}
              >
                {i.value}
              </div>
              <span
                className={`text-[11px] font-mono transition-all flex items-center gap-0.5 opacity-60 group-hover:opacity-100 ${
                  variant === 'dark'
                    ? 'text-volt group-hover:translate-x-0.5'
                    : 'text-copper group-hover:translate-x-0.5'
                }`}
              >
                <span>Triage</span>
                <ArrowRightIcon size={12} />
              </span>
            </div>

            <div
              className={`text-[10px] font-mono mt-1 truncate ${
                variant === 'dark' ? 'text-paper/40' : 'text-ink-4'
              }`}
            >
              {i.hint}
            </div>
          </Link>
        );
      })}
    </section>
  );
}
