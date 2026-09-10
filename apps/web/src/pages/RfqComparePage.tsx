import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Surface } from '@/components/brand/Surface';

type QuoteRow = {
  quote: { id: string; quoteNumber: string; status: string; subtotalCents: number; deliveryFeeCents: number; taxCents: number; discountCents: number; paymentTerms?: string; estimatedDeliveryDate?: number; validUntil?: number };
  items: Array<{ rfqItemId: string | null; description: string; unitPriceCents: number; subtotalCents: number; isAlternative: number }>;
  tiers: Array<{ quoteItemId: string; minQty: number; unitPriceCents: number }>;
  supplier: { id: string; name: string; city?: string; pastOrders: number; pastCompleted: number } | null;
  landedCents: number; coverage: string; isPartial: boolean; valid: boolean;
};

interface CompareData {
  rfq: { rfqNumber: string; title: string };
  items: Array<{ id: string; description: string; quantity: number }>;
  quotes: QuoteRow[];
  bestPriceQuoteId: string | null; fastestQuoteId: string | null;
  splitOptimization: { perItemBest: Array<{ rfqItemId: string; quoteId: string; subtotalCents: number }>; splitItemsTotalCents: number; splitDeliveryCents: number; splitLandedEstimateCents: number; latestSplitEta: number | null; supplierCount: number };
}

const money = (c: number) => `Rs. ${(c / 100).toLocaleString()}`;

function Badge({ tone, children }: { tone: 'mint' | 'sky' | 'amber' | 'ink'; children: React.ReactNode }) {
  const cls = tone === 'mint' ? 'bg-mint/10 border-mint/40 text-mint'
    : tone === 'sky' ? 'bg-sky-500/10 border-sky-500/40 text-sky-700'
    : tone === 'amber' ? 'bg-amber/10 border-amber/40 text-amber' : 'bg-ink text-white border-ink';
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

export function RfqComparePage() {
  const { id } = useParams();
  usePageTitle('Compare quotes');
  const { data, isLoading } = useQuery({
    queryKey: ['rfq-compare-full', id],
    queryFn: () => api.get<CompareData>(`/rfqs/${id}/compare`),
    enabled: !!id,
  });
  const ai = useQuery({
    queryKey: ['rfq-ai-compare', id],
    queryFn: () => api.get<{ recommendation: string }>(`/rfqs/${id}/ai-summary`),
    enabled: !!id,
  });
  if (isLoading || !data) return <div className="mx-auto max-w-6xl px-4 py-10">Composing your comparison…</div>;
  const best = data.quotes.find((q) => q.quote.id === data.bestPriceQuoteId);
  const fastest = data.quotes.find((q) => q.quote.id === data.fastestQuoteId);
  const coverageRatio = (c: string) => {
    const [a, b] = c.split('/').map(Number);
    return (a ?? 0) / Math.max(1, b ?? 0);
  };
  const bestCoverage = [...data.quotes].sort((a, b) => coverageRatio(b.coverage) - coverageRatio(a.coverage))[0];
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Link to={`/rfqs/${id}`} className="text-sm underline text-ink-3">← Back to RFQ</Link>
      <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Compare quotes · {data.rfq.rfqNumber}</div>
      <h1 className="mt-1 max-w-3xl text-4xl font-bold leading-tight">{data.rfq.title}</h1>
      <p className="mt-1 text-sm text-ink-3">Every total is landed cost — subtotal + delivery + tax − discounts — calculated by the server. Unit prices alone never decide.</p>

      {/* Verdict hero */}
      <Surface className="mt-6 border-l-4 border-l-mint p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Which supplier should I choose</div>
        {best ? (
          <>
            <div className="mt-1 text-2xl font-bold">{best.supplier?.name ?? 'Best quote'} · {money(best.landedCents)} landed</div>
            <p className="mt-2 max-w-3xl text-sm text-ink-2">{ai.data?.recommendation ?? `Lowest verified total landed cost at ${money(best.landedCents)}${fastest && fastest.quote.id !== best.quote.id ? ` — ${fastest.supplier?.name} delivers sooner if timing matters.` : ' with competitive delivery.'}`}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="mint">BEST PRICE · {best.quote.quoteNumber}</Badge>
              {fastest && <Badge tone="sky">FASTEST · {fastest.quote.quoteNumber}{fastest.quote.estimatedDeliveryDate ? ` · ${new Date(fastest.quote.estimatedDeliveryDate).toLocaleDateString()}` : ''}</Badge>}
              {bestCoverage && bestCoverage.coverage !== '0/0' && <Badge tone="ink">COVERAGE · {bestCoverage.quote.quoteNumber} {bestCoverage.coverage}</Badge>}
            </div>
          </>
        ) : <p className="mt-2 text-sm">No complete valid quotes yet — invite more suppliers or await submissions.</p>}
      </Surface>

      {/* Quote cards */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {data.quotes.map((q) => (
          <Surface key={q.quote.id} className={`p-5 ${q.quote.id === data.bestPriceQuoteId ? 'border-mint ring-1 ring-mint' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{q.supplier?.name ?? 'Supplier'}</div>
              <span className="font-mono text-xs text-ink-4">{q.quote.quoteNumber}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {q.quote.id === data.bestPriceQuoteId && <Badge tone="mint">BEST PRICE</Badge>}
              {q.quote.id === data.fastestQuoteId && <Badge tone="sky">FASTEST</Badge>}
              {q.isPartial && <Badge tone="amber">PARTIAL</Badge>}
              {!q.valid && <Badge tone="amber">EXPIRED</Badge>}
            </div>
            <div className="mt-2 text-3xl font-bold">{money(q.landedCents)}</div>
            <div className="text-xs text-ink-4">total landed cost</div>
            <dl className="mt-3 space-y-1 text-xs">
              <div className="flex justify-between"><dt className="text-ink-4">Subtotal</dt><dd className="font-mono">{money(q.quote.subtotalCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Delivery</dt><dd className="font-mono">{money(q.quote.deliveryFeeCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Tax</dt><dd className="font-mono">{money(q.quote.taxCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Discount</dt><dd className="font-mono">−{money(q.quote.discountCents)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Fulfillment</dt><dd>{q.coverage} lines</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Payment</dt><dd>{q.quote.paymentTerms ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Delivery by</dt><dd>{q.quote.estimatedDeliveryDate ? new Date(q.quote.estimatedDeliveryDate).toLocaleDateString() : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">Valid until</dt><dd>{q.quote.validUntil ? new Date(q.quote.validUntil).toLocaleDateString() : '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-4">History with you</dt><dd>{q.supplier ? `${q.supplier.pastCompleted}/${q.supplier.pastOrders} completed` : '—'}</dd></div>
            </dl>
          </Surface>
        ))}
      </div>

      {/* Per-item matrix with availability states */}
      <h2 className="mt-10 text-2xl font-bold">Line-by-line</h2>
      <p className="text-sm text-ink-3">Quoted · unavailable · alternative — never Rs. 0 for missing lines.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[680px] border-collapse bg-paper text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-ink-4">
              <th className="p-3">Requested</th>
              {data.quotes.map((q) => <th key={q.quote.id} className="p-3">{q.supplier?.name ?? q.quote.quoteNumber}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.id} className="border-t border-line">
                <td className="p-3 font-medium">{it.description} <span className="font-mono text-xs text-ink-4">{it.quantity}</span></td>
                {data.quotes.map((q) => {
                  const line = q.items.find((l) => l.rfqItemId === it.id && !l.isAlternative);
                  const alt = q.items.find((l) => l.isAlternative && (l.rfqItemId === it.id || (l as { alternativeForRfqItemId?: string }).alternativeForRfqItemId === it.id));
                  return (
                    <td key={q.quote.id} className="p-3">
                      {line ? <span className="font-mono">{money(line.subtotalCents)}</span>
                        : alt ? <span><Badge tone="amber">ALTERNATIVE</Badge> <span className="font-mono">{money(alt.subtotalCents)}</span><br /><span className="text-xs text-ink-3">{alt.description}</span></span>
                        : <span className="text-xs uppercase tracking-wider text-ink-4">Unavailable</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.splitOptimization.supplierCount > 1 && (
        <Surface className="mt-6 p-5">
          <h2 className="font-semibold">Single vs multi-supplier</h2>
          <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-line p-4">
              <div className="text-xs uppercase tracking-widest text-ink-4">Single supplier (best complete)</div>
              <div className="mt-1 text-2xl font-bold">{best ? money(best.landedCents) : '—'}</div>
              <div className="text-xs text-ink-3">One delivery, one relationship, simplest receiving.</div>
            </div>
            <div className="rounded-xl border border-amber/40 p-4">
              <div className="text-xs uppercase tracking-widest text-ink-4">Multi-supplier ({data.splitOptimization.supplierCount} suppliers)</div>
              <div className="mt-1 text-2xl font-bold">{money(data.splitOptimization.splitLandedEstimateCents)}</div>
              <div className="text-xs text-ink-3">Items {money(data.splitOptimization.splitItemsTotalCents)} + {data.splitOptimization.supplierCount} deliveries {money(data.splitOptimization.splitDeliveryCents)}{data.splitOptimization.latestSplitEta ? ` · all in by ${new Date(data.splitOptimization.latestSplitEta).toLocaleDateString()}` : ''}.</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-4">Splitting is advisory only — awarding stays explicit, one quote at a time.</p>
        </Surface>
      )}
    </div>
  );
}
