import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Button,
  EmptyState,
  PageHeader,
} from '@/components/ui';
import { useToast } from '@vyro/ui';
import {
  FileTextIcon,
  SearchIcon,
  PlusIcon,
  ScaleIcon,
  CheckCircle2Icon,
  ClockIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  SparklesIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  UsersIcon,
  BanknoteIcon,
  CalendarIcon,
  PackageIcon,
} from '@/components/icons';
import { formatLKR, formatCompactLKR } from '@/lib/format';

interface RfqRow {
  id: string;
  rfqNumber: string;
  title: string;
  status: string;
  deadline: number | null;
  createdAt: number;
  awardedQuoteId: string | null;
  quoteCount?: number;
  lowestLandedCents?: number | null;
  expiringSoon?: boolean;
  itemCount?: number;
  totalQty?: number;
  description?: string | null;
  isOpen?: boolean;
}

interface Dash {
  activeRfqs: number;
  totalRfqs: number;
  quotesReceived: number;
  awarded: number;
  expiringSoon: number;
  negotiationSavingsCents: number;
  avgQuotesPerRfq: number;
  avgMsToFirstQuote: number | null;
  avgMsToAward: number | null;
  rfqToPoConversion: number;
  recent: RfqRow[];
}

const GROUPS: Array<{ key: string; label: string; hint: string; match: (s: string) => boolean; icon: React.ReactNode; tone: 'volt' | 'amber' | 'copper' | 'mint' | 'ink' }> = [
  {
    key: 'draft',
    label: 'Drafts',
    hint: 'Work in progress',
    match: (s) => s === 'draft',
    icon: <FileTextIcon size={12} />,
    tone: 'ink',
  },
  {
    key: 'open',
    label: 'Open · awaiting quotes',
    hint: 'Published, no quotes yet',
    match: (s) => ['open', 'quoting'].includes(s),
    icon: <ClockIcon size={12} />,
    tone: 'amber',
  },
  {
    key: 'review',
    label: 'Quotes received · under review',
    hint: 'Negotiate & compare',
    match: (s) => ['quotes_received', 'under_review'].includes(s),
    icon: <ScaleIcon size={12} />,
    tone: 'copper',
  },
  {
    key: 'awarded',
    label: 'Awarded · to order',
    hint: 'Convert to purchase order',
    match: (s) => ['awarded', 'converted_to_order'].includes(s),
    icon: <CheckCircle2Icon size={12} />,
    tone: 'mint',
  },
  {
    key: 'closed',
    label: 'Expired · cancelled · closed',
    hint: 'No longer active',
    match: (s) => ['expired', 'cancelled', 'closed'].includes(s),
    icon: <AlertTriangleIcon size={12} />,
    tone: 'ink',
  },
];

function fmtDur(ms: number | null): string {
  if (ms == null) return '—';
  const h = ms / 3600000;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function fmtRelative(t: number | null | undefined): string {
  if (!t) return '—';
  const d = new Date(t);
  const now = Date.now();
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'just now';
  if (abs < 3_600_000) {
    const m = Math.round(diff / 60_000);
    return diff > 0 ? `in ${m}m` : `${m}m ago`;
  }
  if (abs < 86_400_000) {
    const h = Math.round(diff / 3_600_000);
    return diff > 0 ? `in ${h}h` : `${h}h ago`;
  }
  if (abs < 7 * 86_400_000) {
    const days = Math.round(diff / 86_400_000);
    return diff > 0 ? `in ${days}d` : `${days}d ago`;
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function deadlineTone(deadline: number | null): { label: string; tone: 'mint' | 'amber' | 'rose' | 'ink' } {
  if (!deadline) return { label: 'No deadline', tone: 'ink' };
  const diff = deadline - Date.now();
  if (diff < 0) return { label: 'Expired', tone: 'rose' };
  if (diff < 24 * 3600_000) return { label: 'Due <24h', tone: 'rose' };
  if (diff < 3 * 24 * 3600_000) return { label: 'Due in <3d', tone: 'amber' };
  return { label: 'Active', tone: 'mint' };
}

export function RfqsPage() {
  usePageTitle('Bulk Quotes');
  const toast = useToast();
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string; businessName?: string }> })?.memberships?.[0]?.businessId;
  const businessName = (user as { memberships?: Array<{ businessId: string; businessName?: string }> })?.memberships?.[0]?.businessName;
  const [group, setGroup] = useState('open');
  const [search, setSearch] = useState('');

  const dash = useQuery({
    queryKey: ['rfq-dash', businessId],
    queryFn: () => api.get<Dash>(`/rfqs/dashboard/business?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const rows = dash.data?.recent ?? [];
  const shown = useMemo(() => {
    const g = GROUPS.find((x) => x.key === group);
    let list = g ? rows.filter((r) => g.match(r.status)) : rows;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.rfqNumber.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, group, search]);

  const negSavings = dash.data?.negotiationSavingsCents ?? 0;

  if (!user) {
    return (
      <div className="py-16 text-center space-y-4 max-w-lg mx-auto">
        <div className="size-12 bg-ink text-volt mx-auto flex items-center justify-center">
          <FileTextIcon size={24} />
        </div>
        <h2 className="vyro-display text-3xl text-ink">Sign in to manage bulk quotes</h2>
        <p className="text-sm text-ink-3">
          Sign in to issue RFQs, compare negotiated supplier quotes, and convert awarded bids into legally-binding purchase orders.
        </p>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in to Workspace</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Bulk Procurement</span>
            {businessName && (
              <>
                <span className="text-ink-4">/</span>
                <span className="text-[11px] font-mono text-ink-3">{businessName}</span>
              </>
            )}
            {dash.data && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
                <span className="size-1.5 rounded-full bg-volt-deep animate-pulse" />
                Negotiation Engine Active
              </span>
            )}
          </div>
        }
        title="Request for Quotations"
        sub="Negotiated bulk pricing — compare suppliers on total landed cost, send counter-offers, award, and convert to a purchase order."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link to="/rfqs/new">
              <Button className="bg-ink text-paper hover:bg-charcoal px-5 py-2.5 text-xs uppercase tracking-wider font-bold">
                <PlusIcon size={14} />
                <span>New RFQ</span>
              </Button>
            </Link>
            <Link to="/ask">
              <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold bg-paper">
                <SparklesIcon size={14} className="text-copper" />
                <span>Ask AI</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Metric Tiles */}
      {dash.data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="Active RFQs"
            value={String(dash.data.activeRfqs)}
            sub="Awaiting quotes or under review"
            accent="volt"
            icon={<FileTextIcon size={18} />}
          />
          <MetricTile
            label="Quotes received"
            value={String(dash.data.quotesReceived)}
            sub={`${dash.data.avgQuotesPerRfq.toFixed(1)} avg / RFQ`}
            accent="ink"
            icon={<ScaleIcon size={18} />}
          />
          <MetricTile
            label="Negotiation savings"
            value={formatCompactLKR(negSavings)}
            sub="vs. starting supplier prices"
            accent="mint"
            icon={<BanknoteIcon size={18} />}
          />
          <MetricTile
            label="RFQ → PO conversion"
            value={`${Math.round(dash.data.rfqToPoConversion * 100)}%`}
            sub={`Time to award: ${fmtDur(dash.data.avgMsToAward)}`}
            accent="copper"
            icon={<TrendingUpIcon size={18} />}
          />
        </div>
      )}

      {/* Secondary metric strip */}
      {dash.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniMetric
            icon={<AlertTriangleIcon size={12} className="text-amber" />}
            label="Expiring soon"
            value={String(dash.data.expiringSoon)}
          />
          <MiniMetric
            icon={<CheckCircle2Icon size={12} className="text-mint" />}
            label="Awarded"
            value={String(dash.data.awarded)}
          />
          <MiniMetric
            icon={<ClockIcon size={12} className="text-copper" />}
            label="Time to first quote"
            value={fmtDur(dash.data.avgMsToFirstQuote)}
          />
          <MiniMetric
            icon={<UsersIcon size={12} className="text-volt-deep" />}
            label="Total RFQs"
            value={String(dash.data.totalRfqs)}
          />
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {GROUPS.map((g) => {
            const n = rows.filter((r) => g.match(r.status)).length;
            const active = group === g.key;
            return (
              <button
                key={g.key}
                onClick={() => setGroup(g.key)}
                className={`h-8 px-3 text-xs font-mono tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-ink text-volt font-bold shadow-sm'
                    : 'bg-paper text-ink-3 border border-ink/15 hover:border-ink hover:text-ink'
                }`}
              >
                {g.icon}
                <span>{g.label}</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded ${
                    active ? 'bg-volt/20 text-volt' : 'bg-mist text-ink-4'
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>

        {rows.length > 0 && (
          <div className="relative min-w-[240px]">
            <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="text"
              placeholder="Search RFQ title or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-paper border border-ink/15 text-xs text-ink placeholder:text-ink-4 outline-none focus:border-ink"
            />
          </div>
        )}
      </div>

      {/* Content */}
      {dash.isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileTextIcon size={22} />}
          title="No RFQs yet"
          description="Create a bulk quote request — e.g. monthly restaurant supplies — and suppliers will send negotiated quotes you can compare and award."
          action={
            <Link to="/rfqs/new">
              <Button className="bg-ink text-paper hover:bg-charcoal px-5 py-2.5 text-xs uppercase tracking-wider font-bold">
                <PlusIcon size={14} /> Create your first RFQ
              </Button>
            </Link>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={22} />}
          title="No RFQs match this filter"
          description={`No requests in the "${GROUPS.find((g) => g.key === group)?.label}" group${search ? ` matching "${search}"` : ''}.`}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setGroup('open');
                setSearch('');
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {shown.map((r) => (
            <RfqCard
              key={r.id}
              rfq={r}
              onCopy={(id) => {
                navigator.clipboard?.writeText(id).catch(() => {});
                toast.show(toast.info('RFQ ID copied'));
              }}
            />
          ))}
        </div>
      )}

      {/* Helpful footer */}
      {rows.length > 0 && (
        <div className="mt-8 p-5 bg-paper border border-ink/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="size-9 rounded-lg bg-copper/10 text-copper flex items-center justify-center shrink-0">
              <ShieldCheckIcon size={18} />
            </div>
            <div>
              <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
                Negotiation tips
              </div>
              <p className="text-xs text-ink-3 mt-0.5 max-w-xl">
                Award quotes to convert them into purchase orders. Counter-offers create a new version — suppliers respond to your best price, not the original ask.
              </p>
            </div>
          </div>
          <Link to="/ask" className="shrink-0">
            <Button variant="secondary" size="sm" className="text-xs uppercase tracking-wider font-semibold">
              <SparklesIcon size={14} className="text-copper" /> Ask AI to compare
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ---------- Local helpers ---------- */

function MetricTile({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  accent: 'mint' | 'amber' | 'rose' | 'volt' | 'ink' | 'copper';
  icon: React.ReactNode;
}) {
  const accentClass = {
    mint: 'text-mint',
    amber: 'text-amber',
    rose: 'text-rose',
    volt: 'text-volt-deep',
    ink: 'text-ink',
    copper: 'text-copper-deep',
  }[accent];

  return (
    <div className="p-4 bg-paper border border-ink/15 shadow-sm space-y-2 hover:border-ink/30 transition-colors">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-bold">
          {label}
        </div>
        <div className="size-6 bg-bone text-ink-2 flex items-center justify-center">{icon}</div>
      </div>
      <div className={`vyro-metric text-3xl font-bold ${accentClass}`}>{value}</div>
      <div className="text-[10px] text-ink-4">{sub}</div>
    </div>
  );
}

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 bg-paper border border-ink/10">
      <div className="size-7 bg-bone text-ink-2 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 truncate">
          {label}
        </div>
        <div className="text-sm font-bold font-mono text-ink-1 truncate">{value}</div>
      </div>
    </div>
  );
}

function RfqCard({ rfq, onCopy }: { rfq: RfqRow; onCopy: (id: string) => void }) {
  const dt = deadlineTone(rfq.deadline);
  const dtDot =
    dt.tone === 'rose'
      ? 'bg-rose animate-pulse'
      : dt.tone === 'amber'
      ? 'bg-amber'
      : dt.tone === 'mint'
      ? 'bg-mint'
      : 'bg-ink-4';

  return (
    <Link
      to={`/rfqs/${rfq.id}`}
      className="block group bg-paper border border-ink/15 hover:border-ink transition-all shadow-sm"
    >
      <div className="flex flex-col sm:flex-row">
        {/* Left accent rail */}
        <div className="w-full sm:w-1.5 h-1.5 sm:h-auto bg-gradient-to-r sm:bg-gradient-to-b from-volt/40 to-copper/30 group-hover:from-volt group-hover:to-copper transition-colors" />

        <div className="flex-1 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] uppercase tracking-wider text-copper font-bold">
                  {rfq.rfqNumber}
                </span>
                <StatusPill status={rfq.status} />
                {rfq.isOpen && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider bg-volt/15 text-ink-1 border border-volt/30 px-1.5 py-0.5">
                    <UsersIcon size={9} /> Open
                  </span>
                )}
                {rfq.expiringSoon && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider bg-amber/15 text-amber border border-amber/30 px-1.5 py-0.5 font-bold">
                    <AlertTriangleIcon size={9} /> Expiring soon
                  </span>
                )}
              </div>

              <h3 className="mt-1.5 font-display text-lg sm:text-xl font-bold text-ink-1 leading-snug group-hover:text-copper transition-colors">
                {rfq.title}
              </h3>

              {rfq.description && (
                <p className="mt-1 text-xs text-ink-3 line-clamp-1 max-w-2xl">
                  {rfq.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-3">
                <span className="flex items-center gap-1.5">
                  <ScaleIcon size={12} className="text-copper" />
                  <strong className="text-ink-1 font-mono">{rfq.quoteCount ?? 0}</strong>{' '}
                  quote{(rfq.quoteCount ?? 0) === 1 ? '' : 's'}
                </span>
                {rfq.itemCount != null && (
                  <span className="flex items-center gap-1.5">
                    <PackageIcon size={12} className="text-copper" />
                    <strong className="text-ink-1 font-mono">{rfq.itemCount}</strong> line
                    {rfq.itemCount === 1 ? '' : 's'}
                  </span>
                )}
                {rfq.lowestLandedCents != null && (
                  <span className="flex items-center gap-1.5">
                    <BanknoteIcon size={12} className="text-mint" />
                    from{' '}
                    <strong className="text-ink-1 font-mono">
                      {formatLKR(rfq.lowestLandedCents)}
                    </strong>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <CalendarIcon size={12} className="text-copper" />
                  <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${dt.tone === 'rose' ? 'text-rose font-semibold' : ''}`}>
                    <span className={`size-1.5 rotate-45 ${dtDot}`} />
                    {dt.label === 'No deadline' ? (
                      'No deadline'
                    ) : (
                      <>
                        {dt.label === 'Expired' ? 'Expired' : `Due ${fmtRelative(rfq.deadline)}`}
                      </>
                    )}
                  </span>
                </span>
              </div>
            </div>

            {/* Right action cluster */}
            <div className="flex items-center gap-2 self-start">
              {rfq.lowestLandedCents != null && (
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                    Best landed
                  </div>
                  <div className="font-mono font-bold text-base text-ink-1">
                    {formatCompactLKR(rfq.lowestLandedCents)}
                  </div>
                </div>
              )}
              <div className="inline-flex items-center gap-1 text-xs font-semibold text-ink-1 group-hover:text-copper transition-colors px-3 py-1.5 bg-bone border border-ink/10 group-hover:border-ink">
                <span>Open</span>
                <ArrowRightIcon size={12} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = ['awarded', 'converted_to_order', 'accepted'].includes(s)
    ? 'bg-mint/15 text-mint border-mint/30'
    : ['cancelled', 'expired', 'closed', 'rejected', 'withdrawn'].includes(s)
    ? 'bg-ink/10 text-ink-4 border-ink/20'
    : ['negotiating'].includes(s)
    ? 'bg-copper/15 text-copper border-copper/30'
    : 'bg-amber/15 text-amber border-amber/30';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${tone}`}
    >
      <span className="size-1.5 rotate-45 bg-current" />
      {s.replace(/_/g, ' ')}
    </span>
  );
}
