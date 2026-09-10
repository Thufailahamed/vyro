import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { StatusPill } from './RfqsPage';
import { useToast } from '@vyro/ui';
import { RfqDocsUpload } from '@/components/RfqDocsUpload';
import { RfqSupplierDiscovery } from '@/components/RfqSupplierDiscovery';
import { usePageTitle } from '@/lib/usePageTitle';

interface VersionRow { version: number; changedByUserId: string; previousTotalCents: number | null; newTotalCents: number; changesJson?: string | null; createdAt: number }
interface CounterRow { id: string; offeredByType: string; proposedTotalCents: number; proposedDeliveryFeeCents?: number | null; proposedPaymentTerms?: string | null; message?: string | null; status: string; createdAt: number }

function QuoteHistory({ quoteId, onChanged }: { quoteId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['quote-history', quoteId],
    queryFn: () => api.get<{ versions: VersionRow[]; counters: CounterRow[] }>(`/rfqs/quotes/${quoteId}/history`),
    enabled: open,
  });
  if (!open) return <button onClick={() => setOpen(true)} className="text-xs underline text-ink-3">Version history & negotiation →</button>;
  const versions = data?.versions ?? [];
  const counters = data?.counters ?? [];
  return (
    <div className="mt-3 rounded-xl border border-line bg-bone/40 p-3 text-xs">
      <button onClick={() => setOpen(false)} className="underline text-ink-3">Hide history</button>
      <h4 className="mt-2 font-semibold">Versions (never overwritten)</h4>
      <ul className="mt-1 space-y-1">
        {versions.map((v) => (
          <li key={v.version}>v{v.version} · {new Date(v.createdAt).toLocaleString()} · {v.previousTotalCents != null ? `Rs. ${(v.previousTotalCents / 100).toLocaleString()} → ` : 'initial '}Rs. {(v.newTotalCents / 100).toLocaleString()}</li>
        ))}
        {versions.length === 0 && <li className="text-ink-4">Loading…</li>}
      </ul>
      <h4 className="mt-3 font-semibold">Counter-offers</h4>
      <ul className="mt-1 space-y-2">
        {counters.map((co) => (
          <li key={co.id} className="rounded-lg border border-line bg-white p-2">
            <div><span className="rounded bg-paper border border-line px-1.5">{co.offeredByType}</span> Rs. {(co.proposedTotalCents / 100).toLocaleString()} · <StatusPill status={co.status} /></div>
            {co.proposedPaymentTerms && <div>Terms: {co.proposedPaymentTerms}</div>}
            {co.message && <div className="text-ink-2">“{co.message}”</div>}
            <div className="text-ink-4">{new Date(co.createdAt).toLocaleString()}</div>
            {co.status === 'pending' && (
              <div className="mt-1 flex gap-2">
                <button onClick={() => void api.post(`/rfqs/counters/${co.id}/respond`, { accept: true }).then(() => { void qc.invalidateQueries({ queryKey: ['quote-history', quoteId] }); onChanged(); })} className="rounded bg-mint px-2 py-1 text-white">Accept</button>
                <button onClick={() => void api.post(`/rfqs/counters/${co.id}/respond`, { accept: false }).then(() => { void qc.invalidateQueries({ queryKey: ['quote-history', quoteId] }); onChanged(); })} className="rounded border border-line px-2 py-1">Reject</button>
              </div>
            )}
          </li>
        ))}
        {counters.length === 0 && <li className="text-ink-4">No counter-offers yet.</li>}
      </ul>
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

  const rfq = detail.data?.rfq as unknown as { rfqNumber: string; title: string; status: string; businessId: string; description?: string; deadline?: number } | undefined;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['rfq', id] }); void qc.invalidateQueries({ queryKey: ['rfq-quotes', id] }); void qc.invalidateQueries({ queryKey: ['rfq-compare', id] }); };

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setError(null);
    try { await fn(); toast.show(toast.success(okMsg)); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
  }

  if (!rfq) return <div className="mx-auto max-w-5xl px-4 py-10">{detail.isLoading ? 'Loading…' : 'RFQ not found'}</div>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link to="/rfqs" className="text-sm underline text-ink-3">← All RFQs</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-ink-4">{rfq.rfqNumber}</div>
          <h1 className="mt-1 text-4xl font-bold">{rfq.title}</h1>
          <div className="mt-2 flex items-center gap-2"><StatusPill status={rfq.status} />{rfq.deadline && <span className="text-sm text-ink-3">Due {new Date(rfq.deadline).toLocaleString()}</span>}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {rfq.status === 'draft' && <Button onClick={() => void act(() => api.post(`/rfqs/${id}/publish`, {}), 'RFQ published')}>Publish</Button>}
          {['open', 'quoting', 'quotes_received', 'under_review'].includes(rfq.status) && <Button onClick={() => void act(() => api.post(`/rfqs/${id}/close`, {}), 'RFQ closed')}>Close</Button>}
          {rfq.status === 'expired' && <Button onClick={() => void act(() => api.post(`/rfqs/${id}/reopen`, {}), 'RFQ reopened')}>Reopen</Button>}
          {rfq.status === 'awarded' && <Button onClick={() => void act(async () => { const r = await api.post<{ poId: string }>(`/rfqs/${id}/convert`, {}); navigate(`/orders/${r.poId}`); }, 'Purchase order created')}>Accept & create order →</Button>}
          <Link to={`/rfqs/${id}/compare`}><Button>Compare quotes</Button></Link>
        </div>
      </div>
      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}
      {rfq.description && <Surface className="mt-4 p-5"><p className="text-ink-2">{rfq.description}</p></Surface>}

      <RfqSupplierDiscovery rfqId={id!} rfqStatus={rfq.status} />

      <div className="mt-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
        <Surface className="p-5">
          <h2 className="font-semibold">Requested items</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {(detail.data?.items ?? []).map((it) => (
              <li key={it.id as string} className="flex justify-between gap-2"><span>{it.description as string}</span><span className="font-mono">{it.quantity as number} {it.unit as string}</span></li>
            ))}
          </ul>
        </Surface>
        <Surface className="p-5">
          <h2 className="font-semibold">AI quote analysis</h2>
          <p className="mt-2 text-sm text-ink-2">{ai.data?.recommendation ?? 'Waiting for complete valid quotes…'}</p>
          {ai.data?.summary && <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-3">{ai.data.summary}</pre>}
        </Surface>
        <Surface className="p-5">
          <h2 className="font-semibold">Timeline</h2>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs text-ink-3">
            {(detail.data?.events ?? []).map((e, i) => <li key={i}>{new Date(e.createdAt).toLocaleString()} — {e.action}{e.toStatus ? ` → ${e.toStatus}` : ''}</li>)}
          </ul>
        </Surface>
      </div>

      <h2 className="mt-8 text-2xl font-bold">Quotations <span className="text-base font-normal text-ink-4">({quotes.data?.quotes.length ?? 0})</span></h2>
      {compare.data && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {compare.data.bestPriceQuoteId && <span className="rounded-full bg-mint/10 border border-mint/40 px-3 py-1">BEST PRICE: {(compare.data.quotes.find((q) => (q as { quote: { id: string; quoteNumber: string } }).quote.id === compare.data.bestPriceQuoteId) as { quote: { quoteNumber: string } } | undefined)?.quote.quoteNumber}</span>}
          {compare.data.fastestQuoteId && <span className="rounded-full bg-sky-500/10 border border-sky-500/40 px-3 py-1">FASTEST: {(compare.data.quotes.find((q) => (q as { quote: { id: string; quoteNumber: string } }).quote.id === compare.data.fastestQuoteId) as { quote: { quoteNumber: string } } | undefined)?.quote.quoteNumber}</span>}
          {compare.data.splitOptimization.supplierCount > 1 && <span className="rounded-full bg-amber/10 border border-amber/40 px-3 py-1">SPLIT: {compare.data.splitOptimization.supplierCount} suppliers from Rs. {(compare.data.splitOptimization.splitItemsTotalCents / 100).toLocaleString()}</span>}
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-1 md:grid-cols-2">
        {(quotes.data?.quotes ?? []).map(({ quote, items }) => {
          const q = quote as unknown as { id: string; quoteNumber: string; status: string; version: number; totalCents: number; currency: string; deliveryFeeCents: number; paymentTerms?: string; validUntil?: number; estimatedDeliveryDate?: number; notes?: string; isPartial: number | boolean; supplierId: string };
          const expired = q.validUntil != null && q.validUntil < Date.now();
          const awardable = !['awarded', 'converted_to_order'].includes(rfq.status) && !expired && ['submitted', 'under_review', 'negotiating'].includes(q.status);
          return (
            <Surface key={q.id} className="p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-ink-4">{q.quoteNumber} · v{q.version}</span>
                <StatusPill status={expired ? 'expired' : q.status} />
              </div>
              {!!q.isPartial && <div className="mt-1 text-xs font-semibold text-amber">PARTIAL QUOTE — covers only some items (missing lines are unavailable, not Rs. 0)</div>}
              <div className="mt-2 text-3xl font-bold">Rs. {(q.totalCents / 100).toLocaleString()}</div>
              <div className="text-xs text-ink-3">landed total incl. delivery Rs. {(q.deliveryFeeCents / 100).toLocaleString()}{q.paymentTerms ? ` · ${q.paymentTerms}` : ''}{q.validUntil ? ` · valid until ${new Date(q.validUntil).toLocaleDateString()}` : ''}</div>
              <ul className="mt-3 space-y-1 text-sm">
                {(items as Array<{ description: string; quantity: number; unitPriceCents: number; subtotalCents: number; isAlternative: number }>).map((it, i) => (
                  <li key={i} className="flex justify-between"><span>{it.description}{it.isAlternative ? ' (alternative — needs explicit acceptance)' : ''}</span><span className="font-mono">{it.quantity} × {(it.unitPriceCents / 100).toLocaleString()} = {(it.subtotalCents / 100).toLocaleString()}</span></li>
                ))}
              </ul>
              {q.notes && <p className="mt-2 text-xs text-ink-3">{q.notes}</p>}
              <QuoteHistory quoteId={q.id} onChanged={refresh} />
              <div className="mt-4 flex flex-wrap gap-2">
                {awardable && (
                  confirmAward === q.id ? (
                    <>
                      <span className="text-sm">Award {q.quoteNumber} v{q.version} at Rs. {(q.totalCents / 100).toLocaleString()}?</span>
                      <Button onClick={() => { setConfirmAward(null); void act(() => api.post(`/rfqs/${id}/award`, { quoteId: q.id, expectedVersion: q.version }), 'Quote awarded'); }}>Confirm award</Button>
                      <button onClick={() => setConfirmAward(null)} className="text-sm underline">Cancel</button>
                    </>
                  ) : <Button onClick={() => setConfirmAward(q.id)}>Award quote</Button>
                )}
                {awardable && <button onClick={() => { const r = window.prompt('Rejection reason (optional)'); if (r !== null) void act(() => api.post(`/rfqs/quotes/${q.id}/reject`, { reason: r || undefined }), 'Quote rejected'); }} className="text-sm underline">Reject</button>}
                <button onClick={() => void act(() => api.post(`/rfqs/quotes/${q.id}/request-revision`, { message: 'Please revise your best price.' }), 'Revision requested')} className="text-sm underline">Request revision</button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input value={counter[q.id] ?? ''} onChange={(e) => setCounter({ ...counter, [q.id]: e.target.value })} placeholder="Counter total Rs." inputMode="decimal" className="w-36 rounded-lg border border-line px-2 py-1 text-sm" />
                <input value={counterMsg[q.id] ?? ''} onChange={(e) => setCounterMsg({ ...counterMsg, [q.id]: e.target.value })} placeholder="Message (required)" className="flex-1 rounded-lg border border-line px-2 py-1 text-sm" />
                <button
                  onClick={() => {
                    const total = Math.round(Number(counter[q.id]) * 100);
                    const message = counterMsg[q.id] ?? '';
                    if (!(total > 0) || !message.trim()) { setError('Counter needs a total and a message'); return; }
                    void act(() => api.post(`/rfqs/quotes/${q.id}/counter`, { proposedTotalCents: total, message }), 'Counter-offer sent');
                  }}
                  className="rounded-lg bg-ink px-3 py-1 text-sm text-white"
                >Counter</button>
              </div>
            </Surface>
          );
        })}
      </div>

      <h2 className="mt-8 text-2xl font-bold">Documents</h2>
      <RfqDocsUpload rfqId={id!} />

      <h2 className="mt-8 text-2xl font-bold">Messages</h2>
      <Surface className="mt-3 p-5">
        <ul className="max-h-64 space-y-2 overflow-auto text-sm">
          {(messages.data?.messages ?? []).map((m) => (
            <li key={m.id}><span className="rounded bg-paper border border-line px-2 py-0.5 text-xs">{m.senderType}</span> {m.message} <span className="text-xs text-ink-4">{new Date(m.createdAt).toLocaleString()}</span></li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Clarify specs, delivery, terms…" className="flex-1 rounded-xl border border-line px-3 py-2 text-sm" />
          <Button onClick={() => { if (!msg.trim()) return; const m = msg; setMsg(''); void act(() => api.post(`/rfqs/${id}/messages`, { message: m }), 'Sent'); }}>Send</Button>
        </div>
      </Surface>
    </div>
  );
}
