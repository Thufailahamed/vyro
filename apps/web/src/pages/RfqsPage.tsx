import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, EmptyState } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';

interface RfqRow {
  id: string; rfqNumber: string; title: string; status: string;
  deadline: number | null; createdAt: number; awardedQuoteId: string | null;
}

export function RfqsPage() {
  usePageTitle('Bulk Quotes');
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string }> })?.memberships?.[0]?.businessId;
  const { data, isLoading } = useQuery({
    queryKey: ['rfqs', businessId],
    queryFn: () => api.get<{ rfqs: RfqRow[] }>(`/rfqs?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const dash = useQuery({
    queryKey: ['rfq-dash', businessId],
    queryFn: () => api.get<{ activeRfqs: number; quotesReceived: number; expiringSoon: number; negotiationSavingsCents: number; awarded: number }>(`/rfqs/dashboard/business?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const rows = data?.rfqs ?? [];
  const active = rows.filter((r) => ['open', 'quoting', 'quotes_received', 'under_review'].includes(r.status));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Procurement</div>
          <h1 className="mt-1 text-4xl font-bold">Request for Quotations</h1>
          <p className="mt-2 text-ink-3">Negotiated bulk pricing — compare suppliers, negotiate, award, and convert to a purchase order.</p>
        </div>
        <Link to="/rfqs/new"><Button>New RFQ</Button></Link>
      </div>

      {dash.data && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {[
            ['Active RFQs', dash.data.activeRfqs],
            ['Quotes received', dash.data.quotesReceived],
            ['Expiring soon', dash.data.expiringSoon],
            ['Awarded', dash.data.awarded],
            ['Negotiation savings', `Rs. ${((dash.data.negotiationSavingsCents ?? 0) / 100).toLocaleString()}`],
          ].map(([k, v]) => (
            <Surface key={k} className="p-4"><div className="text-xs uppercase tracking-widest text-ink-4">{k}</div><div className="mt-1 text-2xl font-bold">{v}</div></Surface>
          ))}
        </div>
      )}

      <div className="mt-8">
        {isLoading ? <div className="text-ink-4">Loading…</div> : rows.length === 0 ? (
          <EmptyState title="No RFQs yet" description="Create your first bulk quote request — e.g. Monthly restaurant supplies." action={<Link to="/rfqs/new"><Button>Request bulk quote</Button></Link>} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {active.concat(rows.filter((r) => !active.includes(r))).map((r) => (
              <Link key={r.id} to={`/rfqs/${r.id}`} className="block">
                <Surface className="p-5 hover:border-ink transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-ink-4">{r.rfqNumber}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-2 text-xl font-semibold">{r.title}</div>
                  <div className="mt-1 text-sm text-ink-3">
                    {r.deadline ? `Quotes due ${new Date(r.deadline).toLocaleDateString()}` : 'No deadline'}
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

export function StatusPill({ status }: { status: string }) {
  const tone = ['awarded', 'converted_to_order'].includes(status) ? 'bg-mint/10 text-mint border-mint/40'
    : ['cancelled', 'expired', 'closed'].includes(status) ? 'bg-paper text-ink-4 border-line'
    : 'bg-amber/10 text-amber border-amber/40';
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}
