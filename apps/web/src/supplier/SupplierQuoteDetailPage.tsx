import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useSupplierId } from './useSupplierId';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { StatusPill } from '@/pages/RfqsPage';
import { useToast } from '@vyro/ui';
import { RfqDocsUpload } from '@/components/RfqDocsUpload';

interface QuoteLine { rfqItemId?: string; productId?: string; description: string; quantity: string; unitPrice: string; discount: string; isAlternative?: boolean; alternativeFor?: string; notes?: string; tierQty?: string; tierPrice?: string }
interface CounterRow { id: string; offeredByType: string; proposedTotalCents: number; message?: string | null; status: string; createdAt: number }

function SupplierCounters({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['sup-counters', quoteId],
    queryFn: () => api.get<{ counters: CounterRow[] }>(`/rfqs/quotes/${quoteId}/history`).then((r) => ({ counters: r.counters })),
  });
  const pending = (data?.counters ?? []).filter((c) => c.status === 'pending');
  if (!pending.length) return null;
  return (
    <div className="mt-2 rounded-xl border border-copper/40 bg-copper/5 p-3 text-sm">
      <div className="font-semibold">Buyer counter-offers awaiting your response</div>
      {pending.map((c) => (
        <div key={c.id} className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono">Rs. {(c.proposedTotalCents / 100).toLocaleString()}</span>
          {c.message && <span className="text-ink-3">“{c.message}”</span>}
          <button onClick={() => void api.post(`/rfqs/counters/${c.id}/respond`, { accept: true }).then(() => { void qc.invalidateQueries({ queryKey: ['sup-counters', quoteId] }); onChanged(); })} className="rounded bg-mint px-3 py-1 text-sm text-white">Accept</button>
          <button onClick={() => void api.post(`/rfqs/counters/${c.id}/respond`, { accept: false }).then(() => { void qc.invalidateQueries({ queryKey: ['sup-counters', quoteId] }); onChanged(); })} className="rounded border border-line px-3 py-1 text-sm">Reject</button>
        </div>
      ))}
    </div>
  );
}

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
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<string | null>(null);

  const detail = useQuery({ queryKey: ['sup-rfq', rfqId], queryFn: () => api.post<{ rfq: Record<string, unknown>; business: { name: string; city?: string; district?: string } | null; items: Array<{ id: string; productId?: string; description: string; quantity: number; unit: string; targetPriceCents?: number; specifications?: string }> }>('/rfqs/supplier/view', { rfqId, supplierId }), enabled: !!rfqId && !!supplierId });
  const mine = useQuery({ queryKey: ['sup-quotes', rfqId, supplierId], queryFn: () => api.get<{ quotes: Array<{ quote: { id: string; status: string; version: number; totalCents: number; quoteNumber: string }; items: unknown[] }> }>(`/rfqs/${rfqId}/quotes?supplierId=${supplierId}`), enabled: !!rfqId && !!supplierId });
  const thread = useQuery({
    queryKey: ['sup-thread', rfqId, mine.data?.quotes[0]?.quote.id],
    queryFn: () => api.get<{ messages: Array<{ id: string; senderType: string; message: string; createdAt: number }> }>(`/rfqs/${rfqId}/messages?quoteId=${mine.data!.quotes[0]!.quote.id}`),
    enabled: !!rfqId && !!mine.data?.quotes[0],
  });

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

  const rfq = detail.data?.rfq as unknown as { title: string; rfqNumber: string; status: string; deliveryLocation?: string; deliveryCity?: string; deliveryDistrict?: string; requiredDeliveryDate?: number; deadline?: number; paymentTerms?: string; paymentMethod?: string; specifications?: string; packagingRequirements?: string; qualityRequirements?: string } | undefined;
  const buyer = detail.data?.business;
  const refreshMine = () => { void qc.invalidateQueries({ queryKey: ['sup-quotes', rfqId] }); void qc.invalidateQueries({ queryKey: ['sup-thread', rfqId] }); };
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/supplier/quotes" className="text-sm underline text-ink-3">← Quote requests</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{rfq?.title ?? 'RFQ'}</h1>
          <div className="text-sm text-ink-3">{rfq?.rfqNumber}{buyer ? ` · Buyer: ${buyer.name}${buyer.district ? `, ${buyer.district}` : ''}` : ''} {rfq?.deadline ? `· quote by ${new Date(rfq.deadline).toLocaleDateString()}` : ''}</div>
        </div>
        {rfq && <StatusPill status={rfq.status} />}
      </div>
      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Surface className="p-5">
          <h2 className="font-semibold">Delivery & terms</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            <li>Location: {[rfq?.deliveryLocation, rfq?.deliveryCity, rfq?.deliveryDistrict].filter(Boolean).join(', ') || '—'}</li>
            <li>Required by: {rfq?.requiredDeliveryDate ? new Date(rfq.requiredDeliveryDate).toLocaleDateString() : '—'}</li>
            <li>Payment: {[rfq?.paymentMethod, rfq?.paymentTerms].filter(Boolean).join(' · ') || '—'}</li>
            {rfq?.specifications && <li>Specs: {rfq.specifications}</li>}
            {rfq?.packagingRequirements && <li>Packaging: {rfq.packagingRequirements}</li>}
            {rfq?.qualityRequirements && <li>Quality: {rfq.qualityRequirements}</li>}
          </ul>
        </Surface>
        <Surface className="p-5">
          <h2 className="font-semibold">Attachments</h2>
          <RfqDocsUpload rfqId={rfqId!} />
        </Surface>
      </div>

      <Surface className="mt-4 p-5">
        <h2 className="font-semibold">Requested ({items.length})</h2>
        <ul className="mt-2 text-sm space-y-1">{items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.description}{i.specifications ? ` — ${i.specifications}` : ''}</span><span className="font-mono">{i.quantity} · target {i.targetPriceCents ? `Rs. ${(i.targetPriceCents / 100).toLocaleString()}` : '—'}</span></li>)}</ul>
      </Surface>

      {(mine.data?.quotes.length ?? 0) > 0 && (
        <Surface className="mt-4 p-5">
          <h2 className="font-semibold">My quotations</h2>
          <ul className="mt-2 space-y-3 text-sm">
            {mine.data!.quotes.map((q) => (
              <li key={q.quote.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{q.quote.quoteNumber} · v{q.quote.version} — <StatusPill status={q.quote.status} /></span>
                  <span className="font-mono">Rs. {(q.quote.totalCents / 100).toLocaleString()}</span>
                </div>
                <SupplierCounters quoteId={q.quote.id} onChanged={refreshMine} />
              </li>
            ))}
          </ul>
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

      {mine.data?.quotes[0] && (
        <Surface className="mt-4 p-5">
          <h2 className="font-semibold">Clarifications with buyer</h2>
          <ul className="mt-2 max-h-56 space-y-2 overflow-auto text-sm">
            {(thread.data?.messages ?? []).map((m) => (
              <li key={m.id}><span className="rounded bg-paper border border-line px-2 py-0.5 text-xs">{m.senderType}</span> {m.message} <span className="text-xs text-ink-4">{new Date(m.createdAt).toLocaleString()}</span></li>
            ))}
            {(thread.data?.messages ?? []).length === 0 && <li className="text-xs text-ink-4">No messages yet.</li>}
          </ul>
          <div className="mt-3 flex gap-2">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask about specs, delivery, terms…" className="flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
            <Button onClick={() => { if (!msg.trim()) return; const m = msg; setMsg(''); void api.post(`/rfqs/${rfqId}/messages`, { quoteId: mine.data!.quotes[0]!.quote.id, message: m }).then(refreshMine).catch((e) => setError(e instanceof Error ? e.message : 'Failed')); }}>Send</Button>
          </div>
        </Surface>
      )}
    </div>
  );
}
