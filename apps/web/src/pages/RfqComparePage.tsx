import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Surface } from '@/components/brand/Surface';

type QuoteRow = {
  quote: { id: string; quoteNumber: string; status: string; subtotalCents: number; deliveryFeeCents: number; taxCents: number; discountCents: number; paymentTerms?: string; estimatedDeliveryDate?: number; validUntil?: number };
  items: Array<{ rfqItemId: string | null; description: string; unitPriceCents: number; subtotalCents: number; isAlternative: number }>;
  supplier: { name: string } | null; landedCents: number; coverage: string; isPartial: boolean;
};

export function RfqComparePage() {
  const { id } = useParams();
  usePageTitle('Compare quotes');
  const { data } = useQuery({
    queryKey: ['rfq-compare-full', id],
    queryFn: () => api.get<{ rfq: { rfqNumber: string; title: string }; items: Array<{ id: string; description: string; quantity: number }>; quotes: Array<{ quote: { id: string; quoteNumber: string; status: string; subtotalCents: number; deliveryFeeCents: number; taxCents: number; discountCents: number; paymentTerms?: string; estimatedDeliveryDate?: number; validUntil?: number }; items: Array<{ rfqItemId: string | null; description: string; unitPriceCents: number; subtotalCents: number; isAlternative: number }>; supplier: { name: string } | null; landedCents: number; coverage: string; isPartial: boolean }>; bestPriceQuoteId: string | null; fastestQuoteId: string | null; splitOptimization: { perItemBest: Array<{ rfqItemId: string; quoteId: string; subtotalCents: number }>; splitItemsTotalCents: number; supplierCount: number } }>(`/rfqs/${id}/compare`),
    enabled: !!id,
  });
  if (!data) return <div className="mx-auto max-w-6xl px-4 py-10">Loading comparison…</div>;
  const money = (c: number) => `Rs. ${(c / 100).toLocaleString()}`;
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Link to={`/rfqs/${id}`} className="text-sm underline text-ink-3">← Back to RFQ</Link>
      <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Compare quotes · {data.rfq.rfqNumber}</div>
      <h1 className="mt-1 text-4xl font-bold">{data.rfq.title}</h1>
      <p className="mt-1 text-sm text-ink-3">Totals are landed cost: subtotal + delivery + tax − discounts, computed server-side.</p>
      <div className="mt-6 space-y-3 md:hidden">
        {data.quotes.map((q) => (
          <div key={q.quote.id} className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{q.supplier?.name ?? 'Supplier'}</span>
              <span className="font-mono text-xs">{q.quote.quoteNumber}</span>
            </div>
            <div className="mt-2 text-2xl font-bold">{money(q.landedCents)}</div>
            <ul className="mt-2 space-y-1 text-xs">
              <li>Subtotal: {money(q.quote.subtotalCents)}</li>
              <li>Delivery: {money(q.quote.deliveryFeeCents)}</li>
              <li>Tax: {money(q.quote.taxCents)}</li>
              <li>Discount: {money(q.quote.discountCents)}</li>
              <li>Coverage: {q.coverage}</li>
              <li>Payment: {q.quote.paymentTerms ?? '—'}</li>
              <li>Status: {q.quote.status}</li>
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-6 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-widest text-ink-4">
              <th className="p-3">Metric</th>
              {data.quotes.map((q) => (
                <th key={q.quote.id} className="p-3">
                  {q.supplier?.name ?? 'Supplier'}<br /><span className="font-mono font-normal">{q.quote.quoteNumber}</span>
                  {q.quote.id === data.bestPriceQuoteId && <span className="ml-2 rounded-full bg-mint/10 border border-mint/40 px-2 py-0.5 text-mint">BEST PRICE</span>}
                  {q.quote.id === data.fastestQuoteId && <span className="ml-2 rounded-full bg-sky-500/10 border border-sky-500/40 px-2 py-0.5">FASTEST</span>}
                  {q.isPartial && <span className="ml-2 rounded-full bg-amber/10 border border-amber/40 px-2 py-0.5 text-amber">PARTIAL</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Landed total', (q: QuoteRow) => money(q.landedCents)],
                ['Subtotal', (q: QuoteRow) => money(q.quote.subtotalCents)],
                ['Delivery', (q: QuoteRow) => money(q.quote.deliveryFeeCents)],
                ['Tax', (q: QuoteRow) => money(q.quote.taxCents)],
                ['Discount', (q: QuoteRow) => money(q.quote.discountCents)],
                ['Coverage', (q: QuoteRow) => q.coverage],
                ['Payment terms', (q: QuoteRow) => q.quote.paymentTerms ?? '—'],
                ['Delivery date', (q: QuoteRow) => q.quote.estimatedDeliveryDate ? new Date(q.quote.estimatedDeliveryDate).toLocaleDateString() : '—'],
                ['Valid until', (q: QuoteRow) => q.quote.validUntil ? new Date(q.quote.validUntil).toLocaleDateString() : '—'],
                ['Status', (q: QuoteRow) => q.quote.status],
              ] as Array<[string, (q: QuoteRow) => string]>
            ).map(([label, fn]) => (
              <tr key={label} className="border-t border-line">
                <td className="p-3 font-medium">{label}</td>
                {data?.quotes.map((q) => <td key={q.quote.id} className="p-3">{fn(q)}</td>)}
              </tr>
            ))}
            {data.items.map((it) => (
              <tr key={it.id} className="border-t border-line bg-paper/50">
                <td className="p-3">{it.description} <span className="text-ink-4">({it.quantity})</span></td>
                {data.quotes.map((q) => {
                  const line = q.items.find((l) => l.rfqItemId === it.id && !l.isAlternative);
                  const alt = q.items.find((l) => l.rfqItemId === it.id && l.isAlternative);
                  return <td key={q.quote.id} className="p-3 font-mono">{line ? money(line.subtotalCents) : alt ? `alt ${money(alt.subtotalCents)}` : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.splitOptimization.supplierCount > 1 && (
        <Surface className="mt-6 p-5">
          <h2 className="font-semibold">Split-supplier optimization</h2>
          <p className="mt-1 text-sm text-ink-2">Lowest item total {money(data.splitOptimization.splitItemsTotalCents)} across {data.splitOptimization.supplierCount} suppliers (before extra delivery fees) — weigh savings against multi-supplier complexity.</p>
        </Surface>
      )}
    </div>
  );
}
