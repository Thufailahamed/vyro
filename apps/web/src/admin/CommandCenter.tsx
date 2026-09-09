import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type CommandCenterData = {
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

export function CommandCenter() {
  const { data, isLoading, isError } = useCommandCenter();
  if (isLoading) return <p className="text-xs text-paper/60">Loading live ops…</p>;
  if (isError || !data) return null;
  const n = data.needsAction;
  const items = [
    { label: 'Stuck payments', value: n.stuckPayments, to: '/admin/finance?tab=refunds' },
    { label: 'Payout failures', value: n.payoutFailures, to: '/admin/finance?tab=payouts' },
    { label: 'SLA breaches', value: n.slaBreaches, to: '/admin/deliveries' },
    { label: 'Open disputes', value: n.openDisputes, to: '/admin/disputed' },
  ];
  return (
    <section aria-label="Needs action" className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((i) => (
        <Link
          key={i.label}
          to={i.to}
          className={`p-3 border ${i.value > 0 ? 'border-rose/50 bg-rose/5' : 'border-paper/10 bg-paper/5'}`}
        >
          <div className={`text-2xl font-bold font-mono ${i.value > 0 ? 'text-rose' : 'text-paper'}`}>{i.value}</div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-paper/60">{i.label}</div>
        </Link>
      ))}
    </section>
  );
}
