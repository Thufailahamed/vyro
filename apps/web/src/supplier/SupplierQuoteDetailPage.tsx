import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, useToast } from '@vyro/ui';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { useSupplierId } from './useSupplierId';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { StatusPill } from '@/pages/RfqsPage';
import { RfqDocsUpload } from '@/components/RfqDocsUpload';
import { OrderItemThumb } from '@/components/orders/OrderItemThumb';
import { AiQuoteCopilotCard } from './components/AiQuoteCopilotCard';
import type { AiQuoteDraft } from '@vyro/ai';
import { useLead, useSetLeadTag } from './useLeadManager';
import { TagPicker } from './crm/TagPicker';
import { ConversionBadge } from './crm/ConversionBadge';
import { VerifiedBuyerBadge } from './crm/VerifiedBuyerBadge';
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BanknoteIcon,
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  LayersIcon,
  MailIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  StoreIcon,
  TargetIcon,
  TruckIcon,
  UserIcon,
  XIcon,
} from '@/components/icons';

interface QuoteLine {
  rfqItemId?: string | undefined;
  productId?: string | undefined;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  isAlternative?: boolean | undefined;
  alternativeFor?: string | undefined;
  notes?: string | undefined;
  tierQty?: string | undefined;
  tierPrice?: string | undefined;
}
interface CounterRow {
  id: string;
  offeredByType: string;
  proposedTotalCents: number;
  message?: string | null;
  status: string;
  createdAt: number;
}
type RfqItem = {
  id: string;
  productId?: string;
  description: string;
  quantity: number;
  unit: string;
  targetPriceCents?: number;
  specifications?: string;
};
type RfqView = {
  title: string;
  rfqNumber: string;
  status: string;
  description?: string | null;
  deliveryLocation?: string;
  deliveryCity?: string;
  deliveryDistrict?: string;
  requiredDeliveryDate?: number;
  deadline?: number;
  paymentTerms?: string;
  paymentMethod?: string;
  specifications?: string;
  packagingRequirements?: string;
  qualityRequirements?: string;
  brandPreferences?: string;
  deliveryRequirements?: string;
  notes?: string;
  isOpen?: number | boolean;
};
type MyQuote = {
  quote: {
    id: string;
    status: string;
    version: number;
    totalCents: number;
    quoteNumber: string;
    validUntil?: number;
    isPartial?: number | boolean;
  };
  items: unknown[];
};

const toCents = (s: string | undefined) => Math.round(Number(s || 0) * 100);
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
const QUOTABLE = new Set(['open', 'quoting', 'quotes_received', 'under_review', 'negotiating']);

function countdown(ts: number | undefined): { text: string; danger: boolean } | null {
  if (!ts) return null;
  const diff = ts - Date.now();
  if (diff <= 0) return { text: 'Closed', danger: true };
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { text: `${mins}m left`, danger: true };
  const hours = Math.floor(mins / 60);
  if (hours < 24) return { text: `${hours}h left`, danger: hours < 6 };
  return { text: `${Math.floor(hours / 24)}d left`, danger: false };
}

const fieldCls =
  'h-10 w-full rounded-lg bg-paper px-3 text-sm text-ink placeholder:text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.24)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_3px_rgba(198,220,74,0.35)]';

/* ------------------------------------------------------------------ building blocks */

function Card({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Surface className={cn('overflow-hidden p-0', className)}>
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

function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-4">{hint}</span> : null}
    </label>
  );
}

function MoneyInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-ink-4">
        Rs.
      </span>
      <input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        inputMode="decimal"
        aria-label={ariaLabel}
        className={cn(fieldCls, 'pl-10 font-mono num-tabular')}
      />
    </div>
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
    <div className="min-w-0 px-5 py-4">
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

/* ------------------------------------------------------------------ counters */

function CounterOffers({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['sup-counters', quoteId],
    queryFn: () =>
      api
        .get<{ counters: CounterRow[] }>(`/rfqs/quotes/${quoteId}/history`)
        .then((r) => ({ counters: r.counters })),
  });
  const pending = (data?.counters ?? []).filter(
    (c) => c.status === 'pending' && c.offeredByType !== 'supplier',
  );
  if (!pending.length) return null;
  const respond = (id: string, accept: boolean) =>
    void api.post(`/rfqs/counters/${id}/respond`, { accept }).then(() => {
      void qc.invalidateQueries({ queryKey: ['sup-counters', quoteId] });
      onChanged();
    });
  return (
    <Surface className="relative overflow-hidden p-0 ring-1 ring-copper/30">
      <span className="absolute inset-y-0 left-0 w-1 bg-copper" aria-hidden />
      <div className="space-y-3 p-5 pl-6">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-copper/10 text-copper">
            <BanknoteIcon size={16} />
          </span>
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-copper">
              Action needed
            </div>
            <div className="font-display text-base font-bold text-ink">
              The buyer sent a counter-offer
            </div>
          </div>
        </div>
        {pending.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-3 rounded-xl bg-bone/60 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="vyro-metric text-2xl leading-none text-ink">
                {formatLKR(c.proposedTotalCents)}
              </div>
              {c.message ? <p className="mt-1.5 text-sm italic text-ink-3">“{c.message}”</p> : null}
              <div className="mt-1 font-mono text-[10px] text-ink-5">
                {fmtDateTime(c.createdAt)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="success" onClick={() => respond(c.id, true)}>
                <CheckIcon size={13} /> Accept
              </Button>
              <Button size="sm" variant="secondary" onClick={() => respond(c.id, false)}>
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Surface>
  );
}

/* ------------------------------------------------------------------ page */

export function SupplierQuoteDetailPage() {
  const { rfqId } = useParams();
  usePageTitle('Quote request');
  const { supplierId } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [validDays, setValidDays] = useState('14');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tiersOpen, setTiersOpen] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const detail = useQuery({
    queryKey: ['sup-rfq', rfqId],
    queryFn: () =>
      api.post<{
        rfq: RfqView;
        business: { name: string; city?: string; district?: string } | null;
        items: RfqItem[];
      }>('/rfqs/supplier/view', { rfqId, supplierId }),
    enabled: !!rfqId && !!supplierId,
  });
  const mine = useQuery({
    queryKey: ['sup-quotes', rfqId, supplierId],
    queryFn: () => api.get<{ quotes: MyQuote[] }>(`/rfqs/${rfqId}/quotes?supplierId=${supplierId}`),
    enabled: !!rfqId && !!supplierId,
  });
  const myQuote = mine.data?.quotes[0]?.quote;
  const thread = useQuery({
    queryKey: ['sup-thread', rfqId, myQuote?.id],
    queryFn: () =>
      api.get<{
        messages: Array<{ id: string; senderType: string; message: string; createdAt: number }>;
      }>(`/rfqs/${rfqId}/messages?quoteId=${myQuote!.id}`),
    enabled: !!rfqId && !!myQuote,
  });

  const items = detail.data?.items ?? [];
  useEffect(() => {
    if (lines.length === 0 && items.length > 0) {
      setLines(
        items.map((i) => ({
          rfqItemId: i.id,
          ...(i.productId ? { productId: i.productId } : {}),
          description: i.description,
          quantity: String(i.quantity),
          unitPrice: i.targetPriceCents ? String(i.targetPriceCents / 100) : '',
          discount: '0',
        })),
      );
    }
  }, [items, lines.length]);

  const update = (i: number, patch: Partial<QuoteLine>) =>
    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  const addSubstitute = (i: number) =>
    setLines((ls) => {
      const src = ls[i]!;
      const copy: QuoteLine = {
        description: '',
        quantity: src.quantity,
        unitPrice: '',
        discount: '0',
        isAlternative: true,
        alternativeFor: src.rfqItemId,
      };
      return [...ls.slice(0, i + 1), copy, ...ls.slice(i + 1)];
    });

  const lineTotal = (l: QuoteLine) =>
    Math.max(0, Number(l.quantity || 0) * toCents(l.unitPrice) - toCents(l.discount));
  const priced = lines.filter(
    (l) =>
      l.description.trim() &&
      Number(l.quantity) > 0 &&
      l.unitPrice.trim() !== '' &&
      Number(l.unitPrice) >= 0,
  );
  const pricedOriginals = new Set(
    priced.filter((l) => !l.isAlternative && l.rfqItemId).map((l) => l.rfqItemId),
  );
  const goodsCents = priced.reduce((s, l) => s + lineTotal(l), 0);
  const discountCents = priced.reduce((s, l) => s + toCents(l.discount), 0);
  const totalCents = goodsCents + toCents(deliveryFee);
  const targetCents = items.reduce((s, i) => s + (i.targetPriceCents ?? 0) * i.quantity, 0);
  const isPartial = items.length > 0 && pricedOriginals.size < items.length;

  async function submit() {
    setError(null);
    const payload = {
      deliveryFeeCents: toCents(deliveryFee),
      validUntil: Date.now() + Number(validDays || 14) * 86400000,
      paymentTerms: paymentTerms || undefined,
      notes: notes || undefined,
      items: priced.map((l) => ({
        rfqItemId: l.isAlternative ? undefined : l.rfqItemId,
        productId: l.productId,
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceCents: toCents(l.unitPrice),
        discountCents: toCents(l.discount),
        isAlternative: !!l.isAlternative,
        alternativeForRfqItemId: l.alternativeFor || undefined,
        notes: l.notes || undefined,
        tiers:
          l.tierQty && l.tierPrice
            ? [{ minQty: Number(l.tierQty), unitPriceCents: toCents(l.tierPrice) }]
            : [],
      })),
    };
    if (!payload.items.length) {
      setError('Price at least one line. Leave a price blank to skip that item (partial quote).');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/rfqs/${rfqId}/quote?supplierId=${supplierId}`, payload);
      toast.show(toast.success(myQuote ? 'Revised quote sent' : 'Quote submitted'));
      void qc.invalidateQueries({ queryKey: ['sup-quotes', rfqId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  function applyAiDraft(draft: AiQuoteDraft) {
    setDeliveryFee(String(draft.deliveryFeeCents / 100));
    setValidDays(String(draft.validDays));
    setPaymentTerms(draft.paymentTerms);
    setNotes(draft.notes);
    // The copilot's discount is per unit; the quote's line discount is per line.
    const lineDiscount = (perUnit: number, qty: number) => String((perUnit * qty) / 100);
    setLines((prev) => {
      if (prev.length === 0) {
        return draft.items.map((it) => ({
          rfqItemId: it.rfqItemId,
          productId: it.productId,
          description: it.description,
          quantity: String(it.quantity),
          unitPrice: it.unitPriceCents > 0 ? String(it.unitPriceCents / 100) : '',
          discount: it.discountCents > 0 ? lineDiscount(it.discountCents, it.quantity) : '0',
          isAlternative: it.isAlternative,
          alternativeFor: it.alternativeForRfqItemId,
          notes: it.notes,
          tierQty: it.tier ? String(it.tier.minQty) : undefined,
          tierPrice: it.tier ? String(it.tier.unitPriceCents / 100) : undefined,
        }));
      }
      return prev.map((l) => {
        const d = draft.items.find((it) => it.rfqItemId === l.rfqItemId);
        if (!d || d.unitPriceCents === 0) return l;
        return {
          ...l,
          productId: d.productId ?? l.productId,
          description: d.description,
          unitPrice: String(d.unitPriceCents / 100),
          discount: lineDiscount(d.discountCents, Number(l.quantity || d.quantity)),
          isAlternative: d.isAlternative,
          alternativeFor: d.alternativeForRfqItemId,
          notes: d.notes ?? l.notes,
          tierQty: d.tier ? String(d.tier.minQty) : l.tierQty,
          tierPrice: d.tier ? String(d.tier.unitPriceCents / 100) : l.tierPrice,
        };
      });
    });
  }

  const rfq = detail.data?.rfq;
  const buyer = detail.data?.business;
  const refreshMine = () => {
    void qc.invalidateQueries({ queryKey: ['sup-quotes', rfqId] });
    void qc.invalidateQueries({ queryKey: ['sup-thread', rfqId] });
  };

  if (!rfq) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        {detail.isLoading || !supplierId ? (
          <div className="animate-pulse space-y-6">
            <div className="h-72 rounded-2xl bg-bone" />
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="h-96 rounded-xl bg-bone lg:col-span-8" />
              <div className="h-96 rounded-xl bg-bone lg:col-span-4" />
            </div>
          </div>
        ) : (
          <Surface className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4">
              <FileTextIcon size={22} />
            </span>
            <h2 className="font-display text-lg font-bold text-ink">Quote request not found</h2>
            <p className="text-sm text-ink-4">
              It may have closed, or it wasn’t sent to your business.
            </p>
            <Link
              to="/supplier/quotes"
              className="mt-2 text-sm font-semibold text-ink underline underline-offset-4"
            >
              Back to quote requests
            </Link>
          </Surface>
        )}
      </div>
    );
  }

  const cd = countdown(rfq.deadline);
  const canQuote =
    QUOTABLE.has(rfq.status) &&
    !(myQuote && ['accepted', 'rejected', 'expired', 'superseded'].includes(myQuote.status)) &&
    !(cd?.text === 'Closed');
  const where = [rfq.deliveryLocation, rfq.deliveryCity, rfq.deliveryDistrict]
    .filter(Boolean)
    .join(', ');
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
  const msgs = thread.data?.messages ?? [];

  const terms: Array<{ k: string; v: ReactNode; icon: ReactNode }> = [
    { k: 'Deliver to', v: where || '—', icon: <MapPinIcon size={13} /> },
    {
      k: 'Needed by',
      v: rfq.requiredDeliveryDate ? fmtDate(rfq.requiredDeliveryDate) : 'Flexible',
      icon: <CalendarIcon size={13} />,
    },
    {
      k: 'Payment',
      v:
        [rfq.paymentMethod && titleCase(rfq.paymentMethod), rfq.paymentTerms]
          .filter(Boolean)
          .join(' · ') || '—',
      icon: <BanknoteIcon size={13} />,
    },
  ];
  const extras: Array<{ k: string; v: string }> = [
    rfq.deliveryRequirements ? { k: 'Delivery', v: rfq.deliveryRequirements } : null,
    rfq.specifications ? { k: 'Specifications', v: rfq.specifications } : null,
    rfq.qualityRequirements ? { k: 'Quality', v: rfq.qualityRequirements } : null,
    rfq.packagingRequirements ? { k: 'Packaging', v: rfq.packagingRequirements } : null,
    rfq.brandPreferences ? { k: 'Brands', v: rfq.brandPreferences } : null,
    rfq.notes ? { k: 'Buyer notes', v: rfq.notes } : null,
  ].filter(Boolean) as Array<{ k: string; v: string }>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-24 pt-6">
      <Link
        to="/supplier/quotes"
        className="group flex w-fit items-center gap-1.5 rounded-full bg-paper py-1 pl-2 pr-3 text-xs font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
      >
        <ArrowLeftIcon size={13} className="transition-transform group-hover:-translate-x-0.5" />
        Quote requests
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
        <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-start">
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
                className="group inline-flex items-center gap-1.5 transition-colors hover:text-paper"
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
              <span className="text-paper/50">Quote request</span>
            </div>
            <h1 className="vyro-display mt-3 text-3xl font-bold leading-[1.05] text-paper sm:text-[2.6rem]">
              {rfq.title}
            </h1>
            {rfq.description ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-paper/60">
                {rfq.description}
              </p>
            ) : null}

            {buyer ? (
              <div className="mt-5 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-paper/10 font-display text-base font-bold text-paper ring-1 ring-inset ring-paper/15">
                  {buyer.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-paper/45">
                    Buyer
                  </div>
                  <div className="truncate text-sm font-semibold text-paper">
                    {buyer.name}
                    {buyer.city || buyer.district ? (
                      <span className="font-normal text-paper/55">
                        {' '}
                        · {[buyer.city, buyer.district].filter(Boolean).join(', ')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/[0.06] px-3 py-1 text-xs font-semibold text-paper">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    canQuote ? 'animate-pulse bg-mint' : 'bg-paper/40',
                  )}
                />
                {canQuote ? 'Accepting quotes' : titleCase(rfq.status)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 bg-paper/[0.06] px-3 py-1 text-xs font-medium text-paper/75">
                {rfq.isOpen ? <UserIcon size={12} /> : <StoreIcon size={12} />}
                {rfq.isOpen ? 'Open to all suppliers' : 'Invited privately'}
              </span>
              {rfq.deliveryCity || rfq.deliveryDistrict ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 bg-paper/[0.06] px-3 py-1 text-xs font-medium text-paper/75">
                  <TruckIcon size={12} /> {rfq.deliveryCity || rfq.deliveryDistrict}
                </span>
              ) : null}
            </div>
          </div>

          {/* Your quote panel */}
          <div className="w-full shrink-0 rounded-xl border border-paper/10 bg-paper/[0.05] p-5 backdrop-blur-sm lg:w-72">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-paper/50">
              Your quote
            </div>
            {myQuote ? (
              <>
                <div className="vyro-metric mt-2 text-[2rem] leading-none text-volt">
                  {formatLKR(myQuote.totalCents)}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-paper/55">
                  <span className="font-mono">
                    {myQuote.quoteNumber} · v{myQuote.version}
                  </span>
                  <span className="rounded-full bg-paper/10 px-2 py-0.5 font-semibold capitalize text-paper/85">
                    {myQuote.status.replace(/_/g, ' ')}
                  </span>
                </div>
                {myQuote.validUntil ? (
                  <div className="mt-1 text-[11px] text-paper/45">
                    Valid until {fmtDate(myQuote.validUntil)}
                  </div>
                ) : null}
                {canQuote ? (
                  <a
                    href="#quote-builder"
                    className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-paper/15 bg-paper/[0.06] text-xs font-semibold text-paper/85 transition-colors hover:bg-paper/[0.12]"
                  >
                    <RefreshCwIcon size={12} /> Revise quote
                  </a>
                ) : null}
              </>
            ) : (
              <>
                <div className="mt-2 font-display text-xl font-bold text-paper">Not quoted yet</div>
                <p className="mt-1 text-[11px] leading-relaxed text-paper/50">
                  {canQuote
                    ? 'Price the items below and send your offer before the deadline.'
                    : 'This request is no longer accepting quotes.'}
                </p>
                {canQuote ? (
                  <a
                    href="#quote-builder"
                    className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-volt text-xs font-bold text-ink shadow-[0_8px_24px_-10px_rgba(198,220,74,0.8)] transition-colors hover:bg-volt/90"
                  >
                    Start quote <ArrowRightIcon size={13} />
                  </a>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="relative grid grid-cols-2 divide-paper/10 border-t border-paper/10 px-1 sm:px-3 lg:grid-cols-4 lg:divide-x">
          <HeroStat
            label="Items"
            value={items.length}
            sub={`${totalUnits.toLocaleString()} units requested`}
          />
          <HeroStat
            label="Target value"
            value={targetCents > 0 ? formatLKR(targetCents) : '—'}
            sub={targetCents > 0 ? 'Buyer’s target prices' : 'No target given'}
          />
          <HeroStat
            label="Needed by"
            value={rfq.requiredDeliveryDate ? fmtDate(rfq.requiredDeliveryDate) : 'Flexible'}
            sub={where || 'Delivery location not set'}
          />
          <HeroStat
            label="Quote by"
            value={cd ? cd.text : 'No deadline'}
            sub={
              rfq.deadline
                ? `${fmtDate(rfq.deadline)} · ${new Date(rfq.deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
                : 'Open until the buyer closes it'
            }
            tone={cd?.danger ? 'rose' : cd ? 'volt' : undefined}
          />
        </div>
      </Surface>

      {error ? <ErrorBanner message={error} /> : null}

      {myQuote ? <CounterOffers quoteId={myQuote.id} onChanged={refreshMine} /> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------ main */}
        <div className="space-y-6 lg:col-span-8">
          <Card
            title="What the buyer needs"
            icon={<PackageIcon size={14} />}
            actions={
              <span className="font-mono text-[11px] text-ink-4">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            }
            bodyClassName="p-2"
          >
            <ul>
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center gap-3.5 rounded-xl p-3 transition-colors hover:bg-bone/50"
                >
                  <OrderItemThumb
                    productId={i.productId}
                    name={i.description}
                    className="size-12 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink-1">{i.description}</div>
                    <div className="mt-0.5 truncate text-[11px] text-ink-4">
                      {i.specifications || (i.productId ? 'Catalog product' : 'Custom item')}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-bold text-ink">
                      {i.quantity.toLocaleString()}{' '}
                      <span className="text-[10px] font-semibold uppercase text-ink-4">
                        {i.unit}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-4">
                      {i.targetPriceCents
                        ? `target ${formatLKR(i.targetPriceCents)}/${i.unit}`
                        : 'no target'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          {canQuote && rfqId && supplierId ? (
            <AiQuoteCopilotCard rfqId={rfqId} supplierId={supplierId} onApplyDraft={applyAiDraft} />
          ) : null}

          {canQuote ? (
            <Surface id="quote-builder" className="scroll-mt-24 overflow-hidden p-0">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink/[0.06] px-5 py-4 sm:px-6">
                <div>
                  <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-ink">
                    {myQuote ? `Revise quote · v${myQuote.version + 1}` : 'Build your quote'}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-4">
                    Leave a price blank to skip an item. Offer a substitute if you don’t stock the
                    exact product.
                  </p>
                </div>
                {isPartial && priced.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber/10 px-2.5 py-1 text-[11px] font-semibold text-[#a86c28] ring-1 ring-inset ring-amber/30">
                    <AlertTriangleIcon size={11} /> Partial quote · {pricedOriginals.size}/
                    {items.length} items
                  </span>
                ) : null}
              </div>

              <div className="space-y-3 p-4 sm:p-5">
                {lines.map((l, i) => {
                  const src = items.find(
                    (it) => it.id === (l.isAlternative ? l.alternativeFor : l.rfqItemId),
                  );
                  const skipped = l.unitPrice.trim() === '';
                  const total = lineTotal(l);
                  const unitCents = toCents(l.unitPrice);
                  const vsTarget =
                    src?.targetPriceCents && !skipped ? unitCents - src.targetPriceCents : null;
                  const tiers = tiersOpen.has(i) || !!(l.tierQty || l.tierPrice);
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-xl p-4 transition-colors',
                        l.isAlternative
                          ? 'ml-4 bg-amber/[0.05] shadow-[inset_0_0_0_1px_rgba(196,132,58,0.25)] sm:ml-8'
                          : 'bg-bone/40 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.07)]',
                        skipped && !l.isAlternative && 'opacity-80',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {l.isAlternative ? (
                          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber/15 text-[#a86c28]">
                            <LayersIcon size={16} />
                          </span>
                        ) : (
                          <OrderItemThumb
                            productId={l.productId}
                            name={l.description}
                            className="size-11 rounded-lg"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {l.isAlternative ? (
                            <>
                              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a86c28]">
                                Substitute for {src?.description ?? 'item'}
                              </div>
                              <input
                                value={l.description}
                                onChange={(e) => update(i, { description: e.target.value })}
                                placeholder="What you’ll supply instead (product, brand, spec)"
                                aria-label="Substitute product"
                                className={cn(fieldCls, 'mt-1.5')}
                              />
                            </>
                          ) : (
                            <>
                              <div className="truncate text-sm font-semibold text-ink-1">
                                {l.description}
                              </div>
                              <div className="mt-0.5 text-[11px] text-ink-4">
                                {src
                                  ? `${src.quantity.toLocaleString()} ${src.unit} requested`
                                  : 'Line'}
                                {src?.targetPriceCents
                                  ? ` · target ${formatLKR(src.targetPriceCents)}/${src.unit}`
                                  : ''}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {skipped ? (
                            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10px] font-semibold text-ink-4">
                              Not quoting
                            </span>
                          ) : (
                            <>
                              <div className="font-mono text-sm font-bold text-ink">
                                {formatLKR(total)}
                              </div>
                              {vsTarget != null ? (
                                <div
                                  className={cn(
                                    'mt-0.5 font-mono text-[10px] font-semibold',
                                    vsTarget <= 0 ? 'text-mint' : 'text-[#a86c28]',
                                  )}
                                >
                                  {vsTarget <= 0
                                    ? 'at or below target'
                                    : `+${formatLKR(vsTarget)}/unit vs target`}
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                        {l.isAlternative ? (
                          <button
                            type="button"
                            onClick={() => removeLine(i)}
                            aria-label="Remove substitute"
                            className="shrink-0 rounded-md p-1 text-ink-4 transition-colors hover:bg-ink/5 hover:text-rose"
                          >
                            <XIcon size={14} />
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Field label={`Qty${src ? ` (${src.unit})` : ''}`}>
                          <input
                            value={l.quantity}
                            onChange={(e) => update(i, { quantity: e.target.value })}
                            inputMode="numeric"
                            aria-label="Quantity"
                            className={cn(fieldCls, 'font-mono num-tabular')}
                          />
                        </Field>
                        <Field label="Unit price">
                          <MoneyInput
                            value={l.unitPrice}
                            onChange={(v) => update(i, { unitPrice: v })}
                            placeholder="Skip"
                            ariaLabel="Unit price in rupees"
                          />
                        </Field>
                        <Field label="Line discount">
                          <MoneyInput
                            value={l.discount === '0' ? '' : l.discount}
                            onChange={(v) => update(i, { discount: v || '0' })}
                            ariaLabel="Line discount in rupees"
                          />
                        </Field>
                        <div className="flex items-end gap-1.5">
                          {!l.isAlternative && l.rfqItemId ? (
                            <button
                              type="button"
                              onClick={() => addSubstitute(i)}
                              className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-copper transition-colors hover:bg-copper/10"
                            >
                              <PlusIcon size={12} /> Substitute
                            </button>
                          ) : null}
                          {!tiers ? (
                            <button
                              type="button"
                              onClick={() => setTiersOpen((s) => new Set(s).add(i))}
                              className="inline-flex h-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-ink-3 transition-colors hover:bg-ink/5 hover:text-ink"
                            >
                              <TargetIcon size={12} /> Volume price
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {tiers ? (
                        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-paper/70 p-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)] sm:grid-cols-[1fr_1fr_auto]">
                          <Field label="If they order at least">
                            <input
                              value={l.tierQty ?? ''}
                              onChange={(e) => update(i, { tierQty: e.target.value })}
                              inputMode="numeric"
                              placeholder="Qty"
                              aria-label="Volume break quantity"
                              className={cn(fieldCls, 'font-mono')}
                            />
                          </Field>
                          <Field label="Unit price becomes">
                            <MoneyInput
                              value={l.tierPrice}
                              onChange={(v) => update(i, { tierPrice: v })}
                              ariaLabel="Volume break unit price"
                            />
                          </Field>
                          <button
                            type="button"
                            onClick={() => {
                              update(i, { tierQty: undefined, tierPrice: undefined });
                              setTiersOpen((s) => {
                                const n = new Set(s);
                                n.delete(i);
                                return n;
                              });
                            }}
                            className="col-span-2 self-end text-[11px] font-semibold text-ink-4 hover:text-rose sm:col-span-1 sm:h-10"
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 border-t border-ink/[0.06] bg-bone/30 p-5 sm:grid-cols-3 sm:p-6">
                <Field label="Delivery fee">
                  <MoneyInput
                    value={deliveryFee}
                    onChange={setDeliveryFee}
                    ariaLabel="Delivery fee in rupees"
                  />
                </Field>
                <Field label="Quote valid for">
                  <div className="relative">
                    <input
                      value={validDays}
                      onChange={(e) => setValidDays(e.target.value)}
                      inputMode="numeric"
                      aria-label="Validity in days"
                      className={cn(fieldCls, 'pr-12 font-mono')}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-4">
                      days
                    </span>
                  </div>
                </Field>
                <Field label="Payment terms">
                  <input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder={rfq.paymentTerms || 'e.g. 50% advance, balance on delivery'}
                    aria-label="Payment terms"
                    className={fieldCls}
                  />
                </Field>
                <Field label="Notes & conditions" className="sm:col-span-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Lead time, brand, packaging, anything the buyer should know…"
                    className={cn(fieldCls, 'h-auto py-2.5 leading-relaxed')}
                  />
                </Field>
              </div>

              {/* Summary + submit */}
              <div className="flex flex-col gap-5 border-t border-ink/[0.08] bg-ink p-5 text-paper sm:flex-row sm:items-center sm:p-6">
                <dl className="grid flex-1 grid-cols-3 gap-4 text-xs">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                      Goods
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-paper">{formatLKR(goodsCents)}</dd>
                    {discountCents > 0 ? (
                      <dd className="font-mono text-[10px] text-volt">
                        −{formatLKR(discountCents)} discount
                      </dd>
                    ) : null}
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                      Delivery
                    </dt>
                    <dd className="mt-1 font-mono text-sm text-paper">
                      {formatLKR(toCents(deliveryFee))}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                      Landed total
                    </dt>
                    <dd className="vyro-metric mt-1 text-2xl leading-none text-volt">
                      {formatLKR(totalCents)}
                    </dd>
                    {targetCents > 0 && !isPartial && goodsCents > 0 ? (
                      <dd
                        className={cn(
                          'mt-1 font-mono text-[10px]',
                          goodsCents <= targetCents ? 'text-mint' : 'text-amber',
                        )}
                      >
                        {goodsCents <= targetCents
                          ? 'Within buyer target'
                          : `${formatLKR(goodsCents - targetCents)} over target`}
                      </dd>
                    ) : null}
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting || priced.length === 0}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-volt px-6 text-sm font-bold text-ink shadow-[0_10px_30px_-12px_rgba(198,220,74,0.9)] transition-colors hover:bg-volt/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitting ? 'Sending…' : myQuote ? 'Send revised quote' : 'Submit quote'}
                  {!submitting ? <ArrowRightIcon size={14} /> : null}
                </button>
              </div>
            </Surface>
          ) : (
            <Surface className="flex items-center gap-4 p-5">
              <span className="flex size-11 items-center justify-center rounded-xl bg-bone text-ink-4">
                <ClockIcon size={18} />
              </span>
              <div>
                <div className="font-display text-base font-bold text-ink">Quoting is closed</div>
                <p className="text-sm text-ink-4">
                  {myQuote
                    ? `Your quote is ${myQuote.status.replace(/_/g, ' ')}.`
                    : 'This request is no longer accepting quotes.'}
                </p>
              </div>
            </Surface>
          )}

          {/* Messages */}
          <Card title="Questions for the buyer" icon={<MailIcon size={14} />} bodyClassName="p-0">
            {myQuote ? (
              <>
                <div className="max-h-80 min-h-40 space-y-4 overflow-y-auto bg-gradient-to-b from-bone/30 to-transparent p-5 scrollbar-thin">
                  {msgs.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-4">
                      No messages yet. Ask about specs, delivery or terms.
                    </p>
                  ) : null}
                  {msgs.map((m) => {
                    const mineMsg = m.senderType === 'supplier';
                    return (
                      <div
                        key={m.id}
                        className={cn('flex flex-col', mineMsg ? 'items-end' : 'items-start')}
                      >
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                            mineMsg
                              ? 'rounded-br-md bg-ink text-paper'
                              : 'rounded-bl-md bg-paper text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]',
                          )}
                        >
                          {m.message}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-ink-5">
                          {mineMsg ? 'You' : 'Buyer'} · {fmtDateTime(m.createdAt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form
                  className="flex gap-2 border-t border-ink/[0.07] p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!msg.trim()) return;
                    const m = msg;
                    setMsg('');
                    void api
                      .post(`/rfqs/${rfqId}/messages`, { quoteId: myQuote.id, message: m })
                      .then(refreshMine)
                      .catch((err) => setError(err instanceof Error ? err.message : 'Failed'));
                  }}
                >
                  <input
                    value={msg}
                    onChange={(e) => setMsg(e.target.value)}
                    placeholder="Ask about specs, delivery, terms…"
                    aria-label="Message"
                    className={cn(fieldCls, 'flex-1')}
                  />
                  <Button type="submit" size="md" disabled={!msg.trim()}>
                    Send <ArrowRightIcon size={13} />
                  </Button>
                </form>
              </>
            ) : (
              <p className="p-5 text-sm text-ink-4">Messaging opens once you’ve sent a quote.</p>
            )}
          </Card>
        </div>

        {/* ------------------------------------------------ aside */}
        <aside className="space-y-5 lg:col-span-4">
          <Card title="Delivery & terms" icon={<TruckIcon size={14} />}>
            <ul className="space-y-3.5">
              {terms.map((t) => (
                <li key={t.k} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-bone text-ink-3">
                    {t.icon}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                      {t.k}
                    </div>
                    <div className="mt-0.5 text-sm font-medium text-ink-1">{t.v}</div>
                  </div>
                </li>
              ))}
            </ul>
            {extras.length > 0 ? (
              <dl className="mt-5 space-y-3 border-t border-ink/[0.06] pt-4">
                {extras.map((x) => (
                  <div key={x.k}>
                    <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                      {x.k}
                    </dt>
                    <dd className="mt-0.5 whitespace-pre-line text-sm leading-relaxed text-ink-2">
                      {x.v}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </Card>

          {supplierId && rfqId ? <LeadCard rfqId={rfqId} supplierId={supplierId} /> : null}

          {(mine.data?.quotes.length ?? 0) > 0 ? (
            <Card title="Your quotations" icon={<CheckCircleIcon size={14} />}>
              <ul className="space-y-2">
                {mine.data!.quotes.map((q) => (
                  <li
                    key={q.quote.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-bone/50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-ink-3">
                        {q.quote.quoteNumber} · v{q.quote.version}
                      </div>
                      <div className="mt-1">
                        <StatusPill status={q.quote.status} />
                      </div>
                    </div>
                    <div className="shrink-0 font-mono text-sm font-bold text-ink">
                      {formatLKR(q.quote.totalCents)}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Attachments" icon={<FileTextIcon size={14} />}>
            <RfqDocsUpload rfqId={rfqId!} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ lead */

function LeadCard({ rfqId, supplierId }: { rfqId: string; supplierId: string }) {
  const setTag = useSetLeadTag(supplierId);
  // Look up the lead for this RFQ. Hidden when the Lead Manager is off or no lead exists.
  const lookup = useQuery({
    queryKey: ['crm-lead-by-rfq', supplierId, rfqId],
    queryFn: async () => {
      const result = await api.get<{
        leads: { id: string; rfqId: string }[];
        nextCursor: string | null;
      }>(`/supplier/crm/leads?supplierId=${supplierId}&rfqId=${encodeURIComponent(rfqId)}&limit=1`);
      return result.leads[0]?.id ?? null;
    },
    retry: false,
  });
  const leadId = lookup.data ?? null;
  const detail = useLead(supplierId, leadId ?? '');
  if (lookup.isError || (lookup.data === null && !lookup.isLoading)) return null;

  const row = detail.data?.lead;
  return (
    <Card
      title="Lead"
      icon={<TargetIcon size={14} />}
      actions={
        row ? (
          <div className="flex items-center gap-1.5">
            <VerifiedBuyerBadge
              verified={row.buyerVerified}
              level={row.buyerKycLevel}
              verifiedAt={row.buyerVerifiedAt}
            />
            <ConversionBadge status={row.conversionStatus} />
          </div>
        ) : null
      }
      bodyClassName="space-y-4"
    >
      {!row || !leadId ? (
        <div className="h-24 animate-pulse rounded-xl bg-bone" />
      ) : (
        <>
          <div>
            <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
              How likely is this deal?
            </div>
            <TagPicker
              value={row.tag}
              onChange={(next) => setTag.mutate({ leadId, tag: next })}
              disabled={setTag.isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-bone/50 px-3 py-2">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-4">
                Quoted
              </div>
              <div className="mt-0.5 font-medium text-ink-1">
                {row.quotedAt ? fmtDate(row.quotedAt) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-bone/50 px-3 py-2">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-4">
                Order
              </div>
              {row.orderId ? (
                <Link
                  to={`/supplier/orders/${row.orderId}`}
                  className="mt-0.5 block truncate font-medium text-copper hover:underline"
                >
                  View order
                </Link>
              ) : (
                <div className="mt-0.5 font-medium text-ink-1">—</div>
              )}
            </div>
          </div>
          <Link
            to="/supplier/leads"
            className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            Open in Leads inbox <ArrowRightIcon size={12} />
          </Link>
        </>
      )}
    </Card>
  );
}
