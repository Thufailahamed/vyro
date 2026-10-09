import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, useToast } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { StatusPill } from './RfqsPage';
import { RfqDocsUpload } from '@/components/RfqDocsUpload';
import { OrderItemThumb } from '@/components/orders/OrderItemThumb';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  MailIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  ScaleIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StoreIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  XIcon,
} from '@/components/icons';

interface VersionRow {
  version: number;
  changedByUserId: string;
  previousTotalCents: number | null;
  newTotalCents: number;
  changesJson?: string | null;
  createdAt: number;
}
interface CounterRow {
  id: string;
  offeredByType: string;
  proposedTotalCents: number;
  proposedDeliveryFeeCents?: number | null;
  proposedPaymentTerms?: string | null;
  message?: string | null;
  status: string;
  createdAt: number;
}

type RfqHeader = {
  rfqNumber: string;
  title: string;
  status: string;
  businessId: string;
  description?: string | null;
  deadline?: number | null;
  isOpen?: number | boolean;
  deliveryLocation?: string | null;
  deliveryCity?: string | null;
  deliveryDistrict?: string | null;
  requiredDeliveryDate?: number | null;
  deliveryRequirements?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  specifications?: string | null;
  packagingRequirements?: string | null;
  qualityRequirements?: string | null;
  brandPreferences?: string | null;
  notes?: string | null;
  awardedQuoteId?: string | null;
  convertedPoId?: string | null;
  publishedAt?: number | null;
  createdAt: number;
};
type RfqItem = {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unit: string;
  targetPriceCents?: number | null;
  specifications?: string | null;
};
type Invite = {
  id: string;
  supplierId: string;
  status: string;
  invitedAt: number;
  viewedAt?: number | null;
  quotedAt?: number | null;
};
type SupplierBrief = {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  verified: boolean;
  reviewAvg: number | null;
  reviewCount: number;
};
type QuoteHeader = {
  id: string;
  quoteNumber: string;
  status: string;
  version: number;
  totalCents: number;
  currency: string;
  deliveryFeeCents: number;
  paymentTerms?: string;
  validUntil?: number;
  estimatedDeliveryDate?: number;
  notes?: string;
  isPartial: number | boolean;
  supplierId: string;
};
type QuoteItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  isAlternative: number;
};
type RfqEvent = { action: string; createdAt: number; toStatus?: string };

const money = (cents: number) => formatLKR(cents);
const OPEN_STATES = new Set(['open', 'quoting', 'quotes_received', 'under_review', 'negotiating']);
const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const titleCase = (s: string) => s.replace(/[._]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

/* ------------------------------------------------------------------ lifecycle */

const STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'published', label: 'Published' },
  { key: 'quotes', label: 'Quotes in' },
  { key: 'awarded', label: 'Awarded' },
  { key: 'ordered', label: 'Ordered' },
] as const;

function stepIndex(status: string, quoteCount: number): number {
  if (status === 'draft') return 0;
  if (status === 'converted_to_order') return 4;
  if (status === 'awarded') return 3;
  if (['quotes_received', 'under_review', 'negotiating'].includes(status)) return 2;
  if (['open', 'quoting'].includes(status)) return quoteCount > 0 ? 2 : 1;
  return quoteCount > 0 ? 2 : 1; // closed / cancelled / expired: where it stopped
}

const STATUS_CHIP: Record<string, { label: string; dot: string }> = {
  draft: { label: 'Draft', dot: 'bg-paper/50' },
  open: { label: 'Open for quotes', dot: 'bg-mint animate-pulse' },
  quoting: { label: 'Suppliers quoting', dot: 'bg-mint animate-pulse' },
  quotes_received: { label: 'Quotes received', dot: 'bg-amber' },
  under_review: { label: 'Under review', dot: 'bg-amber' },
  negotiating: { label: 'Negotiating', dot: 'bg-amber' },
  awarded: { label: 'Awarded', dot: 'bg-volt animate-pulse' },
  converted_to_order: { label: 'Ordered', dot: 'bg-volt' },
  closed: { label: 'Closed', dot: 'bg-paper/40' },
  cancelled: { label: 'Cancelled', dot: 'bg-rose' },
  expired: { label: 'Expired', dot: 'bg-rose' },
};

function countdown(ts: number | null | undefined): { text: string; danger: boolean } | null {
  if (!ts) return null;
  const diff = ts - Date.now();
  if (diff <= 0) return { text: 'Closed', danger: true };
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { text: `${mins}m left`, danger: true };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { text: `${hours}h left`, danger: hours < 6 };
  return { text: `${Math.floor(hours / 24)}d left`, danger: false };
}

/* ------------------------------------------------------------------ small parts */

const heroBtn =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-paper/15 bg-paper/[0.06] px-3.5 text-xs font-semibold text-paper/85 transition-colors hover:bg-paper/[0.12] hover:text-paper disabled:opacity-50';
const heroBtnPrimary =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-volt px-4 text-xs font-bold text-ink shadow-[0_8px_24px_-10px_rgba(198,220,74,0.8)] transition-colors hover:bg-volt/90 disabled:opacity-50';

function Card({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <Surface id={id} className={cn('overflow-hidden p-0', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)]">
              {icon}
            </span>
          ) : null}
          <h3 className="truncate font-display text-[15px] font-bold tracking-[-0.01em] text-ink">
            {title}
          </h3>
        </div>
        {actions}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </Surface>
  );
}

function SectionHead({
  title,
  count,
  actions,
  description,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  description?: string | undefined;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-ink">
          {title}
          {count != null ? (
            <span className="ml-2 inline-flex min-w-6 items-center justify-center rounded-full bg-ink px-2 py-0.5 align-middle font-mono text-[11px] font-bold text-volt">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-4">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

function SupplierAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink font-display text-sm font-bold text-volt',
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || 'S'}
    </span>
  );
}

function Pill({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone: 'success' | 'info' | 'warning' | 'neutral';
  icon?: ReactNode;
}) {
  const cls = {
    success: 'bg-mint/[0.08] text-mint ring-mint/25',
    info: 'bg-copper/[0.08] text-copper-deep ring-copper/25',
    warning: 'bg-amber/[0.1] text-[#a86c28] ring-amber/30',
    neutral: 'bg-ink/[0.04] text-ink-3 ring-ink/10',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
        cls,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-amber/[0.08] p-3 text-xs leading-relaxed text-[#8a5a22] shadow-[inset_0_0_0_1px_rgba(196,132,58,0.25)]">
      <AlertTriangleIcon size={14} className="mt-0.5 shrink-0 text-amber" />
      <span>{children}</span>
    </div>
  );
}

const inputCls = (extra?: string) =>
  cn(
    'h-10 rounded-xl bg-paper px-3.5 text-sm text-ink placeholder:text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.24)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]',
    extra,
  );

/* ------------------------------------------------------------------ hero */

function RfqStepper({ status, quoteCount }: { status: string; quoteCount: number }) {
  const idx = stepIndex(status, quoteCount);
  const stopped = ['closed', 'cancelled', 'expired'].includes(status);
  return (
    <ol className="flex items-center">
      {STEPS.map((s, i) => {
        const done = i < idx || (i === idx && status === 'converted_to_order');
        const current = i === idx && !done;
        return (
          <li key={s.key} className={cn('flex items-center', i < STEPS.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  done && 'bg-volt text-ink',
                  current && !stopped && 'bg-paper text-ink ring-4 ring-volt/25',
                  current && stopped && 'bg-rose/80 text-paper ring-4 ring-rose/20',
                  !done && !current && 'bg-paper/10 text-paper/40 ring-1 ring-inset ring-paper/15',
                )}
              >
                {done ? <CheckIcon size={12} /> : current && stopped ? <XIcon size={11} /> : i + 1}
              </span>
              <span
                className={cn(
                  'whitespace-nowrap font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]',
                  done || current ? 'text-paper/85' : 'text-paper/35',
                )}
              >
                {current && stopped ? (STATUS_CHIP[status]?.label ?? s.label) : s.label}
              </span>
            </div>
            {i < STEPS.length - 1 ? (
              <span
                className={cn('mx-2 mb-5 h-px flex-1', i < idx ? 'bg-volt/70' : 'bg-paper/[0.12]')}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function HeroStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'volt' | 'rose' | undefined;
}) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0 sm:first:pl-5">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-paper/45">
        {label}
      </div>
      <div
        className={cn(
          'vyro-metric mt-2 truncate text-2xl leading-none',
          tone === 'volt' ? 'text-volt' : tone === 'rose' ? 'text-rose' : 'text-paper',
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1.5 truncate text-[11px] text-paper/45">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ quote history */

function QuoteHistory({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['quote-history', quoteId],
    queryFn: () =>
      api.get<{ versions: VersionRow[]; counters: CounterRow[] }>(
        `/rfqs/quotes/${quoteId}/history`,
      ),
  });
  const versions = data?.versions ?? [];
  const counters = data?.counters ?? [];
  const respond = (counterId: string, accept: boolean) =>
    void api.post(`/rfqs/counters/${counterId}/respond`, { accept }).then(() => {
      void qc.invalidateQueries({ queryKey: ['quote-history', quoteId] });
      onChanged();
    });

  return (
    <div className="grid gap-5 rounded-xl bg-bone/50 p-4 text-xs shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] sm:grid-cols-2">
      <div>
        <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-4">
          Versions
        </h4>
        <ol className="relative space-y-3 border-l border-ink/10 pl-4">
          {versions.map((v) => (
            <li key={v.version} className="relative">
              <span
                className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-ink ring-4 ring-bone"
                aria-hidden
              />
              <div className="font-mono text-[10px] text-ink-4">
                v{v.version} · {fmtDateTime(v.createdAt)}
              </div>
              <div className="mt-0.5 text-ink">
                {v.previousTotalCents != null ? (
                  <>
                    <span className="text-ink-4 line-through">{money(v.previousTotalCents)}</span>{' '}
                    →{' '}
                  </>
                ) : (
                  'Initial · '
                )}
                <span className="font-semibold">{money(v.newTotalCents)}</span>
              </div>
            </li>
          ))}
          {!data ? (
            <li className="text-ink-4">Loading…</li>
          ) : versions.length === 0 ? (
            <li className="text-ink-4">No revisions.</li>
          ) : null}
        </ol>
      </div>
      <div>
        <h4 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-4">
          Counter-offers
        </h4>
        <div className="space-y-2">
          {counters.map((co) => (
            <div
              key={co.id}
              className="rounded-lg bg-paper p-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.07)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-3">
                  {co.offeredByType === 'business' ? 'You' : 'Supplier'}
                </span>
                <span className="font-semibold text-ink">{money(co.proposedTotalCents)}</span>
                <StatusPill status={co.status} />
              </div>
              {co.proposedPaymentTerms ? (
                <div className="mt-1.5 text-ink-3">Terms: {co.proposedPaymentTerms}</div>
              ) : null}
              {co.message ? <div className="mt-1 italic text-ink-2">“{co.message}”</div> : null}
              <div className="mt-1.5 font-mono text-[10px] text-ink-5">
                {fmtDateTime(co.createdAt)}
              </div>
              {co.status === 'pending' && co.offeredByType !== 'business' ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="success" onClick={() => respond(co.id, true)}>
                    Accept
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => respond(co.id, false)}>
                    Reject
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {data && counters.length === 0 ? (
            <div className="text-ink-4">No counter-offers yet.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ quote card */

function QuoteCard({
  q,
  lines,
  rank,
  bestTotal,
  isBest,
  isFastest,
  isAwarded,
  supplier,
  rfqId,
  rfqStatus,
  act,
  onError,
  refresh,
}: {
  q: QuoteHeader;
  lines: QuoteItem[];
  rank: number;
  bestTotal: number | null;
  isBest: boolean;
  isFastest: boolean;
  isAwarded: boolean;
  supplier: SupplierBrief | undefined;
  rfqId: string;
  rfqStatus: string;
  act: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  onError: (m: string) => void;
  refresh: () => void;
}) {
  const [panel, setPanel] = useState<null | 'award' | 'reject' | 'counter' | 'history'>(null);
  const [showAll, setShowAll] = useState(false);
  const [counterTotal, setCounterTotal] = useState('');
  const [counterMsg, setCounterMsg] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const expired = q.validUntil != null && q.validUntil < Date.now();
  const decided = ['awarded', 'converted_to_order', 'closed', 'cancelled'].includes(rfqStatus);
  const awardable =
    !decided && !expired && ['submitted', 'under_review', 'negotiating'].includes(q.status);
  const delta = bestTotal != null && !isBest ? q.totalCents - bestTotal : 0;
  const shown = showAll ? lines : lines.slice(0, 3);
  const toggle = (p: NonNullable<typeof panel>) => setPanel((cur) => (cur === p ? null : p));

  return (
    <Surface
      className={cn(
        'overflow-hidden p-0 transition-shadow',
        isAwarded ? 'ring-2 ring-volt' : isBest ? 'ring-1 ring-mint/40' : '',
      )}
    >
      {isAwarded ? (
        <div className="flex items-center gap-2 bg-ink px-5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-volt">
          <CheckCircleIcon size={12} /> Awarded quote
        </div>
      ) : null}

      <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start">
        {/* Supplier + price */}
        <div className="flex min-w-0 flex-1 items-start gap-3.5">
          <div className="relative">
            <SupplierAvatar name={supplier?.name ?? 'S'} className="size-11 rounded-xl text-base" />
            <span className="absolute -bottom-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-paper font-mono text-[10px] font-bold text-ink shadow-[0_0_0_1px_rgba(12,14,11,0.12)]">
              {rank}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold text-ink">
                {supplier?.name ?? 'Supplier'}
              </span>
              {supplier?.verified ? (
                <ShieldCheckIcon
                  size={13}
                  className="shrink-0 text-mint"
                  aria-label="Verified supplier"
                />
              ) : null}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-4">
              {supplier && (supplier.city || supplier.district) ? (
                <span className="inline-flex items-center gap-0.5">
                  <MapPinIcon size={10} />
                  {[supplier.city, supplier.district].filter(Boolean).join(', ')}
                </span>
              ) : null}
              {supplier?.reviewAvg != null ? (
                <span>
                  ★ {supplier.reviewAvg.toFixed(1)} ({supplier.reviewCount})
                </span>
              ) : null}
              <span className="font-mono">
                {q.quoteNumber} · v{q.version}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <StatusPill status={expired ? 'expired' : q.status} />
              {isBest ? (
                <Pill tone="success" icon={<TrendingUpIcon size={11} />}>
                  Best price
                </Pill>
              ) : null}
              {isFastest ? (
                <Pill tone="info" icon={<TruckIcon size={11} />}>
                  Fastest
                </Pill>
              ) : null}
              {q.isPartial ? <Pill tone="warning">Partial</Pill> : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 lg:text-right">
          <div className="vyro-metric text-[2rem] leading-none text-ink">{money(q.totalCents)}</div>
          <div className="mt-1.5 text-[11px] text-ink-4">
            Landed total · incl. {money(q.deliveryFeeCents)} delivery
          </div>
          {bestTotal != null ? (
            <div
              className={cn(
                'mt-1 font-mono text-[11px] font-semibold',
                isBest ? 'text-mint' : 'text-rose',
              )}
            >
              {isBest ? 'Lowest quote' : `+${money(delta)} vs best`}
            </div>
          ) : null}
        </div>
      </div>

      {/* Terms */}
      <div className="grid grid-cols-2 gap-px border-y border-ink/[0.06] bg-ink/[0.06] sm:grid-cols-3">
        {[
          { k: 'Payment terms', v: q.paymentTerms || '—' },
          { k: 'Delivery by', v: q.estimatedDeliveryDate ? fmtDate(q.estimatedDeliveryDate) : '—' },
          { k: 'Valid until', v: q.validUntil ? fmtDate(q.validUntil) : '—', danger: expired },
        ].map((t) => (
          <div key={t.k} className="bg-paper px-5 py-3 last:col-span-2 sm:last:col-span-1">
            <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
              {t.k}
            </div>
            <div
              className={cn(
                'mt-1 truncate text-sm font-medium',
                t.danger ? 'text-rose' : 'text-ink-1',
              )}
            >
              {t.v}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {q.isPartial ? (
          <Callout>
            This quote covers only some items. Missing lines are unavailable, not Rs. 0.
          </Callout>
        ) : null}

        <ul className="divide-y divide-ink/[0.06]">
          {shown.map((it, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-4 py-2.5 text-sm first:pt-0"
            >
              <div className="min-w-0">
                <div className="font-medium text-ink">
                  {it.description}
                  {it.isAlternative ? (
                    <span className="ml-2 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#a86c28]">
                      Alternative
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-4">
                  {it.quantity} × {money(it.unitPriceCents)}
                </div>
              </div>
              <div className="shrink-0 font-mono text-sm font-semibold text-ink">
                {money(it.subtotalCents)}
              </div>
            </li>
          ))}
        </ul>
        {lines.length > 3 ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs font-semibold text-copper hover:underline"
          >
            {showAll ? 'Show fewer lines' : `Show all ${lines.length} lines`}
          </button>
        ) : null}

        {q.notes ? (
          <p className="rounded-xl bg-bone/50 px-4 py-3 text-xs italic leading-relaxed text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05)]">
            “{q.notes}”
          </p>
        ) : null}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {awardable ? (
            <Button size="sm" onClick={() => toggle('award')}>
              <CheckCircleIcon size={14} />
              Award quote
            </Button>
          ) : null}
          {!decided ? (
            <Button size="sm" variant="secondary" onClick={() => toggle('counter')}>
              <ScaleIcon size={13} />
              Negotiate
            </Button>
          ) : null}
          {!decided ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void act(
                  () =>
                    api.post(`/rfqs/quotes/${q.id}/request-revision`, {
                      message: 'Please revise your best price.',
                    }),
                  'Revision requested',
                )
              }
            >
              Request revision
            </Button>
          ) : null}
          {awardable ? (
            <Button size="sm" variant="ghost" onClick={() => toggle('reject')}>
              <XIcon size={13} />
              Reject
            </Button>
          ) : null}
          <button
            type="button"
            onClick={() => toggle('history')}
            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-ink-3 transition-colors hover:text-ink"
          >
            History
            <ChevronRightIcon
              size={12}
              className={cn('transition-transform', panel === 'history' && 'rotate-90')}
            />
          </button>
        </div>

        {panel === 'award' ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-volt-soft/60 p-3.5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
            <span className="mr-auto text-sm text-ink">
              Award <span className="font-semibold">{supplier?.name ?? q.quoteNumber}</span> at{' '}
              <span className="font-semibold">{money(q.totalCents)}</span>? Other quotes will be
              closed.
            </span>
            <Button
              size="sm"
              onClick={() => {
                setPanel(null);
                void act(
                  () =>
                    api.post(`/rfqs/${rfqId}/award`, { quoteId: q.id, expectedVersion: q.version }),
                  'Quote awarded',
                );
              }}
            >
              Confirm award
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </div>
        ) : null}

        {panel === 'reject' ? (
          <div className="flex flex-col gap-2 rounded-xl bg-rose/[0.05] p-3.5 shadow-[inset_0_0_0_1px_rgba(196,72,72,0.18)] sm:flex-row">
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason (optional) — shared with the supplier"
              aria-label="Rejection reason"
              className={inputCls('flex-1')}
            />
            <Button
              size="md"
              variant="secondary"
              onClick={() => {
                setPanel(null);
                void act(
                  () =>
                    api.post(`/rfqs/quotes/${q.id}/reject`, {
                      reason: rejectReason.trim() || undefined,
                    }),
                  'Quote rejected',
                );
              }}
            >
              Reject quote
            </Button>
          </div>
        ) : null}

        {panel === 'counter' ? (
          <div className="space-y-2.5 rounded-xl bg-bone/50 p-3.5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-4">
              Counter-offer
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative sm:w-44">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-4">
                  Rs.
                </span>
                <input
                  value={counterTotal}
                  onChange={(e) => setCounterTotal(e.target.value)}
                  placeholder="Total"
                  inputMode="decimal"
                  aria-label="Counter total in rupees"
                  className={inputCls('w-full pl-10 font-mono num-tabular')}
                />
              </div>
              <input
                value={counterMsg}
                onChange={(e) => setCounterMsg(e.target.value)}
                placeholder="Message to supplier"
                aria-label="Counter message"
                className={inputCls('flex-1')}
              />
              <Button
                size="md"
                onClick={() => {
                  const total = Math.round(Number(counterTotal) * 100);
                  if (!(total > 0) || !counterMsg.trim()) {
                    onError('A counter-offer needs a total and a message');
                    return;
                  }
                  void act(
                    () =>
                      api.post(`/rfqs/quotes/${q.id}/counter`, {
                        proposedTotalCents: total,
                        message: counterMsg,
                      }),
                    'Counter-offer sent',
                  ).then(() => {
                    setCounterTotal('');
                    setCounterMsg('');
                    setPanel('history');
                  });
                }}
              >
                Send counter
              </Button>
            </div>
          </div>
        ) : null}

        {panel === 'history' ? <QuoteHistory quoteId={q.id} onChanged={refresh} /> : null}
      </div>
    </Surface>
  );
}

/* ------------------------------------------------------------------ suppliers */

const INVITE_STATUS: Record<string, { label: string; cls: string }> = {
  invited: { label: 'Invited', cls: 'bg-ink/[0.05] text-ink-3' },
  viewed: { label: 'Viewed', cls: 'bg-copper/10 text-copper-deep' },
  quoted: { label: 'Quoted', cls: 'bg-mint/10 text-mint' },
  declined: { label: 'Declined', cls: 'bg-rose/10 text-rose' },
};

function SuppliersCard({
  isOpen,
  invites,
  directory,
  quotedIds,
  canInvite,
  onInvite,
}: {
  isOpen: boolean;
  invites: Invite[];
  directory: Record<string, SupplierBrief>;
  quotedIds: Set<string>;
  canInvite: boolean;
  onInvite: () => void;
}) {
  return (
    <Card
      title="Suppliers"
      icon={<UsersIcon size={14} />}
      actions={
        canInvite ? (
          <button
            type="button"
            onClick={onInvite}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-copper transition-colors hover:bg-copper/10"
          >
            <PlusIcon size={12} /> Invite
          </button>
        ) : null
      }
      bodyClassName="space-y-4"
    >
      <div
        className={cn(
          'flex items-start gap-3 rounded-xl p-3.5',
          isOpen ? 'bg-ink text-paper' : 'bg-bone/60 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]',
        )}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            isOpen ? 'bg-volt text-ink' : 'bg-ink text-volt',
          )}
        >
          {isOpen ? <UsersIcon size={14} /> : <StoreIcon size={14} />}
        </span>
        <div className="min-w-0">
          <div className={cn('text-sm font-semibold', isOpen ? 'text-paper' : 'text-ink')}>
            {isOpen ? 'Open to all suppliers' : 'Private request'}
          </div>
          <p
            className={cn(
              'mt-0.5 text-[11px] leading-relaxed',
              isOpen ? 'text-paper/60' : 'text-ink-4',
            )}
          >
            {isOpen
              ? 'Every active supplier on VYRO can see and quote.'
              : `Only the ${invites.length || ''} supplier${invites.length === 1 ? '' : 's'} you invited can see and quote.`}
          </p>
        </div>
      </div>

      {invites.length > 0 ? (
        <div>
          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-4">
            Invited · {invites.length}
          </div>
          <ul className="space-y-1.5">
            {invites.map((inv) => {
              const s = directory[inv.supplierId];
              const st = quotedIds.has(inv.supplierId) ? 'quoted' : inv.status;
              const chip = INVITE_STATUS[st] ?? {
                label: titleCase(st),
                cls: 'bg-ink/[0.05] text-ink-3',
              };
              return (
                <li key={inv.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <SupplierAvatar name={s?.name ?? 'S'} className="size-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-sm font-medium text-ink-1">
                        {s?.name ?? `Supplier ${inv.supplierId.slice(-4)}`}
                      </span>
                      {s?.verified ? (
                        <ShieldCheckIcon size={11} className="shrink-0 text-mint" />
                      ) : null}
                    </div>
                    <div className="truncate text-[11px] text-ink-4">
                      {s ? [s.city, s.district].filter(Boolean).join(', ') : fmtDate(inv.invitedAt)}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      chip.cls,
                    )}
                  >
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : !isOpen ? (
        <p className="text-sm text-ink-4">No suppliers invited yet.</p>
      ) : null}
    </Card>
  );
}

type SearchRow = { supplier: SupplierBrief; productCount: number };

function InviteDrawer({
  rfqId,
  productIds,
  invitedIds,
  onClose,
  onDone,
}: {
  rfqId: string;
  productIds: string[];
  invitedIds: Set<string>;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<Map<string, SupplierBrief>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const productKey = [...new Set(productIds)].sort().join(',');
  const total = productKey ? productKey.split(',').length : 0;
  const search = useQuery({
    queryKey: ['rfq-supplier-search', debounced, productKey],
    queryFn: async (): Promise<SearchRow[]> => {
      try {
        const r = await api.get<{ suppliers: SearchRow[] }>(
          `/rfqs/supplier-search?q=${encodeURIComponent(debounced)}&productIds=${encodeURIComponent(productKey)}`,
        );
        return r.suppliers;
      } catch {
        // Older API without supplier search: fall back to coverage-ranked suggestions.
        const r = await api.get<{
          suppliers: Array<{
            supplier: {
              id: string;
              name: string;
              city?: string | null;
              district?: string | null;
              verificationStatus?: string;
              reviewAvg?: number;
              reviewCount?: number;
            };
            productCount?: number;
          }>;
        }>(`/rfqs/${rfqId}/suppliers/discover`);
        const needle = debounced.toLowerCase();
        return r.suppliers
          .map((x) => ({
            supplier: {
              id: x.supplier.id,
              name: x.supplier.name,
              city: x.supplier.city ?? null,
              district: x.supplier.district ?? null,
              verified: x.supplier.verificationStatus === 'verified',
              reviewAvg: x.supplier.reviewCount ? (x.supplier.reviewAvg ?? 0) / 100 : null,
              reviewCount: x.supplier.reviewCount ?? 0,
            },
            productCount: x.productCount ?? 0,
          }))
          .filter(
            (x) =>
              !needle ||
              `${x.supplier.name} ${x.supplier.city ?? ''} ${x.supplier.district ?? ''}`
                .toLowerCase()
                .includes(needle),
          );
      }
    },
    staleTime: 30_000,
  });
  const rows = search.data ?? [];

  function toggle(s: SupplierBrief) {
    const next = new Map(picked);
    if (next.has(s.id)) next.delete(s.id);
    else next.set(s.id, s);
    setPicked(next);
  }
  async function submit() {
    if (picked.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/rfqs/${rfqId}/invite`, { supplierIds: [...picked.keys()] });
      onDone(picked.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Invite suppliers"
        className="relative flex h-full w-full max-w-md flex-col bg-paper shadow-[0_0_80px_-20px_rgba(12,14,11,0.5)]"
      >
        <div className="relative overflow-hidden bg-ink px-6 pb-5 pt-6 text-paper">
          <div
            className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-volt/15 blur-3xl"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-volt">
                Invite suppliers
              </div>
              <h2 className="mt-1.5 font-display text-xl font-bold">Who else should quote?</h2>
              <p className="mt-1 text-xs text-paper/55">
                Suppliers who sell your items are listed first.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-paper/60 transition-colors hover:bg-paper/10 hover:text-paper"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="relative mt-4">
            <SearchIcon
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper/40"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, city or district…"
              aria-label="Search suppliers"
              className="h-10 w-full rounded-lg bg-paper/[0.08] pl-9 pr-3 text-sm text-paper placeholder:text-paper/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] focus:outline-none focus:shadow-[inset_0_0_0_1px_rgba(198,220,74,0.7)]"
            />
          </div>
        </div>

        <ul className="flex-1 space-y-1.5 overflow-y-auto p-4">
          {search.isLoading ? (
            [0, 1, 2, 3].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl bg-ink/[0.05]" />
            ))
          ) : rows.length === 0 ? (
            <li className="py-10 text-center text-sm text-ink-4">No suppliers match.</li>
          ) : (
            rows.map(({ supplier: s, productCount }) => {
              const already = invitedIds.has(s.id);
              const on = already || picked.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={already}
                    onClick={() => toggle(s)}
                    aria-pressed={on}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                      already
                        ? 'cursor-default border-ink/[0.06] bg-bone/40 opacity-70'
                        : on
                          ? 'border-ink bg-ink/[0.04]'
                          : 'border-ink/10 hover:border-ink/25 hover:bg-bone/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                        on ? 'border-ink bg-ink text-volt' : 'border-ink/25 bg-paper',
                      )}
                    >
                      {on ? <CheckIcon size={12} /> : null}
                    </span>
                    <SupplierAvatar name={s.name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-ink-1">{s.name}</span>
                        {s.verified ? (
                          <ShieldCheckIcon size={12} className="shrink-0 text-mint" />
                        ) : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-4">
                        <span className="inline-flex items-center gap-0.5">
                          <MapPinIcon size={10} />
                          {[s.city, s.district].filter(Boolean).join(', ') || '—'}
                        </span>
                        {s.reviewAvg != null ? <span>★ {s.reviewAvg.toFixed(1)}</span> : null}
                        {already ? (
                          <span className="font-semibold text-ink-3">Already invited</span>
                        ) : null}
                      </span>
                    </span>
                    {total > 0 ? (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold',
                          productCount > 0
                            ? 'bg-volt-soft text-volt-deep'
                            : 'bg-ink/[0.05] text-ink-4',
                        )}
                      >
                        {productCount}/{total}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="space-y-2 border-t border-ink/[0.08] bg-bone/40 p-4">
          {error ? <ErrorBanner message={error} /> : null}
          <Button
            className="w-full"
            disabled={picked.size === 0 || busy}
            onClick={() => void submit()}
          >
            {busy
              ? 'Inviting…'
              : picked.size === 0
                ? 'Select suppliers to invite'
                : `Invite ${picked.size} supplier${picked.size === 1 ? '' : 's'}`}
            {picked.size > 0 && !busy ? <ArrowRightIcon size={13} /> : null}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ next step */

function NextStep({
  status,
  quoteCount,
  isOpen,
  inviteCount,
  bestName,
  convertedPoId,
  onPublish,
  onInvite,
  onConvert,
  onReopen,
  rfqId,
}: {
  status: string;
  quoteCount: number;
  isOpen: boolean;
  inviteCount: number;
  bestName: string | null;
  convertedPoId: string | null | undefined;
  onPublish: () => void;
  onInvite: () => void;
  onConvert: () => void;
  onReopen: () => void;
  rfqId: string;
}) {
  let icon: ReactNode = <SparklesIcon size={18} />;
  let title = '';
  let body = '';
  let cta: ReactNode = null;

  if (status === 'draft') {
    title = 'Publish to start receiving quotes';
    body = isOpen
      ? 'All active suppliers on VYRO will be notified once you publish.'
      : inviteCount
        ? `${inviteCount} invited supplier${inviteCount === 1 ? '' : 's'} will be notified once you publish.`
        : 'Invite at least one supplier, or publish it as open to everyone.';
    cta = (
      <Button onClick={onPublish}>
        Publish RFQ <ArrowRightIcon size={13} />
      </Button>
    );
  } else if (OPEN_STATES.has(status) && quoteCount === 0) {
    icon = <ClockIcon size={18} />;
    title = 'Waiting for suppliers to quote';
    body = isOpen
      ? 'Your request is visible to every supplier. Quotes appear here as soon as they are submitted.'
      : 'Only invited suppliers can quote. Invite more to widen your price range.';
    cta = (
      <Button variant="secondary" onClick={onInvite}>
        <PlusIcon size={13} /> Invite suppliers
      </Button>
    );
  } else if (OPEN_STATES.has(status)) {
    icon = <ScaleIcon size={18} />;
    title = `${quoteCount} quote${quoteCount === 1 ? '' : 's'} in — compare and award`;
    body = bestName
      ? `${bestName} currently has the lowest landed price. Negotiate, or award when you're ready.`
      : 'Review the quotes below and award the best one.';
    cta = (
      <Link
        to={`/rfqs/${rfqId}/compare`}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink/90"
      >
        <ScaleIcon size={14} /> Compare side by side
      </Link>
    );
  } else if (status === 'awarded') {
    icon = <CheckCircleIcon size={18} />;
    title = 'Quote awarded — create the purchase order';
    body = 'Turn the awarded quote into an order. The supplier is notified and fulfilment begins.';
    cta = (
      <Button onClick={onConvert}>
        Create order <ArrowRightIcon size={13} />
      </Button>
    );
  } else if (status === 'converted_to_order') {
    icon = <PackageIcon size={18} />;
    title = 'This RFQ became an order';
    body = 'Track delivery, payment and returns on the order page.';
    cta = convertedPoId ? (
      <Link
        to={`/orders/${convertedPoId}`}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-colors hover:bg-ink/90"
      >
        View order <ArrowRightIcon size={13} />
      </Link>
    ) : null;
  } else if (status === 'expired') {
    icon = <AlertTriangleIcon size={18} />;
    title = 'This RFQ expired';
    body = 'The deadline passed. Reopen it to accept more quotes.';
    cta = (
      <Button variant="secondary" onClick={onReopen}>
        Reopen RFQ
      </Button>
    );
  } else {
    return null;
  }

  return (
    <Surface className="relative overflow-hidden p-0">
      <span className="absolute inset-y-0 left-0 w-1 bg-volt" aria-hidden />
      <div className="flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-volt">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink-4">
            Next step
          </div>
          <div className="mt-0.5 font-display text-base font-bold text-ink">{title}</div>
          <p className="mt-0.5 text-sm text-ink-3">{body}</p>
        </div>
        {cta ? <div className="shrink-0">{cta}</div> : null}
      </div>
    </Surface>
  );
}

/* ------------------------------------------------------------------ page */

function SkeletonDetail() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6">
      <div className="h-72 rounded-2xl bg-bone" />
      <div className="h-24 rounded-xl bg-bone" />
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="h-96 rounded-xl bg-bone lg:col-span-8" />
        <div className="h-96 rounded-xl bg-bone lg:col-span-4" />
      </div>
    </div>
  );
}

export function RfqDetailPage() {
  const { id } = useParams();
  usePageTitle('RFQ detail');
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const detail = useQuery({
    queryKey: ['rfq', id],
    queryFn: () =>
      api.get<{
        rfq: RfqHeader;
        items: RfqItem[];
        invites?: Invite[];
        events?: RfqEvent[];
        supplierDirectory?: Record<string, SupplierBrief>;
      }>(`/rfqs/${id}`),
    enabled: !!id,
  });
  const quotes = useQuery({
    queryKey: ['rfq-quotes', id],
    queryFn: () =>
      api.get<{
        quotes: Array<{
          quote: Record<string, unknown>;
          items: Array<Record<string, unknown>>;
          tiers: Array<Record<string, unknown>>;
        }>;
      }>(`/rfqs/${id}/quotes`),
    enabled: !!id,
  });
  const compare = useQuery({
    queryKey: ['rfq-compare', id],
    queryFn: () =>
      api.get<{
        quotes: unknown[];
        bestPriceQuoteId: string | null;
        fastestQuoteId: string | null;
        splitOptimization: { splitItemsTotalCents: number; supplierCount: number };
      }>(`/rfqs/${id}/compare`),
    enabled: !!id,
  });
  const ai = useQuery({
    queryKey: ['rfq-ai', id],
    queryFn: () =>
      api.get<{ recommendation: string; bestQuoteId: string | null; summary: string }>(
        `/rfqs/${id}/ai-summary`,
      ),
    enabled: !!id,
  });
  const messages = useQuery({
    queryKey: ['rfq-msgs', id],
    queryFn: () =>
      api.get<{
        messages: Array<{ id: string; senderType: string; message: string; createdAt: number }>;
      }>(`/rfqs/${id}/messages`),
    enabled: !!id,
  });

  const rfq = detail.data?.rfq;
  const quoteList = quotes.data?.quotes ?? [];
  const itemList = detail.data?.items ?? [];
  const invites = detail.data?.invites ?? [];
  const events = useMemo(
    () => [...(detail.data?.events ?? [])].sort((a, b) => b.createdAt - a.createdAt),
    [detail.data?.events],
  );
  const directory = detail.data?.supplierDirectory ?? {};

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['rfq', id] });
    void qc.invalidateQueries({ queryKey: ['rfq-quotes', id] });
    void qc.invalidateQueries({ queryKey: ['rfq-compare', id] });
  };
  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setError(null);
    try {
      await fn();
      toast.show(toast.success(okMsg));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  if (!rfq) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        {detail.isLoading ? (
          <SkeletonDetail />
        ) : (
          <Surface className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4">
              <FileTextIcon size={22} />
            </span>
            <h2 className="font-display text-lg font-bold text-ink">RFQ not found</h2>
            <p className="text-sm text-ink-4">
              It may have been removed, or you may not have access to it.
            </p>
            <Link
              to="/rfqs"
              className="mt-2 text-sm font-semibold text-ink underline underline-offset-4"
            >
              Back to all RFQs
            </Link>
          </Surface>
        )}
      </div>
    );
  }

  const isOpen = !!rfq.isOpen;
  const cd = countdown(rfq.deadline);
  const chip = STATUS_CHIP[rfq.status] ?? { label: titleCase(rfq.status), dot: 'bg-paper/50' };
  const headers = quoteList.map((x) => x.quote as unknown as QuoteHeader);
  const bestId = compare.data?.bestPriceQuoteId ?? null;
  const bestHeader = headers.find((q) => q.id === bestId);
  const bestTotal = bestHeader?.totalCents ?? null;
  const bestName = bestHeader
    ? (directory[bestHeader.supplierId]?.name ?? bestHeader.quoteNumber)
    : null;
  const quotedIds = new Set(headers.map((q) => q.supplierId));
  const invitedIds = new Set(invites.map((i) => i.supplierId));
  const canInvite = rfq.status === 'draft' || OPEN_STATES.has(rfq.status);
  const productIds = itemList.map((i) => i.productId).filter(Boolean) as string[];
  const targetTotal = itemList.reduce((s, i) => s + (i.targetPriceCents ?? 0) * i.quantity, 0);

  // Rank quotes: awarded first, then by landed total.
  const ranked = quoteList
    .map((x) => ({
      q: x.quote as unknown as QuoteHeader,
      lines: x.items as unknown as QuoteItem[],
    }))
    .sort((a, b) => {
      if (a.q.id === rfq.awardedQuoteId) return -1;
      if (b.q.id === rfq.awardedQuoteId) return 1;
      return a.q.totalCents - b.q.totalCents;
    });

  const publish = () => void act(() => api.post(`/rfqs/${id}/publish`, {}), 'RFQ published');
  const reopen = () => void act(() => api.post(`/rfqs/${id}/reopen`, {}), 'RFQ reopened');
  const convert = () =>
    void act(async () => {
      const r = await api.post<{ poId: string }>(`/rfqs/${id}/convert`, {});
      navigate(`/orders/${r.poId}`);
    }, 'Purchase order created');

  const brief: Array<{ k: string; v: ReactNode }> = [];
  const where = [rfq.deliveryLocation, rfq.deliveryCity, rfq.deliveryDistrict]
    .filter(Boolean)
    .join(', ');
  if (where) brief.push({ k: 'Deliver to', v: where });
  if (rfq.requiredDeliveryDate)
    brief.push({ k: 'Needed by', v: fmtDate(rfq.requiredDeliveryDate) });
  if (rfq.paymentMethod || rfq.paymentTerms)
    brief.push({
      k: 'Payment',
      v: [rfq.paymentMethod && titleCase(rfq.paymentMethod), rfq.paymentTerms]
        .filter(Boolean)
        .join(' · '),
    });
  if (rfq.deliveryRequirements) brief.push({ k: 'Delivery', v: rfq.deliveryRequirements });
  if (rfq.specifications) brief.push({ k: 'Specifications', v: rfq.specifications });
  if (rfq.qualityRequirements) brief.push({ k: 'Quality', v: rfq.qualityRequirements });
  if (rfq.packagingRequirements) brief.push({ k: 'Packaging', v: rfq.packagingRequirements });
  if (rfq.brandPreferences) brief.push({ k: 'Brands', v: rfq.brandPreferences });
  if (rfq.notes) brief.push({ k: 'Notes', v: rfq.notes });

  const msgList = messages.data?.messages ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-20">
      <Link
        to="/rfqs"
        className="group flex w-fit items-center gap-1.5 rounded-full bg-paper py-1 pl-2 pr-3 text-xs font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
      >
        <ArrowLeftIcon size={13} className="transition-transform group-hover:-translate-x-0.5" />
        All RFQs
      </Link>

      {/* ------------------------------------------------ hero */}
      <Surface kind="ink" className="grain overflow-hidden rounded-2xl p-0 shadow-soft-lg">
        <div
          className="pointer-events-none absolute -right-24 -top-32 size-96 rounded-full bg-volt/[0.13] blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 size-80 rounded-full bg-copper/25 blur-3xl"
          aria-hidden
        />

        <div className="relative p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-volt">
                <FileTextIcon size={13} />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(rfq.rfqNumber);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                  }}
                  className="group inline-flex items-center gap-1.5 rounded-md transition-colors hover:text-paper"
                  title="Copy RFQ number"
                >
                  {rfq.rfqNumber}
                  {copied ? (
                    <CheckIcon size={11} />
                  ) : (
                    <CopyIcon size={11} className="opacity-50 group-hover:opacity-100" />
                  )}
                </button>
                <span className="text-paper/30">·</span>
                <span className="text-paper/50">Request for quotation</span>
              </div>
              <h1 className="vyro-display mt-3 text-3xl font-bold leading-[1.05] text-paper sm:text-[2.6rem]">
                {rfq.title}
              </h1>
              {rfq.description ? (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/60">
                  {rfq.description}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/[0.06] px-3 py-1 text-xs font-semibold text-paper">
                  <span className={cn('size-2 rounded-full', chip.dot)} />
                  {chip.label}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 bg-paper/[0.06] px-3 py-1 text-xs font-medium text-paper/75">
                  {isOpen ? <UsersIcon size={12} /> : <StoreIcon size={12} />}
                  {isOpen
                    ? 'All suppliers'
                    : `${invites.length} invited supplier${invites.length === 1 ? '' : 's'}`}
                </span>
                {where ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 bg-paper/[0.06] px-3 py-1 text-xs font-medium text-paper/75">
                    <MapPinIcon size={12} />
                    {rfq.deliveryCity || rfq.deliveryDistrict || where}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {rfq.status === 'draft' ? (
                <button type="button" className={heroBtnPrimary} onClick={publish}>
                  Publish <ArrowRightIcon size={13} />
                </button>
              ) : null}
              {rfq.status === 'awarded' ? (
                <button type="button" className={heroBtnPrimary} onClick={convert}>
                  Create order <ArrowRightIcon size={13} />
                </button>
              ) : null}
              {rfq.status === 'expired' ? (
                <button type="button" className={heroBtn} onClick={reopen}>
                  Reopen
                </button>
              ) : null}
              {quoteList.length > 0 ? (
                <Link to={`/rfqs/${id}/compare`} className={heroBtn}>
                  <ScaleIcon size={13} /> Compare quotes
                </Link>
              ) : null}
              {['open', 'quoting', 'quotes_received', 'under_review'].includes(rfq.status) ? (
                <button
                  type="button"
                  className={heroBtn}
                  onClick={() => void act(() => api.post(`/rfqs/${id}/close`, {}), 'RFQ closed')}
                >
                  Close RFQ
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-paper/10 bg-paper/[0.03] px-4 py-4 sm:px-6">
            <RfqStepper status={rfq.status} quoteCount={quoteList.length} />
          </div>
        </div>

        <div className="relative grid grid-cols-2 divide-paper/10 border-t border-paper/10 px-6 sm:px-3 lg:grid-cols-4 lg:divide-x">
          <HeroStat
            label="Items"
            value={itemList.length}
            sub={
              targetTotal > 0
                ? `Target ${money(targetTotal)}`
                : `${itemList.reduce((s, i) => s + i.quantity, 0).toLocaleString()} units requested`
            }
          />
          <HeroStat
            label="Quotes"
            value={quoteList.length}
            sub={
              isOpen
                ? 'Open to all suppliers'
                : invites.length
                  ? `from ${invites.length} invited`
                  : 'No invites yet'
            }
          />
          <HeroStat
            label="Best landed"
            value={bestTotal != null ? money(bestTotal) : '—'}
            sub={bestName ?? 'Appears once quotes arrive'}
            tone={bestTotal != null ? 'volt' : undefined}
          />
          <HeroStat
            label="Closes"
            value={cd ? cd.text : 'No deadline'}
            sub={
              rfq.deadline
                ? `${fmtDate(rfq.deadline)} · ${new Date(rfq.deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                : 'Open until you close it'
            }
            tone={cd?.danger ? 'rose' : undefined}
          />
        </div>
      </Surface>

      {error ? <ErrorBanner message={error} /> : null}

      <NextStep
        status={rfq.status}
        quoteCount={quoteList.length}
        isOpen={isOpen}
        inviteCount={invites.length}
        bestName={bestName}
        convertedPoId={rfq.convertedPoId}
        onPublish={publish}
        onInvite={() => setInviteOpen(true)}
        onConvert={convert}
        onReopen={reopen}
        rfqId={id!}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------ main */}
        <div className="space-y-10 lg:col-span-8">
          <section className="space-y-4">
            <SectionHead
              title="Quotations"
              count={quoteList.length}
              description={quoteList.length ? 'Ranked by landed total — lowest first.' : undefined}
              actions={
                compare.data && compare.data.splitOptimization.supplierCount > 1 ? (
                  <Pill tone="warning" icon={<TruckIcon size={11} />}>
                    Split across {compare.data.splitOptimization.supplierCount} suppliers from{' '}
                    {money(compare.data.splitOptimization.splitItemsTotalCents)}
                  </Pill>
                ) : null
              }
            />

            {quoteList.length === 0 ? (
              <Surface className="relative overflow-hidden px-6 py-14 text-center">
                <div
                  className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-volt/10 blur-3xl"
                  aria-hidden
                />
                <div className="relative mx-auto flex max-w-sm flex-col items-center gap-3">
                  <span className="relative flex size-14 items-center justify-center rounded-2xl bg-ink text-volt">
                    <ClockIcon size={22} />
                    {OPEN_STATES.has(rfq.status) ? (
                      <span className="absolute -right-1 -top-1 size-3 animate-ping rounded-full bg-volt" />
                    ) : null}
                  </span>
                  <h3 className="font-display text-lg font-bold text-ink">
                    {rfq.status === 'draft' ? 'Not published yet' : 'No quotes yet'}
                  </h3>
                  <p className="text-sm text-ink-4">
                    {rfq.status === 'draft'
                      ? 'Suppliers can’t see this request until you publish it.'
                      : isOpen
                        ? 'Every supplier on VYRO has been notified. Quotes appear here as they arrive.'
                        : 'Your invited suppliers have been notified. Quotes appear here as they arrive.'}
                  </p>
                  {canInvite && rfq.status !== 'draft' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-1"
                      onClick={() => setInviteOpen(true)}
                    >
                      <PlusIcon size={13} /> Invite more suppliers
                    </Button>
                  ) : null}
                </div>
              </Surface>
            ) : (
              <div className="space-y-4">
                {ranked.map(({ q, lines }, i) => (
                  <QuoteCard
                    key={q.id}
                    q={q}
                    lines={lines}
                    rank={i + 1}
                    bestTotal={bestTotal}
                    isBest={q.id === bestId}
                    isFastest={q.id === compare.data?.fastestQuoteId && quoteList.length > 1}
                    isAwarded={q.id === rfq.awardedQuoteId}
                    supplier={directory[q.supplierId]}
                    rfqId={id!}
                    rfqStatus={rfq.status}
                    act={act}
                    onError={setError}
                    refresh={refresh}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <SectionHead
              title="Messages"
              description="Clarify specs, delivery and terms with suppliers."
            />
            <Surface className="flex flex-col overflow-hidden p-0">
              <div className="max-h-[26rem] min-h-48 space-y-4 overflow-y-auto bg-gradient-to-b from-bone/30 to-transparent p-5 scrollbar-thin">
                {msgList.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-bone text-ink-4">
                      <MailIcon size={18} />
                    </span>
                    <p className="text-sm text-ink-4">
                      No messages yet. Ask suppliers anything below.
                    </p>
                  </div>
                ) : null}
                {msgList.map((m) => {
                  const mine = m.senderType === 'buyer' || m.senderType === 'business';
                  return (
                    <div
                      key={m.id}
                      className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                          mine
                            ? 'rounded-br-md bg-ink text-paper'
                            : 'rounded-bl-md bg-paper text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]',
                        )}
                      >
                        {m.message}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-ink-5">
                        {mine ? 'You' : 'Supplier'} · {fmtDateTime(m.createdAt)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <form
                className="flex gap-2 border-t border-ink/[0.07] bg-paper p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!msg.trim()) return;
                  const m = msg;
                  setMsg('');
                  void act(() => api.post(`/rfqs/${id}/messages`, { message: m }), 'Sent').then(
                    () => void qc.invalidateQueries({ queryKey: ['rfq-msgs', id] }),
                  );
                }}
              >
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="Write a message to suppliers…"
                  aria-label="Message"
                  className={inputCls('flex-1')}
                />
                <Button type="submit" size="md" disabled={!msg.trim()}>
                  Send <ArrowRightIcon size={13} />
                </Button>
              </form>
            </Surface>
          </section>

          <section className="space-y-4">
            <SectionHead
              title="Documents"
              description="Specifications, certificates and reference files shared with suppliers."
            />
            <RfqDocsUpload rfqId={id!} />
          </section>
        </div>

        {/* ------------------------------------------------ aside */}
        <aside className="space-y-5 lg:col-span-4">
          <Card
            title="Requested items"
            icon={<PackageIcon size={14} />}
            actions={<span className="font-mono text-[11px] text-ink-4">{itemList.length}</span>}
            bodyClassName="p-2"
          >
            {itemList.length === 0 ? (
              <p className="p-3 text-sm text-ink-4">No line items recorded.</p>
            ) : (
              <ul>
                {itemList.map((it) => {
                  const inner = (
                    <>
                      <OrderItemThumb
                        productId={it.productId}
                        name={it.description}
                        className="size-11 rounded-lg"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink-1">
                          {it.description}
                        </div>
                        <div className="mt-0.5 text-[11px] text-ink-4">
                          {it.targetPriceCents
                            ? `Target ${money(it.targetPriceCents)} / ${it.unit}`
                            : it.productId
                              ? 'Catalog product'
                              : 'Custom item'}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-sm font-bold text-ink">
                          {it.quantity.toLocaleString()}
                        </div>
                        <div className="font-mono text-[10px] uppercase text-ink-4">{it.unit}</div>
                      </div>
                    </>
                  );
                  return (
                    <li key={it.id}>
                      {it.productId ? (
                        <Link
                          to={`/products/${it.productId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-bone/60"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl p-2.5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <SuppliersCard
            isOpen={isOpen}
            invites={invites}
            directory={directory}
            quotedIds={quotedIds}
            canInvite={canInvite}
            onInvite={() => setInviteOpen(true)}
          />

          {brief.length > 0 ? (
            <Card title="Requirements" icon={<FileTextIcon size={14} />}>
              <dl className="space-y-3">
                {brief.map((b) => (
                  <div key={b.k}>
                    <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                      {b.k}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ink-2">
                      {b.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          <Surface className="relative overflow-hidden p-5">
            <div
              className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full bg-volt/20 blur-2xl"
              aria-hidden
            />
            <div className="relative space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-[9px] bg-ink text-volt">
                  <SparklesIcon size={14} />
                </span>
                <h3 className="font-display text-[15px] font-bold text-ink">VYRO quote analysis</h3>
              </div>
              <p className="text-sm leading-relaxed text-ink-2">
                {quoteList.length === 0
                  ? 'Analysis appears once suppliers start quoting.'
                  : (ai.data?.recommendation ?? 'Analysing quotes…')}
              </p>
              {ai.data?.summary && quoteList.length > 0 ? (
                <pre className="whitespace-pre-wrap rounded-xl bg-bone/60 p-3 font-sans text-xs leading-relaxed text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                  {ai.data.summary}
                </pre>
              ) : null}
            </div>
          </Surface>

          <Card title="Activity" icon={<CalendarIcon size={14} />}>
            {events.length === 0 ? (
              <p className="text-sm text-ink-4">No activity yet.</p>
            ) : (
              <ol className="relative max-h-80 space-y-4 overflow-y-auto pl-5 scrollbar-thin">
                <span className="absolute bottom-1 left-[5px] top-1 w-px bg-ink/10" aria-hidden />
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span
                      className={cn(
                        'absolute -left-5 top-1 size-[11px] rounded-full ring-4 ring-paper',
                        i === 0 ? 'bg-volt shadow-[0_0_0_1px_rgba(12,14,11,0.3)]' : 'bg-ink/25',
                      )}
                      aria-hidden
                    />
                    <div className="text-sm font-medium text-ink">
                      {titleCase(e.action)}
                      {e.toStatus ? (
                        <span className="font-normal text-ink-4">
                          {' '}
                          → {STATUS_CHIP[e.toStatus]?.label ?? titleCase(e.toStatus)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-5">
                      {fmtDateTime(e.createdAt)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>

      {inviteOpen ? (
        <InviteDrawer
          rfqId={id!}
          productIds={productIds}
          invitedIds={invitedIds}
          onClose={() => setInviteOpen(false)}
          onDone={(n) => {
            setInviteOpen(false);
            toast.show(toast.success(`Invited ${n} supplier${n === 1 ? '' : 's'}`));
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}
