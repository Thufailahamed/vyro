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
            className={cn('h-[104px] rounded-xl animate-pulse', dark ? 'bg-paper/[0.06]' : 'bg-mist/60')}
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
              'group relative flex flex-col justify-between rounded-xl p-4 transition-colors duration-200',
              dark
                ? hasIssue
                  ? 'bg-rose/[0.14] shadow-[inset_0_0_0_1px_rgba(196,90,74,0.45)] hover:bg-rose/20'
                  : 'bg-paper/[0.04] shadow-[inset_0_0_0_1px_rgba(250,247,240,0.08)] hover:bg-paper/[0.08]'
                : hasIssue
                  ? 'bg-rose/5 shadow-[inset_0_0_0_1px_rgba(196,90,74,0.35)] hover:bg-rose/10'
                  : 'bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.3)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={cn('text-xs font-medium truncate', dark ? 'text-paper/70' : 'text-ink-3')}>
                {i.label}
              </span>
              {hasIssue ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose/20 px-2 py-0.5 text-[10px] font-semibold text-rose">
                  <AlertCircleIcon size={11} />
                  Action
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-mint">
                  <CheckCircleIcon size={11} />
                  Clear
                </span>
              )}
            </div>

            <div className="mt-3 flex items-end justify-between gap-2">
              <div
                className={cn(
                  'vyro-metric text-3xl leading-none',
                  hasIssue ? 'text-rose' : dark ? 'text-paper' : 'text-ink',
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

            <div className={cn('mt-1.5 text-[11px] truncate', dark ? 'text-paper/40' : 'text-ink-4')}>{i.hint}</div>
          </Link>
        );
      })}
    </section>
  );
}
