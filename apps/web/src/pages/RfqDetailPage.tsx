import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn, useToast } from '@vyro/ui';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { PageHero, HeroStatusPill, heroActionClass } from '@/components/brand/PageHero';
import { StatusPill } from './RfqsPage';
import { RfqDocsUpload } from '@/components/RfqDocsUpload';
import { RfqSupplierDiscovery } from '@/components/RfqSupplierDiscovery';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  PackageIcon,
  ScaleIcon,
  SparklesIcon,
  TrendingUpIcon,
  TruckIcon,
  XIcon,
} from '@/components/icons';

interface VersionRow { version: number; changedByUserId: string; previousTotalCents: number | null; newTotalCents: number; changesJson?: string | null; createdAt: number }
interface CounterRow { id: string; offeredByType: string; proposedTotalCents: number; proposedDeliveryFeeCents?: number | null; proposedPaymentTerms?: string | null; message?: string | null; status: string; createdAt: number }

type RfqHeader = { rfqNumber: string; title: string; status: string; businessId: string; description?: string; deadline?: number };
type QuoteHeader = { id: string; quoteNumber: string; status: string; version: number; totalCents: number; currency: string; deliveryFeeCents: number; paymentTerms?: string; validUntil?: number; estimatedDeliveryDate?: number; notes?: string; isPartial: number | boolean; supplierId: string };
type QuoteItem = { description: string; quantity: number; unitPriceCents: number; subtotalCents: number; isAlternative: number };

const money = (cents: number) => formatLKR(cents);

/** Hero tone for the RFQ lifecycle: green when bidding, amber when reviewing, volt when awarded. */
function heroTone(status: string): 'mint' | 'amber' | 'volt' | 'paper' {
  if (['open', 'quoting'].includes(status)) return 'mint';
  if (['quotes_received', 'under_review', 'negotiating'].includes(status)) return 'amber';
  if (['awarded', 'converted_to_order'].includes(status)) return 'volt';
  return 'paper';
}

function formatCountdown(ts: number | undefined): { text: string; danger: boolean } | null {
  if (!ts) return null;
  const diff = ts - Date.now();
  if (diff < 0) return { text: 'Expired', danger: true };
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return { text: `${hours}h left`, danger: hours < 6 };
  return { text: `${Math.floor(hours / 24)}d left`, danger: false };
}

/** Compact stat tile used in the summary strip. */
function Tile({ label, value, sub, icon, tone = 'neutral' }: { label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; tone?: 'neutral' | 'success' | 'danger' }) {
  const valueTone = { neutral: 'text-ink', success: 'text-mint', danger: 'text-rose' }[tone];
  return (
    <Surface className="flex flex-col justify-between gap-5 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-ink-3">{label}</span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08),0_1px_2px_rgba(12,14,11,0.06)]">
          {icon}
        </span>
      </div>
      <div>
        <div className={cn('vyro-metric text-2xl leading-none sm:text-[1.75rem]', valueTone)}>{value}</div>
        {sub ? <div className="mt-2 truncate text-xs text-ink-4">{sub}</div> : null}
      </div>
    </Surface>
  );
}

/** Section heading with an optional count and trailing actions. */
function SectionHead({ title, count, actions, description }: { title: string; count?: number; actions?: ReactNode; description?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold tracking-[-0.02em] text-ink">
          {title}
          {count != null ? <span className="ml-2 font-sans text-sm font-medium text-ink-4">{count}</span> : null}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-4">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

const insetCls = 'rounded-xl bg-bone/60 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]';

function QuoteHistory({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['quote-history', quoteId],
    queryFn: () => api.get<{ versions: VersionRow[]; counters: CounterRow[] }>(`/rfqs/quotes/${quoteId}/history`),
    enabled: open,
  });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 transition-colors hover:text-ink">
        Version history & negotiation
        <ArrowRightIcon size={12} />
      </button>
    );
  }

  const versions = data?.versions ?? [];
  const counters = data?.counters ?? [];

  const respond = (counterId: string, accept: boolean) =>
    void api.post(`/rfqs/counters/${counterId}/respond`, { accept }).then(() => {
      void qc.invalidateQueries({ queryKey: ['quote-history', quoteId] });
      onChanged();
    });

  return (
    <div className={cn('space-y-5 p-4 text-xs', insetCls)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">History</span>
        <button type="button" onClick={() => setOpen(false)} className="font-semibold text-ink-3 transition-colors hover:text-ink">
          Hide
        </button>
      </div>

      <div>
        <h4 className="mb-2 font-semibold text-ink">Versions <span className="font-normal text-ink-4">· never overwritten</span></h4>
        <ol className="relative space-y-3 border-l border-ink/10 pl-4">
          {versions.map((v) => (
            <li key={v.version} className="relative">
              <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-ink ring-4 ring-paper" aria-hidden />
              <div className="font-mono text-[11px] text-ink-4">v{v.version} · {new Date(v.createdAt).toLocaleString()}</div>
              <div className="mt-0.5 text-ink">
                {v.previousTotalCents != null ? <><span className="text-ink-4 line-through">{money(v.previousTotalCents)}</span> → </> : 'Initial · '}
                <span className="font-semibold">{money(v.newTotalCents)}</span>
              </div>
            </li>
          ))}
          {versions.length === 0 ? <li className="text-ink-4">Loading…</li> : null}
        </ol>
      </div>

      <div>
        <h4 className="mb-2 font-semibold text-ink">Counter-offers</h4>
        <div className="space-y-2">
          {counters.map((co) => (
            <div key={co.id} className="rounded-lg bg-paper p-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.07)]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-3">{co.offeredByType}</span>
                <span className="font-semibold text-ink">{money(co.proposedTotalCents)}</span>
                <StatusPill status={co.status} />
              </div>
              {co.proposedPaymentTerms ? <div className="mt-1.5 text-ink-3">Terms: {co.proposedPaymentTerms}</div> : null}
              {co.message ? <div className="mt-1 italic text-ink-2">“{co.message}”</div> : null}
              <div className="mt-1.5 font-mono text-[10px] text-ink-5">{new Date(co.createdAt).toLocaleString()}</div>
              {co.status === 'pending' ? (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="success" onClick={() => respond(co.id, true)}>Accept</Button>
                  <Button size="sm" variant="secondary" onClick={() => respond(co.id, false)}>Reject</Button>
                </div>
              ) : null}
            </div>
          ))}
          {counters.length === 0 ? <div className="text-ink-4">No counter-offers yet.</div> : null}
        </div>
      </div>
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
      <div className="h-56 rounded-2xl bg-bone" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-bone" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-96 rounded-xl bg-bone lg:col-span-2" />
        <div className="h-96 rounded-xl bg-bone" />
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
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [counterMsg, setCounterMsg] = useState<Record<string, string>>({});
  const [confirmAward, setConfirmAward] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ['rfq', id], queryFn: () => api.get<{ rfq: Record<string, unknown>; items: Array<Record<string, unknown>>; invites?: unknown[]; events?: Array<{ action: string; createdAt: number; toStatus?: string }> }>(`/rfqs/${id}`), enabled: !!id });
  const quotes = useQuery({ queryKey: ['rfq-quotes', id], queryFn: () => api.get<{ quotes: Array<{ quote: Record<string, unknown>; items: Array<Record<string, unknown>>; tiers: Array<Record<string, unknown>> }> }>(`/rfqs/${id}/quotes`), enabled: !!id });
  const compare = useQuery({ queryKey: ['rfq-compare', id], queryFn: () => api.get<{ quotes: unknown[]; bestPriceQuoteId: string | null; fastestQuoteId: string | null; splitOptimization: { splitItemsTotalCents: number; supplierCount: number } }>(`/rfqs/${id}/compare`), enabled: !!id });
  const ai = useQuery({ queryKey: ['rfq-ai', id], queryFn: () => api.get<{ recommendation: string; bestQuoteId: string | null; summary: string }>(`/rfqs/${id}/ai-summary`), enabled: !!id });
  const messages = useQuery({ queryKey: ['rfq-msgs', id], queryFn: () => api.get<{ messages: Array<{ id: string; senderType: string; message: string; createdAt: number }> }>(`/rfqs/${id}/messages`), enabled: !!id });

  const rfq = detail.data?.rfq as unknown as RfqHeader | undefined;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rfq', id] }); void qc.invalidateQueries({ queryKey: ['rfq-quotes', id] }); void qc.invalidateQueries({ queryKey: ['rfq-compare', id] }); };

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setError(null);
    try { await fn(); toast.show(toast.success(okMsg)); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  }

  if (!rfq) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        {detail.isLoading ? <SkeletonDetail /> : (
          <Surface className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4"><FileTextIcon size={22} /></span>
            <h2 className="font-display text-lg font-bold text-ink">RFQ not found</h2>
            <p className="text-sm text-ink-4">It may have been removed, or you may not have access to it.</p>
            <Link to="/rfqs" className="mt-2 text-sm font-semibold text-ink underline underline-offset-4">Back to all RFQs</Link>
          </Surface>
        )}
      </div>
    );
  }

  const quoteList = quotes.data?.quotes ?? [];
  const itemList = detail.data?.items ?? [];
  const countdown = formatCountdown(rfq.deadline);
  const bestQuote = compare.data?.bestPriceQuoteId
    ? quoteList.find((q) => (q.quote as { id: string }).id === compare.data?.bestPriceQuoteId)
    : undefined;
  const bestTotal = bestQuote ? (bestQuote.quote as { totalCents: number }).totalCents : null;
  const quoteNumberOf = (quoteId: string | null) =>
    quoteId ? (quoteList.find((q) => (q.quote as { id: string }).id === quoteId)?.quote as { quoteNumber: string } | undefined)?.quoteNumber : undefined;

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      <Link
        to="/rfqs"
        className="group flex w-fit items-center gap-1.5 rounded-full bg-paper py-1 pl-2 pr-3 text-xs font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
      >
        <ArrowLeftIcon size={13} className="transition-transform group-hover:-translate-x-0.5" />
        All RFQs
      </Link>

      <PageHero
        icon={FileTextIcon}
        kicker={`${rfq.rfqNumber} · Request for quotation`}
        title={rfq.title}
        description={rfq.description}
        status={<HeroStatusPill label={rfq.status.replace(/_/g, ' ')} tone={heroTone(rfq.status)} />}
        actions={
          <>
            {rfq.status === 'draft' ? (
              <button type="button" className={heroActionClass} onClick={() => void act(() => api.post(`/rfqs/${id}/publish`, {}), 'RFQ published')}>
                Publish
              </button>
            ) : null}
            {['open', 'quoting', 'quotes_received', 'under_review'].includes(rfq.status) ? (
              <button type="button" className={heroActionClass} onClick={() => void act(() => api.post(`/rfqs/${id}/close`, {}), 'RFQ closed')}>
                Close RFQ
              </button>
            ) : null}
            {rfq.status === 'expired' ? (
              <button type="button" className={heroActionClass} onClick={() => void act(() => api.post(`/rfqs/${id}/reopen`, {}), 'RFQ reopened')}>
                Reopen
              </button>
            ) : null}
            {rfq.status === 'awarded' ? (
              <button
                type="button"
                className={cn(heroActionClass, 'border-volt/40 bg-volt text-ink hover:bg-volt/90 hover:text-ink')}
                onClick={() => void act(async () => { const r = await api.post<{ poId: string }>(`/rfqs/${id}/convert`, {}); navigate(`/orders/${r.poId}`); }, 'Purchase order created')}
              >
                Accept & create order
                <ArrowRightIcon size={13} />
              </button>
            ) : null}
            <Link to={`/rfqs/${id}/compare`} className={heroActionClass}>
              <ScaleIcon size={13} />
              Compare quotes
            </Link>
          </>
        }
        footer={
          <>
            <span className="inline-flex items-center gap-2">
              <CalendarIcon size={12} />
              {rfq.deadline ? `Due ${new Date(rfq.deadline).toLocaleString()}` : 'No deadline set'}
              {countdown ? <span className={countdown.danger ? 'text-rose' : 'text-volt'}>· {countdown.text}</span> : null}
            </span>
            <span className="text-paper/40">
              {itemList.length} {itemList.length === 1 ? 'item' : 'items'} · {quoteList.length} {quoteList.length === 1 ? 'quote' : 'quotes'}
            </span>
          </>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Requested items" value={itemList.length} sub="Line items in this RFQ" icon={<PackageIcon size={16} />} />
        <Tile label="Quotes received" value={quoteList.length} sub={quoteList.length ? 'From competing suppliers' : 'Waiting for supplier bids'} icon={<FileTextIcon size={16} />} />
        <Tile
          label="Best landed price"
          value={bestTotal != null ? money(bestTotal) : '—'}
          sub={bestTotal != null ? `Quote ${quoteNumberOf(compare.data?.bestPriceQuoteId ?? null) ?? ''}` : 'Appears once quotes arrive'}
          icon={<TrendingUpIcon size={16} />}
          tone={bestTotal != null ? 'success' : 'neutral'}
        />
        <Tile
          label="Deadline"
          value={countdown ? countdown.text : 'Open'}
          sub={rfq.deadline ? new Date(rfq.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No closing date'}
          icon={<ClockIcon size={16} />}
          tone={countdown?.danger ? 'danger' : 'neutral'}
        />
      </div>

      <RfqSupplierDiscovery rfqId={id!} rfqStatus={rfq.status} />

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main column: quotations, documents, messages */}
        <div className="space-y-10 lg:col-span-2">
          <section className="space-y-5">
            <SectionHead
              title="Quotations"
              count={quoteList.length}
              actions={
                compare.data ? (
                  <div className="flex flex-wrap gap-2">
                    {compare.data.bestPriceQuoteId ? (
                      <Pill tone="success" icon={<TrendingUpIcon size={11} />}>Best price · {quoteNumberOf(compare.data.bestPriceQuoteId)}</Pill>
                    ) : null}
                    {compare.data.fastestQuoteId ? (
                      <Pill tone="info" icon={<ClockIcon size={11} />}>Fastest · {quoteNumberOf(compare.data.fastestQuoteId)}</Pill>
                    ) : null}
                    {compare.data.splitOptimization.supplierCount > 1 ? (
                      <Pill tone="warning" icon={<TruckIcon size={11} />}>
                        Split · {compare.data.splitOptimization.supplierCount} suppliers from {money(compare.data.splitOptimization.splitItemsTotalCents)}
                      </Pill>
                    ) : null}
                  </div>
                ) : null
              }
            />

            {quoteList.length === 0 ? (
              <Surface className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-bone text-ink-4"><ClockIcon size={22} /></span>
                <h3 className="font-display text-base font-bold text-ink">No quotes yet</h3>
                <p className="max-w-sm text-sm text-ink-4">Suppliers are being invited. Quotes appear here as soon as they submit.</p>
              </Surface>
            ) : null}

            <div className="grid gap-5 md:grid-cols-2">
              {quoteList.map(({ quote, items }) => {
                const q = quote as unknown as QuoteHeader;
                const lines = items as unknown as QuoteItem[];
                const expired = q.validUntil != null && q.validUntil < Date.now();
                const awardable = !['awarded', 'converted_to_order'].includes(rfq.status) && !expired && ['submitted', 'under_review', 'negotiating'].includes(q.status);
                const isBest = q.id === compare.data?.bestPriceQuoteId;
                return (
                  <Surface key={q.id} className={cn('flex flex-col gap-5 p-6', isBest && 'ring-1 ring-mint/40')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-ink-4">{q.quoteNumber}</span>
                          <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-ink-3">v{q.version}</span>
                        </div>
                        {isBest ? <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-mint">Best price</div> : null}
                      </div>
                      <StatusPill status={expired ? 'expired' : q.status} />
                    </div>

                    {!!q.isPartial ? (
                      <Callout>Partial quote. It covers only some items; missing lines are unavailable, not Rs. 0.</Callout>
                    ) : null}

                    <div>
                      <div className="vyro-metric text-[2.25rem] leading-none text-ink">{money(q.totalCents)}</div>
                      <div className="mt-2 text-xs text-ink-4">
                        Landed total incl. delivery {money(q.deliveryFeeCents)}
                        {q.paymentTerms ? ` · ${q.paymentTerms}` : ''}
                        {q.validUntil ? ` · valid until ${new Date(q.validUntil).toLocaleDateString()}` : ''}
                      </div>
                    </div>

                    <ul className={cn('divide-y divide-ink/[0.06] overflow-hidden px-4', insetCls)}>
                      {lines.map((it, i) => (
                        <li key={i} className="flex items-start justify-between gap-4 py-3 text-sm">
                          <div className="min-w-0">
                            <div className="font-medium text-ink">
                              {it.description}
                              {it.isAlternative ? <span className="ml-2 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#a86c28]">Alternative</span> : null}
                            </div>
                            {it.isAlternative ? <div className="mt-0.5 text-xs text-ink-4">Needs explicit acceptance</div> : null}
                          </div>
                          <div className="shrink-0 text-right font-mono text-xs text-ink-3">
                            <div>{it.quantity} × {money(it.unitPriceCents)}</div>
                            <div className="mt-0.5 font-semibold text-ink">{money(it.subtotalCents)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    {q.notes ? <p className="text-xs leading-relaxed text-ink-3">{q.notes}</p> : null}

                    <QuoteHistory quoteId={q.id} onChanged={refresh} />

                    {/* Decision actions */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-ink/[0.07] pt-5">
                      {awardable ? (
                        confirmAward === q.id ? (
                          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-volt-soft/60 p-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
                            <span className="mr-auto text-sm font-medium text-ink">
                              Award {q.quoteNumber} v{q.version} at {money(q.totalCents)}?
                            </span>
                            <Button size="sm" onClick={() => { setConfirmAward(null); void act(() => api.post(`/rfqs/${id}/award`, { quoteId: q.id, expectedVersion: q.version }), 'Quote awarded'); }}>
                              <CheckCircleIcon size={14} />
                              Confirm award
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmAward(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" onClick={() => setConfirmAward(q.id)}>
                            <CheckCircleIcon size={14} />
                            Award quote
                          </Button>
                        )
                      ) : null}
                      {awardable ? (
                        <Button size="sm" variant="ghost" onClick={() => { const r = window.prompt('Rejection reason (optional)'); if (r !== null) void act(() => api.post(`/rfqs/quotes/${q.id}/reject`, { reason: r || undefined }), 'Quote rejected'); }}>
                          <XIcon size={13} />
                          Reject
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" onClick={() => void act(() => api.post(`/rfqs/quotes/${q.id}/request-revision`, { message: 'Please revise your best price.' }), 'Revision requested')}>
                        Request revision
                      </Button>
                    </div>

                    {/* Counter-offer */}
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Counter-offer</div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative sm:w-44">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-4">Rs.</span>
                          <input
                            value={counter[q.id] ?? ''}
                            onChange={(e) => setCounter({ ...counter, [q.id]: e.target.value })}
                            placeholder="Total"
                            inputMode="decimal"
                            aria-label="Counter total in rupees"
                            className={inputCls('w-full pl-10 font-mono num-tabular')}
                          />
                        </div>
                        <input
                          value={counterMsg[q.id] ?? ''}
                          onChange={(e) => setCounterMsg({ ...counterMsg, [q.id]: e.target.value })}
                          placeholder="Message to supplier (required)"
                          aria-label="Counter message"
                          className={inputCls('flex-1')}
                        />
                        <Button
                          size="md"
                          variant="secondary"
                          onClick={() => {
                            const total = Math.round(Number(counter[q.id]) * 100);
                            const message = counterMsg[q.id] ?? '';
                            if (!(total > 0) || !message.trim()) { setError('Counter needs a total and a message'); return; }
                            void act(() => api.post(`/rfqs/quotes/${q.id}/counter`, { proposedTotalCents: total, message }), 'Counter-offer sent');
                          }}
                        >
                          Send counter
                        </Button>
                      </div>
                    </div>
                  </Surface>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <SectionHead title="Documents" description="Specifications, certificates and reference files shared with suppliers." />
            <RfqDocsUpload rfqId={id!} />
          </section>

          <section className="space-y-4">
            <SectionHead title="Messages" description="Clarify specs, delivery and terms with bidding suppliers." />
            <Surface className="flex flex-col p-0">
              <div className="max-h-96 min-h-48 space-y-3 overflow-y-auto p-5 scrollbar-thin">
                {(messages.data?.messages ?? []).length === 0 ? (
                  <div className="py-10 text-center text-sm text-ink-4">No messages yet. Start the conversation below.</div>
                ) : null}
                {(messages.data?.messages ?? []).map((m) => {
                  const mine = m.senderType === 'buyer';
                  return (
                    <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                      <div className="mb-1 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-4">
                        <span>{m.senderType}</span>
                        <span className="text-ink-5">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      <div
                        className={cn(
                          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                          mine ? 'rounded-br-md bg-ink text-paper' : 'rounded-bl-md bg-bone text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]',
                        )}
                      >
                        {m.message}
                      </div>
                    </div>
                  );
                })}
              </div>
              <form
                className="flex gap-2 border-t border-ink/[0.07] bg-bone/40 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!msg.trim()) return;
                  const m = msg;
                  setMsg('');
                  void act(() => api.post(`/rfqs/${id}/messages`, { message: m }), 'Sent');
                }}
              >
                <input
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="Clarify specs, delivery, terms…"
                  aria-label="Message"
                  className={inputCls('flex-1')}
                />
                <Button type="submit" size="md">
                  Send
                  <ArrowRightIcon size={13} />
                </Button>
              </form>
            </Surface>
          </section>
        </div>

        {/* Side column: brief, items, AI analysis, timeline */}
        <aside className="space-y-5">
          {rfq.description ? (
            <Surface className="space-y-2 p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-4">Brief</div>
              <p className="text-sm leading-relaxed text-ink-2">{rfq.description}</p>
            </Surface>
          ) : null}

          <Surface className="space-y-4 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]"><PackageIcon size={15} /></span>
              <h3 className="font-display text-base font-bold text-ink">Requested items</h3>
            </div>
            {itemList.length === 0 ? (
              <p className="text-sm text-ink-4">No line items recorded.</p>
            ) : (
              <ul className="divide-y divide-ink/[0.06]">
                {itemList.map((it) => (
                  <li key={it.id as string} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 text-ink">{it.description as string}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-3">{it.quantity as number} {it.unit as string}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface className="space-y-3 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-volt-soft text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]"><SparklesIcon size={15} /></span>
              <h3 className="font-display text-base font-bold text-ink">AI quote analysis</h3>
            </div>
            <p className="text-sm leading-relaxed text-ink-2">{ai.data?.recommendation ?? 'Waiting for complete valid quotes…'}</p>
            {ai.data?.summary ? (
              <pre className={cn('whitespace-pre-wrap p-3 font-sans text-xs leading-relaxed text-ink-3', insetCls)}>{ai.data.summary}</pre>
            ) : null}
          </Surface>

          <Surface className="space-y-4 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-b from-paper to-bone text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]"><ClockIcon size={15} /></span>
              <h3 className="font-display text-base font-bold text-ink">Timeline</h3>
            </div>
            {(detail.data?.events ?? []).length === 0 ? (
              <p className="text-sm text-ink-4">No activity yet.</p>
            ) : (
              <ol className="relative max-h-72 space-y-3.5 overflow-y-auto border-l border-ink/10 pl-5 scrollbar-thin">
                {(detail.data?.events ?? []).map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-ink ring-4 ring-paper" aria-hidden />
                    <div className="text-xs font-medium text-ink">
                      {e.action}
                      {e.toStatus ? <span className="text-ink-4"> → {e.toStatus.replace(/_/g, ' ')}</span> : null}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-5">{new Date(e.createdAt).toLocaleString()}</div>
                  </li>
                ))}
              </ol>
            )}
          </Surface>
        </aside>
      </div>
    </div>
  );
}

const inputCls = (extra?: string) =>
  cn(
    'h-10 rounded-xl bg-paper px-3.5 text-sm text-ink placeholder:text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow duration-200 hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.24)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]',
    extra,
  );

/** Small status-style pill used in the quotations header. */
function Pill({ children, tone, icon }: { children: ReactNode; tone: 'success' | 'info' | 'warning'; icon?: ReactNode }) {
  const cls = {
    success: 'bg-mint/[0.08] text-mint ring-mint/25',
    info: 'bg-copper/[0.08] text-copper-deep ring-copper/25',
    warning: 'bg-amber/[0.1] text-[#a86c28] ring-amber/30',
  }[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset', cls)}>
      {icon}
      {children}
    </span>
  );
}

/** Inline alert for partial quotes. */
function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-amber/[0.08] p-3 text-xs leading-relaxed text-[#8a5a22] shadow-[inset_0_0_0_1px_rgba(196,132,58,0.25)]">
      <AlertTriangleIcon size={14} className="mt-0.5 shrink-0 text-amber" />
      <span>{children}</span>
    </div>
  );
}
