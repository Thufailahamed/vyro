import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cn, useToast } from '@vyro/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import {
  FileTextIcon,
  ClockIcon,
  CheckCircleIcon,
  SearchIcon,
  RefreshCwIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  Edit3Icon,
  XIcon,
  ScaleIcon,
  TruckIcon,
  MapPinIcon,
} from '@/components/icons';
import {
  AdminPage,
  AdminPageHeader,
  Button,
  Callout,
  EmptyBlock,
  Panel,
  Pill,
  buttonClass,
  Skeleton,
  StatCard,
  StatGrid,
  TableCard,
  TableSkeleton,
  Tabs,
  Toolbar,
  controlClass,
} from './ui';
import { Monogram, formatDate } from './registryUi';
import type { PillTone } from './ui';

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

interface SweepResult {
  rfqsExpired: number;
  quotesExpired: number;
  reminders: number;
}

const STATUS_GROUPS: Array<{ key: string; label: string; match: (s: string) => boolean }> = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'open', label: 'Open', match: (s) => ['open', 'quoting'].includes(s) },
  { key: 'review', label: 'Under review', match: (s) => ['quotes_received', 'under_review'].includes(s) },
  { key: 'awarded', label: 'Awarded', match: (s) => ['awarded', 'converted_to_order'].includes(s) },
  { key: 'closed', label: 'Closed', match: (s) => ['expired', 'cancelled', 'closed', 'draft'].includes(s) },
];

function statusTone(status: string): PillTone {
  switch (status.toLowerCase()) {
    case 'open':
    case 'quoting':
      return 'success';
    case 'quotes_received':
    case 'under_review':
      return 'warning';
    case 'awarded':
    case 'converted_to_order':
      return 'brand';
    case 'expired':
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

function statusLabel(status: string) {
  const text = status.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDeadline(ts: number | null): { text: string; tone: 'muted' | 'ok' | 'danger' } {
  if (!ts) return { text: 'No deadline set', tone: 'muted' };
  const diff = ts - Date.now();
  if (diff < 0) return { text: 'Expired', tone: 'danger' };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 24) return { text: `Closes in ${hours}h`, tone: 'ok' };
  return { text: `Closes in ${Math.floor(hours / 24)}d`, tone: 'ok' };
}

const CARD_INSET = 'bg-bone/60 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]';

export function AdminRfqsPage() {
  usePageTitle('RFQ Oversight');
  const toast = useToast();
  const qc = useQueryClient();

  const [result, setResult] = useState<SweepResult | null>(null);
  const [running, setRunning] = useState(false);
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [group, setGroup] = useState('all');

  const rfqsQuery = useQuery({
    queryKey: ['admin-rfqs'],
    queryFn: () => api.get<{ rfqs: AdminRfqRow[] }>('/rfqs'),
    refetchInterval: 60_000,
  });

  const thresholdsQuery = useQuery({
    queryKey: ['rfq-thresholds'],
    queryFn: () => api.get<RfqThresholds>('/rfqs/thresholds'),
  });

  const allRfqs = rfqsQuery.data?.rfqs ?? [];
  const thresholds = thresholdsQuery.data;

  async function sweep() {
    setRunning(true);
    try {
      const r = await api.post<SweepResult>('/rfqs/admin/expire', {});
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

  const search = searchInput.trim().toLowerCase();

  const filteredRfqs = useMemo(() => {
    return allRfqs.filter((r) => {
      if (!(STATUS_GROUPS.find((g) => g.key === group)?.match(r.status) ?? true)) return false;
      if (!search) return true;
      return (
        r.rfqNumber.toLowerCase().includes(search) ||
        r.title.toLowerCase().includes(search) ||
        (r.businessName?.toLowerCase().includes(search) ?? false) ||
        (r.deliveryCity?.toLowerCase().includes(search) ?? false)
      );
    });
  }, [allRfqs, group, search]);

  const metrics = useMemo(() => {
    const count = (match: (s: string) => boolean) => allRfqs.filter((r) => match(r.status)).length;
    return {
      total: allRfqs.length,
      open: count((s) => ['open', 'quoting'].includes(s)),
      review: count((s) => ['quotes_received', 'under_review'].includes(s)),
      awarded: count((s) => ['awarded', 'converted_to_order'].includes(s)),
    };
  }, [allRfqs]);

  const filtered = group !== 'all' || search.length > 0;

  const resetFilters = () => {
    setSearchInput('');
    setGroup('all');
  };

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Operations command · Procurement oversight"
        title="RFQ Oversight"
        description="Platform-wide bulk quotation governance, commercial qualification thresholds, automated expiry sweeps, and pipeline conversion into purchase orders."
        meta={
          <Pill tone="success" dot>
            National RFQ clearinghouse
          </Pill>
        }
        actions={
          <>
            <Link to="/rfqs" className={buttonClass('secondary')}>
              <span>Buyer portal</span>
              <ExternalLinkIcon size={13} />
            </Link>
            <Button variant="volt" onClick={() => void sweep()} disabled={running}>
              <RefreshCwIcon size={14} className={running ? 'animate-spin' : undefined} />
              <span>Run expiry sweep</span>
            </Button>
          </>
        }
      />

      {rfqsQuery.isError ? (
        <Callout
          tone="danger"
          title="Couldn't load RFQs"
          action={
            <Button variant="secondary" size="sm" onClick={() => void rfqsQuery.refetch()}>
              Retry
            </Button>
          }
        >
          The RFQ service didn't respond. Check the backend and try again.
        </Callout>
      ) : null}

      <StatGrid>
        <StatCard
          label="Total platform RFQs"
          value={metrics.total}
          sub="Procurement tenders"
          icon={<FileTextIcon size={16} />}
          loading={rfqsQuery.isLoading}
        />
        <StatCard
          label="Awaiting quotes"
          value={metrics.open}
          sub="Active supplier bidding"
          icon={<ClockIcon size={16} />}
          loading={rfqsQuery.isLoading}
        />
        <StatCard
          label="Under review"
          value={metrics.review}
          sub="Quotes received & comparing"
          icon={<ScaleIcon size={16} />}
          tone={metrics.review > 0 ? 'warning' : 'neutral'}
          loading={rfqsQuery.isLoading}
        />
        <StatCard
          label="Awarded & cleared"
          value={metrics.awarded}
          sub="Converted into purchase orders"
          icon={<CheckCircleIcon size={16} />}
          tone={metrics.awarded > 0 ? 'success' : 'neutral'}
          loading={rfqsQuery.isLoading}
        />
      </StatGrid>

      <div className="grid gap-5 md:grid-cols-3">
        <Panel
          title="Bulk-quote qualification"
          description="Carts meeting either threshold are prompted to request negotiated wholesale quotes."
          icon={<ScaleIcon size={16} />}
          className="flex flex-col"
          bodyClassName="space-y-3"
          footer={
            <div className="flex items-center justify-between gap-3">
              <span>Configured via platform settings</span>
              <button
                type="button"
                onClick={() => setIsEditingThresholds(true)}
                disabled={!thresholds}
                className="inline-flex items-center gap-1.5 font-semibold text-ink transition-colors hover:text-copper disabled:opacity-50"
              >
                <Edit3Icon size={12} />
                Edit thresholds
              </button>
            </div>
          }
        >
          {thresholds ? (
            <>
              <ThresholdRow label="Minimum cart value" value={formatLKR(thresholds.valueThresholdCents)} />
              <ThresholdRow label="Minimum quantity" value={`${thresholds.quantityThreshold}+ units`} />
            </>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}
        </Panel>

        <Panel
          title="Expiry sweep engine"
          description="An hourly background job closes expired RFQs, archives overdue bids, and dispatches reminders."
          icon={<RefreshCwIcon size={16} />}
          className="flex flex-col"
          bodyClassName="space-y-3"
          footer={
            <div className="flex items-center justify-between gap-3">
              <span>Runs hourly · manual anytime</span>
              <Button variant="secondary" size="sm" disabled={running} onClick={() => void sweep()}>
                <RefreshCwIcon size={12} className={running ? 'animate-spin' : undefined} />
                Run sweep now
              </Button>
            </div>
          }
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Last sweep</div>
          {result ? (
            <div className="grid grid-cols-3 gap-2">
              <SweepStat label="RFQs" value={result.rfqsExpired} />
              <SweepStat label="Quotes" value={result.quotesExpired} />
              <SweepStat label="Reminders" value={result.reminders} />
            </div>
          ) : (
            <div className={cn('rounded-xl px-4 py-3.5 text-sm text-ink-3', CARD_INSET)}>
              Standing by. No manual sweep has been run in this session.
            </div>
          )}
        </Panel>

        <Panel
          title="Purchase order conversion"
          description="Awarded RFQ quotes move into standard purchase orders with escrow protection and delivery verification."
          icon={<TruckIcon size={16} />}
          className="flex flex-col"
          bodyClassName="space-y-3"
          footer={
            <div className="flex items-center justify-between gap-3">
              <span>Track the orders pipeline</span>
              <Link to="/orders" className="inline-flex items-center gap-1.5 font-semibold text-ink transition-colors hover:text-copper">
                Manage orders
                <ArrowRightIcon size={12} />
              </Link>
            </div>
          }
        >
          <div className={cn('rounded-xl px-4 py-3.5', CARD_INSET)}>
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <TruckIcon size={14} className="text-copper" />
              Automated escrow & dispatch
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-4">
              Agreed bulk pricing locks into binding procurement commitments for downstream warehouse logistics.
            </p>
          </div>
        </Panel>
      </div>

      <TableCard
        title="All procurement RFQs"
        description={`Showing ${filteredRfqs.length} of ${allRfqs.length} across the platform`}
        toolbar={
          <div className="space-y-3">
            <Tabs
              ariaLabel="Filter RFQs by status"
              value={group}
              onChange={setGroup}
              items={STATUS_GROUPS.map((g) => ({
                key: g.key,
                label: g.label,
                count: allRfqs.filter((r) => g.match(r.status)).length,
              }))}
            />
            <Toolbar>
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <SearchIcon size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search RFQ #, title, buyer or city"
                  aria-label="Search RFQs"
                  className={cn(controlClass, 'w-full pl-9 pr-8')}
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-4 transition-colors hover:text-ink"
                    aria-label="Clear search"
                  >
                    <XIcon size={14} />
                  </button>
                ) : null}
              </div>
            </Toolbar>
          </div>
        }
        footer={
          <>
            <span>
              Showing <strong className="text-ink">{filteredRfqs.length}</strong>{' '}
              {filteredRfqs.length === 1 ? 'RFQ' : 'RFQs'}
              {filtered ? ' · filters applied' : ''}
            </span>
            {filtered ? (
              <button type="button" onClick={resetFilters} className="font-semibold text-copper transition-colors hover:text-ink">
                Reset filters
              </button>
            ) : null}
          </>
        }
      >
        {rfqsQuery.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filteredRfqs.length === 0 ? (
          <EmptyBlock
            icon={<FileTextIcon size={22} />}
            title="No RFQs found"
            description={
              filtered
                ? 'No procurement requests match the current search and filters.'
                : 'There are currently no RFQs registered across the platform.'
            }
            action={
              filtered ? (
                <Button variant="secondary" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>RFQ</th>
                <th>Buyer</th>
                <th>Delivery</th>
                <th>Status</th>
                <th>Deadline</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRfqs.map((rfq) => {
                const deadline = formatDeadline(rfq.deadline);
                const location = [rfq.deliveryCity, rfq.deliveryDistrict].filter(Boolean).join(', ');
                const buyer = rfq.businessName ?? 'Commercial buyer';
                return (
                  <tr key={rfq.id} className="group/row">
                    <td>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">
                            {rfq.rfqNumber}
                          </span>
                          <span className="font-mono text-[11px] text-ink-5">{formatDate(rfq.createdAt)}</span>
                        </div>
                        <Link
                          to={`/rfqs/${rfq.id}`}
                          className="mt-1 block max-w-md truncate font-medium text-ink transition-colors hover:text-copper"
                        >
                          {rfq.title}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Monogram name={buyer} seed={rfq.businessId} size="sm" />
                        <span className="truncate font-medium text-ink">{buyer}</span>
                      </div>
                    </td>
                    <td>
                      {location ? (
                        <span className="inline-flex items-center gap-1.5 text-ink-3">
                          <MapPinIcon size={13} className="shrink-0 text-ink-4" />
                          {location}
                        </span>
                      ) : (
                        <span className="text-ink-5">—</span>
                      )}
                    </td>
                    <td>
                      <Pill tone={statusTone(rfq.status)} dot>
                        {statusLabel(rfq.status)}
                      </Pill>
                    </td>
                    <td>
                      <div className="space-y-0.5">
                        <div
                          className={cn(
                            'font-mono text-xs font-medium',
                            deadline.tone === 'danger' && 'font-bold text-rose',
                            deadline.tone === 'ok' && 'text-ink-3',
                            deadline.tone === 'muted' && 'text-ink-5',
                          )}
                        >
                          {deadline.text}
                        </div>
                        {rfq.deadline ? (
                          <div className="text-[11px] text-ink-5">
                            {new Date(rfq.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Link to={`/rfqs/${rfq.id}/compare`} title="Compare quotes" aria-label="Compare quotes" className={buttonClass('ghost', 'sm')}>
                          <ScaleIcon size={14} />
                        </Link>
                        <Link to={`/rfqs/${rfq.id}`} className={buttonClass('secondary', 'sm')}>
                          Inspect
                          <ArrowRightIcon size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableCard>

      {isEditingThresholds && thresholds ? (
        <EditThresholdsModal thresholds={thresholds} onClose={() => setIsEditingThresholds(false)} />
      ) : null}
    </AdminPage>
  );
}

function ThresholdRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-xl px-4 py-3', CARD_INSET)}>
      <span className="text-xs font-medium text-ink-4">{label}</span>
      <span className="font-mono text-sm font-semibold text-ink num-tabular">{value}</span>
    </div>
  );
}

function SweepStat({ label, value }: { label: string; value: number }) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5', CARD_INSET)}>
      <div className="vyro-metric text-xl leading-none text-ink">{value}</div>
      <div className="mt-1.5 text-[11px] text-ink-4">{label}</div>
    </div>
  );
}

function EditThresholdsModal({ thresholds, onClose }: { thresholds: RfqThresholds; onClose: () => void }) {
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
      toast.show(toast.success('Procurement thresholds updated'));
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Failed to update platform settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rfq-thresholds-title"
      onClick={onClose}
    >
      <div className="vyro-floating w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-paper to-bone text-copper-deep shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)]">
              <ScaleIcon size={16} />
            </span>
            <div>
              <h3 id="rfq-thresholds-title" className="font-sans text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
                Qualification thresholds
              </h3>
              <p className="mt-0.5 text-xs text-ink-4">Global rules that prompt bulk negotiation at checkout.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-4 transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            <XIcon size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5 px-6 pb-6">
          {err ? <Callout tone="danger">{err}</Callout> : null}

          <label className="block">
            <span className="text-xs font-semibold text-ink-3">Minimum cart value (LKR)</span>
            <input
              type="number"
              min={0}
              step={100}
              required
              value={valueLkr}
              onChange={(e) => setValueLkr(Number(e.target.value))}
              className={cn(controlClass, 'mt-1.5 w-full num-tabular')}
            />
            <span className="mt-1.5 block text-[11px] text-ink-4">
              Qualifies a cart when its total exceeds Rs. {valueLkr.toLocaleString()}.
            </span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-ink-3">Minimum cart quantity (units)</span>
            <input
              type="number"
              min={1}
              required
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className={cn(controlClass, 'mt-1.5 w-full num-tabular')}
            />
            <span className="mt-1.5 block text-[11px] text-ink-4">Qualifies a cart when it exceeds {qty} units.</span>
          </label>

          <div className="flex justify-end gap-2 border-t border-ink/[0.07] pt-5">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              Save thresholds
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
