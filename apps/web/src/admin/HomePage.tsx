import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';

type AdminAnalytics = {
  range: '7d' | '30d' | '90d';
  metrics: {
    gmvCents: number;
    takeRateCents: number;
    activeBuyers: number;
    activeSuppliers: number;
    newSignups: number;
    disputeRate: number;
    completionRate: number;
  };
};

export function AdminHomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api.get<AdminAnalytics>('/analytics/admin?range=30d'),
    retry: false,
    refetchInterval: 60_000,
  });

  const m = data?.metrics;
  const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
  const fmtCents = (x: number) => `₨ ${(x / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const tiles = [
    { to: '/admin/businesses', label: 'Active buyers', value: m ? m.activeBuyers : '—' },
    { to: '/admin/suppliers', label: 'Active suppliers', value: m ? m.activeSuppliers : '—' },
    { to: '/admin/audit', label: 'New signups', value: m ? m.newSignups : '—' },
    { to: '/admin/disputed', label: 'Dispute rate', value: m ? fmtPct(m.disputeRate) : '—' },
  ];

  const flowState = (label: string, key: 'done' | 'active' | 'idle'): { label: string; state: 'done' | 'active' | 'idle' } => ({ label, state: key });
  const completionPct = m ? m.completionRate : 0;
  const disputePct = m ? m.disputeRate : 0;
  const flowNodes = [
    flowState('GMV', m ? 'done' : 'idle'),
    flowState('Buyers', m ? 'done' : 'idle'),
    flowState('Suppliers', m ? 'done' : 'idle'),
    flowState(`Completion ${fmtPct(completionPct)}`, m && completionPct >= 0.5 ? 'done' : m ? 'active' : 'idle'),
    flowState(`Disputes ${fmtPct(disputePct)}`, m && disputePct > 0.1 ? 'active' : 'done'),
  ];

  return (
    <div className="space-y-8">
      <header className="bg-ink text-paper p-8">
        <PageHeader
          kicker={<span className="text-volt">Operations</span>}
          title={<span className="text-paper">VYRO CONTROL</span>}
          sub={<span className="text-paper/60">Platform activity across businesses, suppliers, orders and disputes — last {data?.range ?? '30d'}.</span>}
        />
      </header>

      <Surface kind="ink" className="p-6">
        <FlowLine tone="paper" nodes={flowNodes} />
      </Surface>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-paper p-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ink/10">
          {tiles.map((t) => (
            <Link key={t.to} to={t.to} className="bg-paper p-6 hover:bg-ink hover:text-paper transition-colors group">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4 group-hover:text-volt">{t.label}</div>
              <MetricNumber size="md" className="mt-2">
                {t.value}
              </MetricNumber>
            </Link>
          ))}
        </div>
      )}

      {m && (
        <Surface kind="elevated" className="p-6">
          <h3 className="vyro-display text-sm mb-4">Platform economics</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">GMV</div>
              <MetricNumber size="md" className="mt-1">{fmtCents(m.gmvCents)}</MetricNumber>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Platform take</div>
              <MetricNumber size="md" className="mt-1">{fmtCents(m.takeRateCents)}</MetricNumber>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Completion</div>
              <MetricNumber size="md" className="mt-1">{fmtPct(m.completionRate)}</MetricNumber>
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}
