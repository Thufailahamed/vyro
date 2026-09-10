import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import { RfqTemplatesPanel } from '@/components/RfqTemplatesPanel';

interface RfqItem { description: string; quantity: string; unit: string; targetPrice: string; specifications: string; productId?: string }

const DEADLINES = [
  { label: 'Today', days: 0 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
];

export function RfqCreatePage() {
  usePageTitle('New RFQ');
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string }> })?.memberships?.[0]?.businessId;
  const [params] = useSearchParams();
  const fromCart = params.get('fromCart') === '1';
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deadlineDays, setDeadlineDays] = useState<number | 'custom'>(7);
  const [customDeadline, setCustomDeadline] = useState('');
  const [items, setItems] = useState<RfqItem[]>([{ description: '', quantity: '500', unit: 'kg', targetPrice: '', specifications: '' }]);
  const [supplierIds, setSupplierIds] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const deadline = useMemo(() => {
    if (deadlineDays === 'custom') { const t = Date.parse(customDeadline); return Number.isFinite(t) ? t : undefined; }
    return Date.now() + Math.max(1, deadlineDays) * 86400000;
  }, [deadlineDays, customDeadline]);

  async function submit(publish: boolean) {
    setError(null);
    if (!businessId) { setError('No business context'); return; }
    if (!title.trim() || items.some((i) => !i.description.trim() || !(Number(i.quantity) > 0))) { setError('Title and valid items are required'); return; }
    setSaving(true);
    try {
      let out: { id: string };
      if (fromCart) {
        out = await api.post('/rfqs/from-cart', { businessId, title, deadline, supplierIds: supplierIds.split(',').map((s) => s.trim()).filter(Boolean) });
      } else {
        out = await api.post('/rfqs', {
          businessId, title, description, deliveryLocation, paymentTerms, deadline, isOpen,
          supplierIds: supplierIds.split(',').map((s) => s.trim()).filter(Boolean),
          items: items.map((i) => ({
            description: i.description, quantity: Number(i.quantity), unit: i.unit || 'kg',
            targetPriceCents: i.targetPrice ? Math.round(Number(i.targetPrice) * 100) : undefined,
            specifications: i.specifications || undefined, productId: i.productId || undefined,
          })),
        });
      }
      if (publish) await api.post(`/rfqs/${out.id}/publish`, {});
      toast.show(toast.success(publish ? 'RFQ published — suppliers notified' : 'RFQ draft created'));
      navigate(`/rfqs/${out.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Bulk procurement</div>
      <h1 className="mt-1 text-4xl font-bold">{fromCart ? 'Request quotes for this order' : 'Create RFQ'}</h1>
      <p className="mt-2 text-ink-3">{fromCart ? 'Your cart items become the RFQ — no re-entry needed.' : 'Specify products, delivery, payment and deadline.'}</p>

      {error && <div className="mt-4"><ErrorBanner message={error} /></div>}

      <Surface className="mt-6 p-6">
        <label className="text-sm font-medium">Title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Monthly restaurant supplies — 1000kg rice" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" />
        <label className="mt-4 block text-sm font-medium">Description / requirements</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" placeholder="Quality, packaging, brand preferences…" />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div><label className="text-sm font-medium">Delivery location</label><input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" /></div>
          <div><label className="text-sm font-medium">Payment terms preference</label><input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 14, PayHere on delivery" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" /></div>
        </div>
        <div className="mt-4">
          <label className="text-sm font-medium">Quotation deadline</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {DEADLINES.map((d) => (
              <button key={d.label} type="button" onClick={() => setDeadlineDays(d.days)} className={`rounded-full border px-4 py-1.5 text-sm ${deadlineDays === d.days ? 'bg-ink text-white border-ink' : 'border-line'}`}>{d.label}</button>
            ))}
            <button type="button" onClick={() => setDeadlineDays('custom')} className={`rounded-full border px-4 py-1.5 text-sm ${deadlineDays === 'custom' ? 'bg-ink text-white border-ink' : 'border-line'}`}>Custom</button>
            {deadlineDays === 'custom' && <input type="date" value={customDeadline} onChange={(e) => setCustomDeadline(e.target.value)} className="rounded-xl border border-line px-3 py-1.5 text-sm" />}
          </div>
        </div>
      </Surface>

      {!fromCart && (
        <Surface className="mt-4 p-6">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Products</h2><button type="button" onClick={() => setItems([...items, { description: '', quantity: '100', unit: 'kg', targetPrice: '', specifications: '' }])} className="text-sm underline">+ Add item</button></div>
          {items.map((it, i) => (
            <div key={i} className="mb-3 grid gap-2 rounded-xl border border-line p-3 md:grid-cols-6">
              <input value={it.description} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Product" className="rounded-lg border border-line px-2 py-1.5 md:col-span-2" />
              <input value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} placeholder="Qty" inputMode="numeric" className="rounded-lg border border-line px-2 py-1.5" />
              <input value={it.unit} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} placeholder="Unit" className="rounded-lg border border-line px-2 py-1.5" />
              <input value={it.targetPrice} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, targetPrice: e.target.value } : x))} placeholder="Target Rs (opt)" inputMode="decimal" className="rounded-lg border border-line px-2 py-1.5" />
              <input value={it.specifications} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, specifications: e.target.value } : x))} placeholder="Specs" className="rounded-lg border border-line px-2 py-1.5" />
            </div>
          ))}
        </Surface>
      )}

      <RfqTemplatesPanel onLoadItems={(loaded) => setItems(loaded)} />

      <Surface className="mt-4 p-6">
        <label className="text-sm font-medium">Invite suppliers (comma-separated IDs — or discover after creating)</label>
        <input value={supplierIds} onChange={(e) => setSupplierIds(e.target.value)} placeholder="supplier ids…" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2" />
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={isOpen} onChange={(e) => setIsOpen(e.target.checked)} /> Open to qualified suppliers</label>
      </Surface>

      <div className="mt-6 flex gap-3">
        <Button disabled={saving} onClick={() => void submit(false)}>Save draft</Button>
        <Button disabled={saving} onClick={() => void submit(true)}>Publish & invite →</Button>
      </div>
    </div>
  );
}
