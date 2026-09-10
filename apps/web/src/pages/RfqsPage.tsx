import { useState } from 'react';
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
  quoteCount?: number; lowestLandedCents?: number | null; expiringSoon?: boolean;
}

interface Dash {
  activeRfqs: number; totalRfqs: number; quotesReceived: number; awarded: number;
  expiringSoon: number; negotiationSavingsCents: number;
  avgQuotesPerRfq: number; avgMsToFirstQuote: number | null; avgMsToAward: number | null;
  rfqToPoConversion: number;
  recent: RfqRow[];
}

const GROUPS: Array<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: 'draft', label: 'Drafts', match: (s) => s === 'draft' },
  { key: 'open', label: 'Open · awaiting quotes', match: (s) => ['open', 'quoting'].includes(s) },
  { key: 'review', label: 'Quotes received · under review', match: (s) => ['quotes_received', 'under_review'].includes(s) },
  { key: 'awarded', label: 'Awarded · to order', match: (s) => ['awarded', 'converted_to_order'].includes(s) },
  { key: 'closed', label: 'Expired · cancelled · closed', match: (s) => ['expired', 'cancelled', 'closed'].includes(s) },
];

function fmtDur(ms: number | null): string {
  if (ms == null) return '—';
  const h = ms / 3600000;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function RfqsPage() {
  usePageTitle('Bulk Quotes');
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string }> })?.memberships?.[0]?.businessId;
  const [group, setGroup] = useState('open');
  const dash = useQuery({
    queryKey: ['rfq-dash', businessId],
    queryFn: () => api.get<Dash>(`/rfqs/dashboard/business?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const rows = dash.data?.recent ?? [];
  const shown = rows.filter((r) => (GROUPS.find((g) => g.key === group)?.match(r.status) ?? true));
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Procurement</div>
          <h1 className="mt-1 text-4xl font-bold">Request for Quotations</h1>
          <p className="mt-2 max-w-xl text-ink-3">Negotiated bulk pricing — compare suppliers on total landed cost, negotiate, award, and convert to a purchase order.</p>
        </div>
        <Link to="/rfqs/new"><Button>New RFQ</Button></Link>
      </div>

      {dash.data && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ['Active RFQs', String(dash.data.activeRfqs)],
            ['Quotes received', String(dash.data.quotesReceived)],
            ['Avg quotes / RFQ', dash.data.avgQuotesPerRfq.toFixed(1)],
            ['Negotiation savings', `Rs. ${(dash.data.negotiationSavingsCents / 100).toLocaleString()}`],
            ['Expiring soon', String(dash.data.expiringSoon)],
            ['Awarded', String(dash.data.awarded)],
            ['Time to first quote', fmtDur(dash.data.avgMsToFirstQuote)],
            ['RFQ → PO conversion', `${Math.round(dash.data.rfqToPoConversion * 100)}%`],
          ].map(([k, v]) => (
            <Surface key={k} className="p-4"><div className="text-xs uppercase tracking-widest text-ink-4">{k}</div><div className="mt-1 text-2xl font-bold">{v}</div></Surface>
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {GROUPS.map((g) => {
          const n = rows.filter((r) => g.match(r.status)).length;
          return <button key={g.key} onClick={() => setGroup(g.key)} className={`rounded-full border px-4 py-1.5 text-sm ${group === g.key ? 'bg-ink text-white border-ink' : 'border-line'}`}>{g.label} ({n})</button>;
        })}
      </div>

      <div className="mt-4">
        {dash.isLoading ? <div className="text-ink-4">Loading procurement…</div> : shown.length === 0 ? (
          <EmptyState title="Nothing here" description="Create a bulk quote request — e.g. Monthly restaurant supplies." action={<Link to="/rfqs/new"><Button>Request bulk quote</Button></Link>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {shown.map((r) => (
              <Link key={r.id} to={`/rfqs/${r.id}`} className="block">
                <Surface className="p-5 hover:border-ink transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-ink-4">{r.rfqNumber}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-2 text-xl font-semibold">{r.title}</div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-3">
                    <span>{r.quoteCount ?? 0} quotes</span>
                    {r.lowestLandedCents != null && <span className="font-mono">from Rs. {(r.lowestLandedCents / 100).toLocaleString()}</span>}
                    <span>{r.deadline ? `Due ${new Date(r.deadline).toLocaleDateString()}` : 'No deadline'}</span>
                    {r.expiringSoon && <span className="font-semibold text-amber">Expiring soon</span>}
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
  const tone = ['awarded', 'converted_to_order', 'accepted'].includes(status) ? 'bg-mint/10 text-mint border-mint/40'
    : ['cancelled', 'expired', 'closed', 'rejected', 'withdrawn'].includes(status) ? 'bg-paper text-ink-4 border-line'
    : ['negotiating'].includes(status) ? 'bg-copper/10 text-copper border-copper/40'
    : 'bg-amber/10 text-amber border-amber/40';
  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}
