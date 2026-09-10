import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CreditCardIcon,
  BanknoteIcon,
  TruckIcon,
  ScaleIcon,
} from '@/components/icons';

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

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-white border border-ink/10 rounded-xl p-4" />
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
      icon: <CreditCardIcon size={16} />,
      healthyLabel: 'Payment flows normal',
      alertLabel: 'Requires clearance',
    },
    {
      label: 'Payout Failures',
      value: n.payoutFailures,
      to: '/admin/finance?tab=payouts',
      icon: <BanknoteIcon size={16} />,
      healthyLabel: 'Settlements cleared',
      alertLabel: 'Batches need review',
    },
    {
      label: 'SLA Breaches',
      value: n.slaBreaches,
      to: '/admin/deliveries',
      icon: <TruckIcon size={16} />,
      healthyLabel: 'Logistics on schedule',
      alertLabel: 'Deliveries delayed',
    },
    {
      label: 'Open Disputes',
      value: n.openDisputes,
      to: '/admin/disputed',
      icon: <ScaleIcon size={16} />,
      healthyLabel: 'Zero open claims',
      alertLabel: 'Active arbitration',
    },
  ];

  return (
    <section aria-label="Operational Health & Alert Triage" className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-ink-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Operations Health & Alert Triage</span>
        </div>
        <span className="text-[11px] font-mono text-ink-4">Auto-syncs every 60s</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((i) => {
          const hasAlert = i.value > 0;
          return (
            <Link
              key={i.label}
              to={i.to}
              className={`p-4 rounded-xl border transition-all duration-150 flex flex-col justify-between group shadow-xs ${
                hasAlert
                  ? 'bg-rose-50/50 border-rose-200 hover:border-rose-400 hover:shadow-sm'
                  : 'bg-white border-ink/10 hover:border-ink/25 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      hasAlert
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-ink-3 group-hover:bg-emerald-50 group-hover:text-emerald-700'
                    }`}
                  >
                    {i.icon}
                  </div>
                  <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-ink-4 group-hover:text-ink transition-colors">
                    {i.label}
                  </span>
                </div>

                {hasAlert ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-rose-100 text-rose-700">
                    <AlertCircleIcon size={10} />
                    Alert
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-emerald-700 bg-emerald-50">
                    <CheckCircle2Icon size={10} />
                    Clear
                  </span>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-2xl font-bold font-mono tracking-tight ${
                      hasAlert ? 'text-rose-600' : 'text-ink'
                    }`}
                  >
                    {i.value}
                  </span>
                  <span className="text-[11px] text-ink-4 font-normal">
                    {hasAlert ? 'incident(s)' : 'detected'}
                  </span>
                </div>
                <div className={`text-[11px] mt-0.5 truncate ${hasAlert ? 'text-rose-600 font-medium' : 'text-ink-4'}`}>
                  {hasAlert ? i.alertLabel : i.healthyLabel}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
