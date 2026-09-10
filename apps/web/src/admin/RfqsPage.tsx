import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Surface, MetricNumber } from '@/components/brand/Surface';
import { Button, ErrorBanner } from '@/components/ui';
import { Link } from 'react-router-dom';
import { useToast } from '@vyro/ui';
import { formatLKR } from '@/lib/format';
import {
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  SearchIcon,
  RefreshCwIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  Building2Icon,
  PackageIcon,
  Edit3Icon,
  XIcon,
  ScaleIcon,
  TruckIcon,
} from '@/components/icons';

interface AdminRfqRow {
  id: string;
  businessId: string;
  rfqNumber: string;
  title: string;
  description: string | null;
  status: string;
  deadline: number | null;
  createdAt: number;
  awardedQuoteId: string | null;
  deliveryCity: string | null;
  deliveryDistrict: string | null;
  businessName: string | null;
}

interface RfqThresholds {
  valueThresholdCents: number;
  quantityThreshold: number;
}

const STATUS_GROUPS: Array<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: 'all', label: 'All RFQs', match: () => true },
  { key: 'open', label: 'Open · Quoting', match: (s) => ['open', 'quoting'].includes(s) },
  { key: 'review', label: 'Quotes Received · Under Review', match: (s) => ['quotes_received', 'under_review'].includes(s) },
  { key: 'awarded', label: 'Awarded · Converted to PO', match: (s) => ['awarded', 'converted_to_order'].includes(s) },
  { key: 'closed', label: 'Expired · Cancelled · Closed', match: (s) => ['expired', 'cancelled', 'closed', 'draft'].includes(s) },
];

function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'open':
    case 'quoting':
      return 'bg-volt/15 text-volt-deep border-volt/30';
    case 'quotes_received':
    case 'under_review':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'awarded':
    case 'converted_to_order':
      return 'bg-mint/15 text-emerald-700 border-mint/30';
    case 'expired':
    case 'cancelled':
    case 'closed':
      return 'bg-rose/10 text-rose border-rose/25';
    default:
      return 'bg-slate-100 text-ink-4 border-ink/10';
  }
}

function statusDot(status: string) {
  switch (status.toLowerCase()) {
    case 'open':
    case 'quoting':
      return 'bg-emerald-500 animate-pulse';
    case 'quotes_received':
    case 'under_review':
      return 'bg-blue-500';
    case 'awarded':
    case 'converted_to_order':
      return 'bg-emerald-600';
    case 'expired':
    case 'cancelled':
      return 'bg-rose';
    default:
      return 'bg-ink-4';
  }
}

function formatDeadline(ts: number | null) {
  if (!ts) return { text: 'No deadline set', isPast: false };
  const diff = ts - Date.now();
  if (diff < 0) return { text: 'Expired', isPast: true };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return { text: `Closes in ${hours}h`, isPast: false };
  const days = Math.floor(hours / 24);
  return { text: `Closes in ${days}d`, isPast: false };
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function AdminRfqsPage() {
  usePageTitle('RFQ Oversight');
  const toast = useToast();
  const qc = useQueryClient();

  const [result, setResult] = useState<{ rfqsExpired: number; quotesExpired: number; reminders: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);

  // Search and filter
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');

  // Query all platform RFQs
  const rfqsQuery = useQuery({
    queryKey: ['admin-rfqs'],
    queryFn: () => api.get<{ rfqs: AdminRfqRow[] }>('/rfqs'),
    refetchInterval: 60_000,
  });

  // Query active bulk thresholds
  const thresholdsQuery = useQuery({
    queryKey: ['rfq-thresholds'],
    queryFn: () => api.get<RfqThresholds>('/rfqs/thresholds'),
  });

  const allRfqs = rfqsQuery.data?.rfqs ?? [];
  const thresholds = thresholdsQuery.data;

  // Run expiry sweep
  async function sweep() {
    setRunning(true);
    try {
      const r = await api.post<{ rfqsExpired: number; quotesExpired: number; reminders: number }>(
        '/rfqs/admin/expire',
        {},
      );
      setResult(r);
      toast.show(
        toast.success(
          `Expiry sweep complete: ${r.rfqsExpired} RFQs, ${r.quotesExpired} quotes expired, ${r.reminders} reminders dispatched.`,
        ),
      );
      void qc.invalidateQueries({ queryKey: ['admin-rfqs'] });
    } catch {
      toast.show(toast.error('Expiry sweep failed. Please check network logs.'));
    } finally {
      setRunning(false);
    }
  }

  // Filtered RFQ rows
  const filteredRfqs = useMemo(() => {
    return allRfqs.filter((r) => {
      const matchesGroup = STATUS_GROUPS.find((g) => g.key === group)?.match(r.status) ?? true;
      if (!matchesGroup) return false;

      if (search.trim()) {
        const s = search.toLowerCase();
        const matchesSearch =
          r.rfqNumber.toLowerCase().includes(s) ||
          r.title.toLowerCase().includes(s) ||
          (r.businessName && r.businessName.toLowerCase().includes(s)) ||
          (r.deliveryCity && r.deliveryCity.toLowerCase().includes(s));
        if (!matchesSearch) return false;
      }
      return true;
    });
  }, [allRfqs, group, search]);

  // Metrics summary
  const metrics = useMemo(() => {
    const total = allRfqs.length;
    const open = allRfqs.filter((r) => ['open', 'quoting'].includes(r.status)).length;
    const review = allRfqs.filter((r) => ['quotes_received', 'under_review'].includes(r.status)).length;
    const awarded = allRfqs.filter((r) => ['awarded', 'converted_to_order'].includes(r.status)).length;
    const closed = allRfqs.filter((r) => ['expired', 'cancelled', 'closed'].includes(r.status)).length;
    return { total, open, review, awarded, closed };
  }, [allRfqs]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* ── 1. Executive Command Header ── */}
      <header className="bg-ink text-paper border border-paper/10 relative overflow-hidden grain shadow-lg">
        <div className="p-6 sm:p-8">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="vyro-kicker text-volt">Operations Command</span>
                <span className="text-paper/40">/</span>
                <span className="text-[11px] font-mono text-paper/70">Procurement Oversight</span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/10 border border-volt/25 text-[10px] font-mono text-volt uppercase tracking-wider font-bold">
                  <span className="size-1.5 rounded-full bg-volt animate-pulse" />
                  National RFQ Clearinghouse
                </span>
              </div>
              <h1 className="vyro-display text-3xl sm:text-4xl text-paper font-bold tracking-tight">
                RFQ Oversight
              </h1>
              <p className="text-xs sm:text-sm text-paper/70 max-w-2xl leading-relaxed">
                Platform-wide bulk quotation governance, commercial qualification thresholds, automated expiry sweeps, and pipeline conversion into commercial purchase orders.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void sweep()}
                disabled={running}
                loading={running}
                className="border-paper/20 text-paper hover:bg-paper/10 text-xs font-mono"
              >
                <RefreshCwIcon size={14} className={running ? 'animate-spin' : ''} />
                <span>Run Expiry Sweep</span>
              </Button>
              <Link
                to="/rfqs"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider font-bold bg-volt text-ink hover:bg-volt/90 transition-colors shadow-sm"
              >
                <span>Buyer Portal</span>
                <ExternalLinkIcon size={12} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* ── 2. KPI Metrics Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Surface className="p-5 border border-ink/15 bg-paper hover:border-ink hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-ink-4 font-semibold">
              Total Platform RFQs
            </span>
            <div className="size-8 bg-bone border border-ink/10 flex items-center justify-center shrink-0 text-ink">
              <FileTextIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <MetricNumber size="lg" className="text-ink font-bold">
              {metrics.total}
            </MetricNumber>
            <div className="text-[11px] text-ink-4 mt-1">Total procurement tenders</div>
          </div>
        </Surface>

        <Surface className="p-5 border border-ink/15 bg-paper hover:border-ink hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-ink-4 font-semibold">
              Awaiting Quotes
            </span>
            <div className="size-8 bg-bone border border-ink/10 flex items-center justify-center shrink-0 text-volt-deep">
              <ClockIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <MetricNumber size="lg" className="text-volt-deep font-bold">
              {metrics.open}
            </MetricNumber>
            <div className="text-[11px] text-ink-4 mt-1">Active supplier bidding</div>
          </div>
        </Surface>

        <Surface className="p-5 border border-ink/15 bg-paper hover:border-ink hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-ink-4 font-semibold">
              Under Review
            </span>
            <div className="size-8 bg-bone border border-ink/10 flex items-center justify-center shrink-0 text-blue-600">
              <ScaleIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <MetricNumber size="lg" className="text-blue-600 font-bold">
              {metrics.review}
            </MetricNumber>
            <div className="text-[11px] text-ink-4 mt-1">Quotes received & comparing</div>
          </div>
        </Surface>

        <Surface className="p-5 border border-ink/15 bg-paper hover:border-ink hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] font-mono text-ink-4 font-semibold">
              Awarded & Cleared
            </span>
            <div className="size-8 bg-bone border border-ink/10 flex items-center justify-center shrink-0 text-mint">
              <CheckCircleIcon size={16} />
            </div>
          </div>
          <div className="mt-3">
            <MetricNumber size="lg" className="text-mint font-bold">
              {metrics.awarded}
            </MetricNumber>
            <div className="text-[11px] text-ink-4 mt-1">Converted into Purchase Orders</div>
          </div>
        </Surface>
      </div>

      {/* ── 3. Operations & Governance Deck ── */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* Card 1: Bulk-Quote Thresholds */}
        <Surface kind="elevated" className="p-6 border border-ink/15 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="vyro-kicker text-copper">Procurement Rules</div>
              <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-bold bg-bone text-ink-3 border border-ink/10">
                Active Thresholds
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Bulk-Quote Qualification</h3>
            <p className="text-xs text-ink-3 leading-relaxed">
              Carts meeting either threshold are automatically prompted to request negotiated wholesale quotes:
            </p>

            <div className="p-4 bg-bone/60 border border-ink/10 space-y-2 rounded-lg">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-4">Minimum Cart Value</span>
                <span className="vyro-metric font-bold text-ink">
                  {thresholds ? formatLKR(thresholds.valueThresholdCents) : 'Rs. 1,000.00'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1.5 border-t border-ink/5">
                <span className="text-ink-4">Minimum Quantity</span>
                <span className="vyro-metric font-bold text-ink">
                  {thresholds ? `${thresholds.quantityThreshold}+ units` : '500+ units'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-ink/10 flex items-center justify-between">
            <span className="text-[11px] text-ink-4">Configured via Platform Settings</span>
            <button
              type="button"
              onClick={() => setIsEditingThresholds(true)}
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-copper hover:text-ink transition-colors"
            >
              <Edit3Icon size={12} />
              <span>Edit Thresholds</span>
            </button>
          </div>
        </Surface>

        {/* Card 2: Expiry & Reminders Sweep */}
        <Surface kind="elevated" className="p-6 border border-ink/15 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="vyro-kicker text-copper">Automated Maintenance</div>
              <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-bold bg-mint/15 text-mint border border-mint/25">
                Hourly Cron
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Expiry Sweep Engine</h3>
            <p className="text-xs text-ink-3 leading-relaxed">
              Hourly background cron sweeps close expired RFQs, archive overdue supplier bids, and dispatch notification reminders.
            </p>

            <div className="p-4 bg-bone/60 border border-ink/10 rounded-lg space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4 font-semibold">
                Last Sweep Telemetry
              </div>
              <div className="text-sm font-mono font-bold text-ink mt-1">
                {result
                  ? `${result.rfqsExpired} RFQs • ${result.quotesExpired} quotes • ${result.reminders} reminders`
                  : 'Sweep standing by for execution'}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-ink/10 flex items-center justify-between">
            <span className="text-[11px] text-ink-4">Trigger manual sweep anytime</span>
            <Button
              variant="outline"
              size="sm"
              disabled={running}
              loading={running}
              onClick={() => void sweep()}
              className="text-xs font-mono"
            >
              <RefreshCwIcon size={12} className={running ? 'animate-spin' : ''} />
              <span>Run Sweep Now</span>
            </Button>
          </div>
        </Surface>

        {/* Card 3: Purchase Order Pipeline Conversion */}
        <Surface kind="elevated" className="p-6 border border-ink/15 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="vyro-kicker text-copper">Pipeline Lifecycle</div>
              <span className="px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider font-bold bg-bone text-ink-3 border border-ink/10">
                PO Integration
              </span>
            </div>
            <h3 className="font-display text-lg font-bold text-ink">Purchase Order Conversion</h3>
            <p className="text-xs text-ink-3 leading-relaxed">
              Awarded RFQ quotes seamlessly transition into standard Purchase Orders with commercial escrow protection and delivery verification.
            </p>

            <div className="p-4 bg-bone/60 border border-ink/10 rounded-lg space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-ink">
                <TruckIcon size={14} className="text-copper" />
                <span>Automated Escrow & Dispatch</span>
              </div>
              <p className="text-[11px] text-ink-4 leading-relaxed mt-1">
                Lock agreed bulk pricing into binding procurement commitments for downstream warehouse logistics.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-ink/10 flex items-center justify-between">
            <span className="text-[11px] text-ink-4">Track orders pipeline</span>
            <Link
              to="/orders"
              className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-copper hover:text-ink transition-colors"
            >
              <span>Manage Orders</span>
              <ArrowRightIcon size={12} />
            </Link>
          </div>
        </Surface>
      </div>

      {/* ── 4. All Platform RFQs Registry Table ── */}
      <Surface className="border border-ink/15 bg-paper overflow-hidden shadow-sm space-y-0">
        {/* Table Header & Search Filter */}
        <div className="p-5 border-b border-ink/10 bg-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="vyro-kicker text-copper">Platform Directory</div>
              <h3 className="font-display text-lg font-bold text-ink mt-0.5">
                All Procurement RFQs ({filteredRfqs.length})
              </h3>
            </div>

            {/* Keyword Search */}
            <div className="relative w-full sm:w-80">
              <SearchIcon
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by RFQ #, title, business, or city…"
                className="w-full h-9 pl-9 pr-8 text-xs bg-slate-50 border border-ink/15 rounded-lg focus:outline-none focus:border-ink focus:bg-white transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 hover:text-ink text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
            {STATUS_GROUPS.map((g) => {
              const count = allRfqs.filter((r) => g.match(r.status)).length;
              const isActive = group === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGroup(g.key)}
                  className={`px-3 py-1.5 text-xs font-mono font-semibold transition-all whitespace-nowrap border flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-ink text-paper border-ink shadow-2xs'
                      : 'bg-transparent text-ink-3 border-transparent hover:border-ink/15 hover:text-ink'
                  }`}
                >
                  <span>{g.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-paper text-ink font-bold' : 'bg-bone text-ink-4'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Content */}
        {rfqsQuery.isLoading ? (
          <div className="p-6 divide-y divide-ink/5 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 animate-pulse pt-3 first:pt-0">
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-1/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
                <div className="h-5 bg-slate-100 rounded w-24" />
                <div className="h-5 bg-slate-100 rounded w-20" />
              </div>
            ))}
          </div>
        ) : filteredRfqs.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-ink-4 mx-auto">
              <FileTextIcon size={24} />
            </div>
            <h4 className="font-display text-base font-semibold text-ink">No RFQs found</h4>
            <p className="text-xs text-ink-4 max-w-sm mx-auto">
              {search || group !== 'all'
                ? 'No procurement requests match your current search and filter settings.'
                : 'There are currently no RFQs registered across the platform.'}
            </p>
            {(search || group !== 'all') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setGroup('all');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-ink/10 text-ink-4 font-mono uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-5">RFQ Reference & Title</th>
                  <th className="py-3 px-4">Purchasing Entity</th>
                  <th className="py-3 px-4">Delivery Location</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4">Deadline</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5 bg-white">
                {filteredRfqs.map((rfq) => {
                  const deadlineInfo = formatDeadline(rfq.deadline);
                  return (
                    <tr key={rfq.id} className="hover:bg-slate-50/50 transition-colors group">
                      {/* Reference & Title */}
                      <td className="py-3.5 px-5">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-ink bg-slate-100 px-1.5 py-0.5 rounded border border-ink/5">
                              {rfq.rfqNumber}
                            </span>
                            <span className="text-[10px] font-mono text-ink-4">
                              {formatDate(rfq.createdAt)}
                            </span>
                          </div>
                          <Link
                            to={`/rfqs/${rfq.id}`}
                            className="font-semibold text-sm text-ink hover:text-copper transition-colors block"
                          >
                            {rfq.title}
                          </Link>
                        </div>
                      </td>

                      {/* Purchasing Business */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-bone flex items-center justify-center text-ink shrink-0">
                            <Building2Icon size={12} />
                          </div>
                          <span className="font-medium text-ink">
                            {rfq.businessName ?? 'Commercial Buyer'}
                          </span>
                        </div>
                      </td>

                      {/* Delivery Location */}
                      <td className="py-3.5 px-4">
                        <div className="text-ink-3">
                          {rfq.deliveryCity || rfq.deliveryDistrict ? (
                            <span>
                              📍 {[rfq.deliveryCity, rfq.deliveryDistrict].filter(Boolean).join(', ')}
                            </span>
                          ) : (
                            <span className="text-ink-4">—</span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase border ${statusColor(
                            rfq.status,
                          )}`}
                        >
                          <span className={`size-1.5 rounded-full ${statusDot(rfq.status)}`} />
                          {rfq.status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Deadline */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span
                            className={`font-mono text-xs font-medium ${
                              deadlineInfo.isPast ? 'text-rose font-bold' : 'text-ink-3'
                            }`}
                          >
                            {deadlineInfo.text}
                          </span>
                          {rfq.deadline && (
                            <div className="text-[10px] text-ink-4">
                              {new Date(rfq.deadline).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'short',
                              })}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/rfqs/${rfq.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-semibold bg-bone hover:bg-ink hover:text-paper text-ink border border-ink/10 rounded transition-colors"
                          >
                            <span>Inspect</span>
                            <ArrowRightIcon size={11} />
                          </Link>
                          <Link
                            to={`/rfqs/${rfq.id}/compare`}
                            className="p-1 rounded text-ink-4 hover:text-copper hover:bg-slate-100 transition-colors"
                            title="Compare Quotes"
                          >
                            <ScaleIcon size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* ── 5. Edit Thresholds Modal ── */}
      {isEditingThresholds && thresholds && (
        <EditThresholdsModal
          thresholds={thresholds}
          onClose={() => setIsEditingThresholds(false)}
        />
      )}
    </div>
  );
}

function EditThresholdsModal({
  thresholds,
  onClose,
}: {
  thresholds: RfqThresholds;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [valueLkr, setValueLkr] = useState<number>(thresholds.valueThresholdCents / 100);
  const [qty, setQty] = useState<number>(thresholds.quantityThreshold);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await api.patch('/admin/settings', {
        rfqValueThresholdCents: Math.round(valueLkr * 100),
        rfqQuantityThreshold: qty,
      });
      await qc.invalidateQueries({ queryKey: ['rfq-thresholds'] });
      toast.show(toast.success('Procurement thresholds updated successfully'));
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Failed to update platform settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-ink/10 shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-ink/10 bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-copper/15 text-copper-deep flex items-center justify-center font-bold">
              <ScaleIcon size={16} />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-ink">
                Adjust RFQ Qualification Thresholds
              </h3>
              <p className="text-[11px] text-ink-4">Global cart qualification rules</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-ink-4 hover:text-ink hover:bg-slate-100 transition"
          >
            <XIcon size={16} />
          </button>
        </div>

        {err && (
          <div className="p-4 border-b border-rose/20 bg-rose/5">
            <ErrorBanner message={err} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-1">
              Minimum Cart Value (LKR)
            </label>
            <input
              type="number"
              min={0}
              step={100}
              required
              value={valueLkr}
              onChange={(e) => setValueLkr(Number(e.target.value))}
              className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-ink/15 rounded-lg focus:outline-none focus:border-ink focus:bg-white transition-all"
            />
            <p className="text-[10px] text-ink-4 mt-1">
              Qualifies cart for bulk negotiation when total exceeds Rs. {valueLkr.toLocaleString()}
            </p>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-ink-4 font-semibold mb-1">
              Minimum Cart Quantity (Units)
            </label>
            <input
              type="number"
              min={1}
              required
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="w-full h-9 px-3 text-xs font-mono bg-slate-50 border border-ink/15 rounded-lg focus:outline-none focus:border-ink focus:bg-white transition-all"
            />
            <p className="text-[10px] text-ink-4 mt-1">
              Qualifies cart when total item units exceed {qty} units
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-ink/10">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={saving}>
              Save Thresholds
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
