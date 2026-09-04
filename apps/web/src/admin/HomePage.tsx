import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';

export function AdminHomePage() {
  const { data: suppliers } = useQuery({
    queryKey: ['admin-suppliers'],
    queryFn: () => api.get<{ suppliers: unknown[] }>('/admin/suppliers'),
    retry: false,
  });
  const { data: businesses } = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: () => api.get<{ businesses: unknown[] }>('/admin/businesses'),
    retry: false,
  });
  const { data: disputed } = useQuery({
    queryKey: ['admin-disputed'],
    queryFn: () => api.get<{ orders: unknown[] }>('/admin/disputed'),
    retry: false,
  });
  const { data: audit } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<{ logs: unknown[] }>('/admin/audit?limit=50'),
    retry: false,
  });

  const tiles = [
    { to: '/admin/suppliers', label: 'Suppliers', value: suppliers?.suppliers?.length ?? '—' },
    { to: '/admin/businesses', label: 'Businesses', value: businesses?.businesses?.length ?? '—' },
    { to: '/admin/disputed', label: 'Disputes', value: disputed?.orders?.length ?? '—' },
    { to: '/admin/audit', label: 'Audit events', value: audit?.logs?.length ?? '—' },
  ];

  return (
    <div className="space-y-8">
      <header className="bg-ink text-paper p-8">
        <PageHeader
          kicker={<span className="text-volt">Operations</span>}
          title={<span className="text-paper">VYRO CONTROL</span>}
          sub={<span className="text-paper/60">Platform activity across businesses, suppliers, orders and disputes.</span>}
        />
      </header>

      <Surface kind="ink" className="p-6">
        <FlowLine
          tone="paper"
          nodes={[
            { label: 'Businesses', state: 'done' },
            { label: 'Suppliers', state: 'active' },
            { label: 'Orders', state: 'idle' },
            { label: 'Payments', state: 'idle' },
            { label: 'Health', state: 'idle' },
          ]}
        />
      </Surface>

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
    </div>
  );
}
