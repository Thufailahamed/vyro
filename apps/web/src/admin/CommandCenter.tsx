import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api } from '@/lib/api';
import { ArrowRightIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/icons';

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
  const dark = variant === 'dark';

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn('h-[112px] rounded-[14px] animate-pulse', dark ? 'bg-paper/[0.06]' : 'bg-mist/60')}
          />
        ))}
      </div>
    );
  }

  if (isError || !data) return null;
  const n = data.needsAction;

  const items = [
    { label: 'Stuck payments', value: n.stuckPayments, to: '/admin/finance?tab=refunds', hint: 'Refund & escrow holds' },
    { label: 'Payout failures', value: n.payoutFailures, to: '/admin/finance?tab=payouts', hint: 'Supplier bank batches' },
    { label: 'SLA breaches', value: n.slaBreaches, to: '/admin/deliveries', hint: 'Dispatch time-outs' },
    { label: 'Open disputes', value: n.openDisputes, to: '/admin/disputed', hint: 'Dockside GRN variances' },
  ];

  return (
    <section aria-label="Needs action" className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((i) => {
        const hasIssue = i.value > 0;
        return (
          <Link
            key={i.label}
            to={i.to}
            className={cn(
              'group relative flex flex-col justify-between overflow-hidden rounded-[14px] p-4 transition-all duration-240 ease-vyro hover:-translate-y-0.5',
              dark
                ? hasIssue
                  ? 'bg-gradient-to-b from-rose/[0.2] to-rose/[0.08] shadow-[inset_0_0_0_1px_rgba(196,90,74,0.5),inset_0_1px_0_rgba(255,255,255,0.06),0_12px_30px_-14px_rgba(196,90,74,0.6)] hover:from-rose/[0.26]'
                  : 'bg-gradient-to-b from-paper/[0.06] to-paper/[0.02] shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08),inset_0_1px_0_rgba(250,247,240,0.06)] backdrop-blur-sm hover:from-paper/[0.09] hover:shadow-[inset_0_0_0_1px_rgba(198,220,74,0.3),inset_0_1px_0_rgba(250,247,240,0.08)]'
                : hasIssue
                  ? 'bg-rose/5 shadow-[inset_0_0_0_1px_rgba(196,90,74,0.35)] hover:bg-rose/10'
                  : 'bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.3)]',
            )}
          >
            <div className="flex items-start justify-between gap-2 sm:items-center">
              <span className={cn('min-w-0 text-[13px] font-medium leading-tight sm:truncate', dark ? 'text-paper/75' : 'text-ink-3')}>
                {i.label}
              </span>
              {hasIssue ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose px-1.5 py-0.5 sm:px-2 text-[10px] font-semibold text-paper shadow-[0_0_12px_rgba(196,90,74,0.6)]">
                  <AlertCircleIcon size={11} />
                  <span className="hidden sm:inline">Action</span>
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#5fb894]">
                  <CheckCircleIcon size={11} />
                  <span className="hidden sm:inline">Clear</span>
                </span>
              )}
            </div>

            <div className="mt-3 flex items-end justify-between gap-2">
              <div
                className={cn(
                  'vyro-metric text-[2rem] leading-none',
                  hasIssue ? (dark ? 'text-[#f08a78]' : 'text-rose') : dark ? 'text-paper' : 'text-ink',
                )}
              >
                {i.value}
              </div>
              <ArrowRightIcon
                size={14}
                className={cn(
                  'mb-0.5 shrink-0 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0',
                  dark ? 'text-volt' : 'text-copper',
                )}
                aria-hidden
              />
            </div>

            <div className={cn('mt-2 truncate text-[11px]', dark ? 'text-paper/40' : 'text-ink-4')}>{i.hint}</div>
          </Link>
        );
      })}
    </section>
  );
}
