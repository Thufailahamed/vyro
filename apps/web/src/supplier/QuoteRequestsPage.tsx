import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useSupplierId } from './useSupplierId';
import { LearningCta } from './learning/LearningCta';
import { EmptyState } from '@/components/ui';
import { MetricNumber, Surface } from '@/components/brand/Surface';
import { SupplierHero, HeroStatusPill } from './SupplierHero';
import { StatusPill } from '@/pages/RfqsPage';
import { FileTextIcon, ClockIcon, MapPinIcon, ArrowRightIcon, PackageIcon } from '@/components/icons';

export function QuoteRequestsPage() {
  usePageTitle('Quote requests');
  const supplierId = useSupplierId();
  const [filter, setFilter] = useState<'all' | 'new' | 'viewed' | 'in_progress' | 'submitted' | 'expiring' | 'expired' | 'awarded' | 'not_selected'>('all');
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-rfqs', supplierId],
    queryFn: () => api.get<{ rfqs: Array<{ rfq: { id: string; rfqNumber: string; title: string; status: string; deadline: number | null; deliveryLocation?: string; requiredDeliveryDate?: number }; itemCount: number; myQuotes: number; myStatus: string | null; inviteStatus: string | null; expiringSoon: boolean }> }>(`/rfqs/supplier/list?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });
  const rows = (data?.rfqs ?? []).filter((r) => {
    const openIsh = ['open', 'quoting', 'quotes_received', 'under_review'].includes(r.rfq.status);
    if (filter === 'all') return true;
    if (filter === 'new') return r.inviteStatus === 'invited' && r.myQuotes === 0;
    if (filter === 'viewed') return r.inviteStatus === 'viewed' && r.myQuotes === 0;
    if (filter === 'in_progress') return r.myQuotes > 0 && openIsh && !['accepted', 'rejected'].includes(r.myStatus ?? '');
    if (filter === 'submitted') return r.myQuotes > 0;
    if (filter === 'expiring') return r.expiringSoon;
    if (filter === 'expired') return r.rfq.status === 'expired' || r.myStatus === 'expired';
    if (filter === 'awarded') return r.myStatus === 'accepted';
    if (filter === 'not_selected') return r.myStatus === 'rejected';
    return true;
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <SupplierHero
        icon={FileTextIcon}
        kicker="Supplier / Sourcing Desk"
        title="Quote Requests"
        description="Invited and open RFQs from commercial buyers — review requirements and submit mill-gate quotes."
        status={
          data && data.rfqs.length > 0 ? (
            <HeroStatusPill label="Inbound RFQs" tone="mint" />
          ) : (
            <HeroStatusPill label="Sourcing Desk" tone="paper" />
          )
        }
        footer={
          <>
            <span>Quotes convert to purchase orders on buyer acceptance</span>
            <span className="text-paper/40">
              {rows.length} of {data?.rfqs.length ?? 0} requests shown
            </span>
          </>
        }
      />
      <LearningCta variant="inline" />
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-ink/[0.05] rounded-full max-w-full overflow-x-auto scrollbar-none">
        {(['all', 'new', 'viewed', 'in_progress', 'submitted', 'expiring', 'expired', 'awarded', 'not_selected'] as const).map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                active ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:text-ink'
              }`}
            >
              {f.replace(/_/g, ' ')}
            </button>
          );
        })}
      </div>
      <div>
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="vyro-surface p-5 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="h-3 w-24 rounded bg-ink/[0.07]" />
                  <div className="h-5 w-16 rounded-full bg-ink/[0.07]" />
                </div>
                <div className="h-5 w-3/4 rounded bg-ink/[0.07]" />
                <div className="h-3 w-1/2 rounded bg-ink/[0.07]" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FileTextIcon size={20} />}
            title="No quote requests"
            description={filter === 'all' ? 'Invited and open RFQs will appear here.' : `No requests under "${filter.replace(/_/g, ' ')}".`}
            action={filter !== 'all' ? (
              <button type="button" onClick={() => setFilter('all')} className="text-xs font-semibold text-copper hover:underline">
                View all requests
              </button>
            ) : undefined}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <Link key={r.rfq.id} to={`/supplier/quotes/${r.rfq.id}`}>
                <Surface className="p-5 h-full hover:border-ink/30 hover:shadow-md transition-all group space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-9 rounded-lg bg-volt/15 text-volt-deep flex items-center justify-center shrink-0">
                        <PackageIcon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] text-ink-4">{r.rfq.rfqNumber}</div>
                        <div className="text-base font-semibold text-ink leading-snug truncate">{r.rfq.title}</div>
                      </div>
                    </div>
                    <StatusPill status={r.myStatus ?? r.rfq.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                    <span className="inline-flex items-center gap-1 font-mono">
                      <FileTextIcon size={11} className="text-ink-4" />
                      {r.itemCount} item{r.itemCount === 1 ? '' : 's'}
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      <ClockIcon size={11} className="text-ink-4" />
                      {r.rfq.deadline ? `due ${new Date(r.rfq.deadline).toLocaleDateString()}` : 'no deadline'}
                    </span>
                    {r.rfq.deliveryLocation && (
                      <span className="inline-flex items-center gap-1 font-mono">
                        <MapPinIcon size={11} className="text-ink-4" />
                        {r.rfq.deliveryLocation}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    {r.expiringSoon ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber/15 text-amber text-[10px] font-mono font-bold uppercase tracking-wider">
                        <span className="size-1.5 rounded-full bg-amber animate-pulse" />
                        Expiring soon
                      </span>
                    ) : (
                      <span />
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-copper group-hover:gap-1.5 transition-all">
                      Review & quote
                      <ArrowRightIcon size={12} />
                    </span>
                  </div>
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
        <Surface key={k} className="p-4"><div className="text-xs uppercase tracking-widest text-ink-4">{k}</div><div className="mt-1 text-2xl font-bold"><MetricNumber size="md">{v}</MetricNumber></div></Surface>
      ))}
    </div>
  );
}
