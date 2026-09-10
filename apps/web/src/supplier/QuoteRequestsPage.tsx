import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useSupplierId } from './useSupplierId';
import { Button, EmptyState } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { StatusPill } from '@/pages/RfqsPage';

export function QuoteRequestsPage() {
  usePageTitle('Quote requests');
  const supplierId = useSupplierId();
  const [filter, setFilter] = useState<'all' | 'new' | 'responded' | 'expiring' | 'expired' | 'won' | 'lost'>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-rfqs', supplierId],
    queryFn: () => api.get<{ rfqs: Array<{ rfq: { id: string; rfqNumber: string; title: string; status: string; deadline: number | null; deliveryLocation?: string; requiredDeliveryDate?: number }; itemCount: number; myQuotes: number; myStatus: string | null; inviteStatus: string | null; expiringSoon: boolean }> }>(`/rfqs/supplier/list?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });
  const rows = (data?.rfqs ?? []).filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'new') return (r.inviteStatus === 'invited' || r.inviteStatus === 'viewed' || r.inviteStatus === 'open') && r.myQuotes === 0;
    if (filter === 'responded') return r.myQuotes > 0 && !['accepted', 'rejected'].includes(r.myStatus ?? '');
    if (filter === 'expiring') return r.expiringSoon;
    if (filter === 'expired') return r.rfq.status === 'expired' || r.myStatus === 'expired';
    if (filter === 'won') return r.myStatus === 'accepted';
    if (filter === 'lost') return r.myStatus === 'rejected';
    return true;
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Supplier</div>
      <h1 className="mt-1 text-3xl font-bold">Quote requests</h1>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'new', 'responded', 'expiring', 'expired', 'won', 'lost'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`min-h-[44px] rounded-full border px-3 py-1 text-sm ${filter === f ? 'bg-ink text-white border-ink' : 'border-line'}`}>{f}</button>
        ))}
      </div>
      <div className="mt-6">
        {isLoading ? 'Loading…' : rows.length === 0 ? <EmptyState title="No quote requests" description="Invited and open RFQs will appear here." /> : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {rows.map((r) => (
              <Link key={r.rfq.id} to={`/supplier/quotes/${r.rfq.id}`}>
                <Surface className="p-5 hover:border-ink transition-colors">
                  <div className="flex justify-between"><span className="font-mono text-xs text-ink-4">{r.rfq.rfqNumber}</span><StatusPill status={r.myStatus ?? r.rfq.status} /></div>
                  <div className="mt-1 text-lg font-semibold">{r.rfq.title}</div>
                  <div className="text-sm text-ink-3">{r.itemCount} items · {r.rfq.deadline ? `due ${new Date(r.rfq.deadline).toLocaleDateString()}` : 'no deadline'}{r.expiringSoon ? ' · expiring soon' : ''}</div>
                </Surface>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function useRfqSupplierDashboard() {
  const supplierId = useSupplierId();
  return useQuery({
    queryKey: ['supplier-rfq-dash', supplierId],
    queryFn: () => api.get(`/rfqs/dashboard/supplier?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });
}

export function SupplierRfqStats() {
  const { data } = useRfqSupplierDashboard() as { data?: { rfqsReceived: number; quotesSubmitted: number; won: number; winRate: number; responseRate: number } };
  const qc = useQueryClient();
  void qc;
  if (!data) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {[['RFQs received', data.rfqsReceived], ['Quotes submitted', data.quotesSubmitted], ['Won', data.won], ['Win rate', `${Math.round(data.winRate * 100)}%`], ['Response rate', `${Math.round(data.responseRate * 100)}%`]].map(([k, v]) => (
        <Surface key={k} className="p-4"><div className="text-xs uppercase tracking-widest text-ink-4">{k}</div><div className="mt-1 text-2xl font-bold">{v}</div></Surface>
      ))}
    </div>
  );
}
