import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useSupplierId } from './useSupplierId';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { RfqDocsUpload } from '@/components/RfqDocsUpload';

interface QuoteLine { rfqItemId?: string; productId?: string; description: string; quantity: string; unitPrice: string; discount: string; isAlternative?: boolean; alternativeFor?: string; notes?: string; tierQty?: string; tierPrice?: string }

export function SupplierQuoteDetailPage() {
  const { rfqId } = useParams();
  usePageTitle('Quote detail');
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [validDays, setValidDays] = useState('14');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ['sup-rfq', rfqId], queryFn: () => api.post<{ rfq: Record<string, unknown>; items: Array<{ id: string; productId?: string; description: string; quantity: number; unit: string; targetPriceCents?: number; specifications?: string }> }>('/rfqs/supplier/view', { rfqId, supplierId }), enabled: !!rfqId && !!supplierId });
  const mine = useQuery({ queryKey: ['sup-quotes', rfqId, supplierId], queryFn: () => api.get<{ quotes: Array<{ quote: { id: string; status: string; totalCents: number; quoteNumber: string }; items: unknown[] }> }>(`/rfqs/${rfqId}/quotes?supplierId=${supplierId}`), enabled: !!rfqId && !!supplierId });

  const items = detail.data?.items ?? [];
  if (lines.length === 0 && items.length > 0) {
    setLines(items.map((i) => ({ rfqItemId: i.id, ...(i.productId ? { productId: i.productId } : {}), description: i.description, quantity: String(i.quantity), unitPrice: i.targetPriceCents ? String(i.targetPriceCents / 100) : '', discount: '0' })));
  }

  async function submit() {
    setError(null);
    const payload = {
      deliveryFeeCents: Math.round(Number(deliveryFee || 0) * 100),
      validUntil: Date.now() + Number(validDays || 14) * 86400000,
      paymentTerms: paymentTerms || undefined, notes: notes || undefined,
      items: lines.filter((l) => l.description.trim() && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0).map((l) => ({
        rfqItemId: l.isAlternative ? undefined : l.rfqItemId, productId: l.productId, description: l.description,
        quantity: Number(l.quantity), unitPriceCents: Math.round(Number(l.unitPrice) * 100),
        discountCents: Math.round(Number(l.discount || 0) * 100),
        isAlternative: !!l.isAlternative, alternativeForRfqItemId: l.alternativeFor || undefined, notes: l.notes || undefined,
        tiers: l.tierQty && l.tierPrice ? [{ minQty: Number(l.tierQty), unitPriceCents: Math.round(Number(l.tierPrice) * 100) }] : [],
      })),
    };
    if (!payload.items.length) { setError('Add at least one priced line — leave unquoted items blank for a partial quote'); return; }
    try {
      await api.post(`/rfqs/${rfqId}/quote?supplierId=${supplierId}`, payload);
      toast.show(toast.success('Quote submitted'));
      void qc.invalidateQueries({ queryKey: ['sup-quotes', rfqId] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Submit failed'); }
  }

  const rfq = detail.data?.rfq as unknown as { title: string; rfqNumber: string; deliveryLocation?: string; requiredDeliveryDate?: number; deadline?: number } | undefined;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/supplier/quotes" className="text-sm underline text-ink-3">← Quote requests</Link>
      <h1 className="mt-2 text-3xl font-bold">{rfq?.title ?? 'RFQ'}</h1>
      <div className="text-sm text-ink-3">{rfq?.rfqNumber} · {rfq?.deliveryLocation ?? ''} {rfq?.deadline ? `· due ${new Date(rfq.deadline).toLocaleDateString()}` : ''}</div>
      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

      <Surface className="mt-4 p-5">
        <h2 className="font-semibold">Requested ({items.length})</h2>
        <ul className="mt-2 text-sm space-y-1">{items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.description}{i.specifications ? ` — ${i.specifications}` : ''}</span><span className="font-mono">{i.quantity} · target {i.targetPriceCents ? `Rs. ${(i.targetPriceCents / 100).toLocaleString()}` : '—'}</span></li>)}</ul>
      </Surface>

      {(mine.data?.quotes.length ?? 0) > 0 && (
        <Surface className="mt-4 p-5">
          <h2 className="font-semibold">My quotes</h2>
          <ul className="mt-2 text-sm">{mine.data!.quotes.map((q) => <li key={q.quote.id} className="flex flex-col gap-2 sm:flex-row sm:justify-between"><span>{q.quote.quoteNumber} — {q.quote.status}</span><span className="font-mono">Rs. {(q.quote.totalCents / 100).toLocaleString()}</span></li>)}</ul>
          {mine.data!.quotes.map((q) => <RfqDocsUpload key={q.quote.id} rfqId={rfqId!} quoteId={q.quote.id} />)}
        </Surface>
      )}

      <Surface className="mt-4 p-5">
        <h2 className="font-semibold">Submit quote <span className="font-normal text-ink-4 text-sm">(blank lines = partial quote; tick alternative to propose a substitute)</span></h2>
        {lines.map((l, i) => (
          <div key={i} className="mt-3 grid gap-2 rounded-xl border border-line p-3 md:grid-cols-7">
            <input value={l.description} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Product" className="rounded-lg border border-line px-2 py-1 text-sm md:col-span-2" />
            <input value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" className="rounded-lg border border-line px-2 py-1 text-sm" />
            <input value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unitPrice: e.target.value } : x))} placeholder="Unit Rs" inputMode="decimal" className="rounded-lg border border-line px-2 py-1 text-sm" />
            <input value={l.tierQty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, tierQty: e.target.value } : x))} placeholder="Break qty" className="rounded-lg border border-line px-2 py-1 text-sm" />
            <input value={l.tierPrice} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, tierPrice: e.target.value } : x))} placeholder="Break Rs" className="rounded-lg border border-line px-2 py-1 text-sm" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!l.isAlternative} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, isAlternative: e.target.checked } : x))} /> Alt</label>
          </div>
        ))}
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <label className="text-sm">Delivery fee Rs.<input value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
          <label className="text-sm">Valid (days)<input value={validDays} onChange={(e) => setValidDays(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
          <label className="text-sm md:col-span-2">Payment terms<input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
        </div>
        <label className="mt-2 block text-sm">Notes / conditions<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
        <div className="mt-4"><Button onClick={() => void submit()}>Submit quote</Button></div>
      </Surface>
    </div>
  );
}
