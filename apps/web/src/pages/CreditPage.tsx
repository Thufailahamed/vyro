import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, EmptyState, ErrorBanner, PageHeader } from '@/components/ui';
import { formatLKR } from '@/lib/format';

export function CreditPage() {
  usePageTitle('VYRO Credit');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const facility = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<{ facility: { limitCents: number; usedCents: number; status: string; defaultTerms: string } | null; availableCents: number; eligible: boolean; reason: string | null; paidOrderCount: number; requiredPaidOrders: number; overdueCount: number }>(`/credit/facility?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const drawdowns = useQuery({
    queryKey: ['credit-drawdowns', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string; purchaseOrderId: string; amountCents: number; repaidCents: number; terms: string; dueAt: number; status: string }> }>(`/credit/drawdowns?businessId=${businessId}`),
    enabled: !!businessId,
  });
  if (!businessId) return <EmptyState title="No business workspace" description="Join or create a business to use VYRO Credit." />;
  if (facility.isLoading) return <div className="text-sm text-ink-4">Loading credit…</div>;
  if (facility.isError) return <ErrorBanner message="Could not load credit facility." />;
  const f = facility.data;
  if (!f?.facility) {
    return (
      <div className="max-w-3xl">
        <PageHeader title="VYRO Credit" sub="Net 14 / Net 30 terms for verified buyers." />
        <EmptyState title="Not eligible yet" description={`Complete ${f?.requiredPaidOrders ?? 3} paid orders to unlock credit. Progress: ${f?.paidOrderCount ?? 0}/${f?.requiredPaidOrders ?? 3}.`} />
        <Link to="/search"><Button>Browse catalog</Button></Link>
      </div>
    );
  }
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="VYRO Credit" sub={`Limit ${formatLKR(f.facility.limitCents)} · Available ${formatLKR(f.availableCents)}`} />
      {f.overdueCount > 0 && <ErrorBanner message={`${f.overdueCount} drawdown(s) overdue. Repay to unlock new credit draws.`} />}
      {f.facility.status !== 'active' && <ErrorBanner message={`Facility ${f.facility.status}. Contact support.`} />}
      {drawdowns.data?.items.map((d) => (
        <div key={d.id} className="border border-ink/15 p-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">{d.terms === 'net14' ? 'Net 14' : 'Net 30'} · {d.status}</div>
            <div className="text-xs text-ink-4">Due {new Date(d.dueAt).toLocaleDateString()} · Remaining {formatLKR(d.amountCents - d.repaidCents)}</div>
          </div>
          <Link to={`/orders/${d.purchaseOrderId}`} className="text-xs underline">View PO</Link>
        </div>
      ))}
    </div>
  );
}
