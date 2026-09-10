import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  Button,
  ErrorBanner,
  Input,
  Label,
  Textarea,
  Select,
} from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { FlowLine } from '@/components/brand/FlowLine';
import { useToast } from '@vyro/ui';
import { RfqTemplatesPanel } from '@/components/RfqTemplatesPanel';
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  FileTextIcon,
  MapPinIcon,
  PackageIcon,
  PlusIcon,
  ScaleIcon,
  ShieldCheckIcon,
  StoreIcon,
  Trash2Icon,
  TruckIcon,
  UsersIcon,
  XIcon,
} from '@/components/icons';

interface RfqItem {
  description: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  specifications: string;
  productId?: string;
}

const DEADLINES: Array<{ label: string; sub: string; days: number }> = [
  { label: 'Today', sub: 'Urgent', days: 0 },
  { label: '3 days', sub: 'Standard', days: 3 },
  { label: '7 days', sub: 'Negotiated', days: 7 },
  { label: '14 days', sub: 'Strategic', days: 14 },
];

const UNIT_OPTIONS = ['kg', 'g', 'L', 'mL', 'pcs', 'box', 'crate', 'bag', 'ton', 'm', 'm²'];

const STEPS = [
  { label: 'Define', hint: 'Title & brief' },
  { label: 'Items', hint: 'Line items' },
  { label: 'Logistics', hint: 'Delivery & payment' },
  { label: 'Invite', hint: 'Visibility & suppliers' },
];

const QUICK_TAGS = [
  'Net 14 settlement',
  'PayHere on delivery',
  'COD on receipt',
  'Bank wire 7 days',
  '30-day credit',
];

export function RfqCreatePage() {
  usePageTitle('New RFQ');
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string; businessName?: string }> })?.memberships?.[0]?.businessId;
  const businessName = (user as { memberships?: Array<{ businessId: string; businessName?: string }> })?.memberships?.[0]?.businessName;
  const [params] = useSearchParams();
  const fromCart = params.get('fromCart') === '1';
  const navigate = useNavigate();
  const toast = useToast();
  const [title, setTitle] = useState(fromCart ? 'Bulk quote for active cart' : '');
  const [description, setDescription] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deadlineDays, setDeadlineDays] = useState<number | 'custom'>(7);
  const [customDeadline, setCustomDeadline] = useState('');
  const [items, setItems] = useState<RfqItem[]>([
    { description: '', quantity: '500', unit: 'kg', targetPrice: '', specifications: '' },
  ]);
  const [supplierIds, setSupplierIds] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cart pre-population (when arriving from /cart?fromCart=1)
  const cart = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () =>
      api.get<{
        items: Array<{
          id: string;
          product: { id: string; name: string; unit?: string | null };
          quantity: number;
        }>;
        supplierCount: number;
      }>(`/cart?businessId=${businessId}`),
    enabled: !!fromCart && !!businessId,
  });

  const populatedFromCart = useMemo(() => {
    if (!fromCart) return false;
    const ci = cart.data?.items ?? [];
    return ci.length > 0 && items.every((it) => !it.description.trim());
  }, [fromCart, cart.data, items]);

  // Populate items from cart once
  if (populatedFromCart) {
    const ci = cart.data?.items ?? [];
    setItems(
      ci.map((c) => ({
        description: c.product.name,
        quantity: String(c.quantity),
        unit: c.product.unit ?? 'pcs',
        targetPrice: '',
        specifications: '',
        productId: c.product.id,
      })),
    );
  }

  const deadline = useMemo(() => {
    if (deadlineDays === 'custom') {
      const t = Date.parse(customDeadline);
      return Number.isFinite(t) ? t : undefined;
    }
    return Date.now() + Math.max(1, deadlineDays) * 86400000;
  }, [deadlineDays, customDeadline]);

  const validItemCount = items.filter((i) => i.description.trim() && Number(i.quantity) > 0).length;
  const totalQty = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  const hasTitle = title.trim().length > 0;
  const deadlineLabel = useMemo(() => {
    if (!deadline) return '—';
    const d = new Date(deadline);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }, [deadline]);

  async function submit(publish: boolean) {
    setError(null);
    if (!businessId) { setError('No business context'); return; }
    if (!title.trim() || items.some((i) => !i.description.trim() || !(Number(i.quantity) > 0))) {
      setError('Title and valid items are required');
      return;
    }
    setSaving(true);
    try {
      let out: { id: string };
      if (fromCart) {
        out = await api.post('/rfqs/from-cart', {
          businessId,
          title,
          deadline,
          supplierIds: supplierIds.split(',').map((s) => s.trim()).filter(Boolean),
        });
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function appendItem() {
    setItems([...items, { description: '', quantity: '100', unit: 'kg', targetPrice: '', specifications: '' }]);
  }
  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i));
  }
  function updateItem(i: number, patch: Partial<RfqItem>) {
    setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  const currentStepIdx = !hasTitle ? 0 : validItemCount === 0 ? 1 : (!deliveryLocation.trim() && !paymentTerms.trim()) ? 2 : 3;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-32">
      {/* Top breadcrumb + stepper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-4">
        <Link
          to="/rfqs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1 transition-colors"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" /> All RFQs
        </Link>
        <div className="w-full sm:w-[28rem]">
          <FlowLine
            nodes={STEPS.map((s, i) => ({
              label: s.label,
              hint: s.hint,
              state: i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : 'idle',
            }))}
          />
        </div>
      </div>

      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="size-2 rounded-full bg-volt animate-pulse" />
            <span className="vyro-kicker text-volt-deep">Bulk Procurement</span>
            {fromCart && (
              <span className="ml-1 font-mono text-[10px] font-semibold uppercase tracking-wider bg-copper/10 text-copper border border-copper/30 px-2 py-0.5">
                From Cart
              </span>
            )}
          </div>
          <h1 className="vyro-display text-4xl sm:text-5xl text-balance text-ink">
            {fromCart ? 'Request quotes for this order' : 'Create RFQ'}
          </h1>
          <p className="mt-3 text-body-lg text-ink-3 max-w-2xl">
            {fromCart
              ? 'Your cart items become the RFQ — no re-entry needed. Pick suppliers, set a deadline, and publish.'
              : 'Specify products, delivery, payment and deadline. Suppliers will respond with negotiated quotes.'}
          </p>
        </div>

        {businessName && (
          <div className="flex items-center gap-3 p-3 rounded-xl border border-ink/10 bg-paper shadow-xs self-start md:self-auto">
            <div className="w-8 h-8 rounded-lg bg-ink text-paper flex items-center justify-center">
              <StoreIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-copper font-mono block font-bold">Buyer Entity</div>
              <div className="text-xs font-bold text-ink-1">{businessName}</div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="animate-fade-in">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT — Form sections */}
        <div className="lg:col-span-8 space-y-6">
          {/* SECTION 1 — Define */}
          <SectionCard step={1} eyebrow="Define" title="Title & brief" sub="The headline and quality requirements suppliers will see first.">
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="rfq-title" className="flex items-center gap-1.5">
                  <FileTextIcon size={13} className="text-copper" />
                  <span>RFQ Title *</span>
                </Label>
                <Input
                  id="rfq-title"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Monthly restaurant supplies — 1000kg rice"
                  className="bg-paper text-base"
                />
                <p className="text-[11px] text-ink-4">
                  Printed on every supplier quote, negotiation thread, and awarded purchase order.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rfq-desc">Description / requirements</Label>
                <Textarea
                  id="rfq-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quality, packaging, brand preferences, certifications, delivery window…"
                  className="bg-paper"
                />
                <p className="text-[11px] text-ink-4">
                  Suppliers use this to qualify the RFQ before quoting — mention halal, organic, mill dates or any compliance notes.
                </p>
              </div>
            </div>
          </SectionCard>

          {/* SECTION 2 — Items */}
          {!fromCart && (
            <SectionCard
              step={2}
              eyebrow="Items"
              title="Product line items"
              sub="Add every SKU you need a quote for. You can save this list as a reusable template."
              actions={
                <button
                  type="button"
                  onClick={appendItem}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-1 hover:text-copper transition-colors"
                >
                  <PlusIcon size={14} /> Add item
                </button>
              }
            >
              {items.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-4 border border-dashed border-ink/15">
                  No items yet. Click <span className="font-bold">+ Add item</span> to start your list.
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((it, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-ink/10 bg-paper-subtle/30 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-ink-3">
                          <span className="w-5 h-5 rounded-sm bg-ink text-volt flex items-center justify-center font-bold">
                            {i + 1}
                          </span>
                          Line {i + 1}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          disabled={items.length === 1}
                          className="inline-flex items-center gap-1 text-[11px] text-ink-4 hover:text-rose transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label={`Remove line ${i + 1}`}
                        >
                          <Trash2Icon size={12} /> Remove
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-5">
                          <FieldHint>Product</FieldHint>
                          <Input
                            value={it.description}
                            onChange={(e) => updateItem(i, { description: e.target.value })}
                            placeholder="e.g. Keeri Samba rice, 50kg bag"
                            className="bg-paper"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldHint>Qty</FieldHint>
                          <Input
                            value={it.quantity}
                            onChange={(e) => updateItem(i, { quantity: e.target.value.replace(/[^0-9.]/g, '') })}
                            inputMode="decimal"
                            placeholder="500"
                            className="bg-paper font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <FieldHint>Unit</FieldHint>
                          <Select
                            value={it.unit}
                            onChange={(e) => updateItem(i, { unit: e.target.value })}
                            className="bg-paper"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </Select>
                        </div>
                        <div className="sm:col-span-3">
                          <FieldHint>Target Rs (opt)</FieldHint>
                          <Input
                            value={it.targetPrice}
                            onChange={(e) => updateItem(i, { targetPrice: e.target.value.replace(/[^0-9.]/g, '') })}
                            inputMode="decimal"
                            placeholder="—"
                            className="bg-paper font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <FieldHint>Specs (optional)</FieldHint>
                        <Input
                          value={it.specifications}
                          onChange={(e) => updateItem(i, { specifications: e.target.value })}
                          placeholder="Grade, origin, packaging, certifications…"
                          className="bg-paper"
                        />
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between text-xs text-ink-3 pt-1 px-1">
                    <span>
                      {validItemCount} of {items.length} line{items.length === 1 ? '' : 's'} valid ·{' '}
                      <span className="font-mono text-ink-1">{totalQty.toLocaleString()}</span> total units
                    </span>
                    <button
                      type="button"
                      onClick={appendItem}
                      className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-1 hover:text-copper transition-colors"
                    >
                      <PlusIcon size={12} /> Add another
                    </button>
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* fromCart item summary */}
          {fromCart && (
            <SectionCard
              step={2}
              eyebrow="Items"
              title="Items from your active cart"
              sub="These line items are pulled directly from your cart and locked in."
            >
              <ul className="divide-y divide-ink/10 border border-ink/10 rounded-xl bg-paper">
                {(cart.data?.items ?? []).map((c, i) => (
                  <li key={c.id} className="p-3 flex items-center gap-3 text-xs">
                    <span className="w-5 h-5 rounded-sm bg-ink text-volt flex items-center justify-center font-mono font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-ink-1 truncate">{c.product.name}</div>
                      <div className="text-[11px] text-ink-4 font-mono">
                        {c.quantity} {c.product.unit ?? 'units'}
                      </div>
                    </div>
                  </li>
                ))}
                {(!cart.data?.items || cart.data.items.length === 0) && (
                  <li className="p-4 text-xs text-ink-4 text-center">Loading cart…</li>
                )}
              </ul>
              <div className="mt-2 text-[11px] text-ink-4">
                Need to adjust?{' '}
                <Link to="/cart" className="text-copper hover:underline">
                  Edit your cart
                </Link>{' '}
                first, then come back.
              </div>
            </SectionCard>
          )}

          {/* Templates — only for non-cart flow */}
          {!fromCart && <RfqTemplatesPanel items={items} onLoadItems={(loaded) => setItems(loaded)} />}

          {/* SECTION 3 — Logistics */}
          <SectionCard
            step={3}
            eyebrow="Logistics"
            title="Delivery & payment"
            sub="Help suppliers quote accurate freight, terms, and timing."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rfq-delivery" className="flex items-center gap-1.5">
                  <MapPinIcon size={13} className="text-copper" />
                  <span>Delivery location</span>
                </Label>
                <Input
                  id="rfq-delivery"
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  placeholder="e.g. No. 42, Galle Road, Colombo 03"
                  className="bg-paper"
                />
                <p className="text-[11px] text-ink-4">
                  Receiving dock or warehouse — appended to every supplier quote.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rfq-payment" className="flex items-center gap-1.5">
                  <ScaleIcon size={13} className="text-copper" />
                  <span>Payment terms preference</span>
                </Label>
                <Input
                  id="rfq-payment"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  placeholder="e.g. Net 14, PayHere on delivery"
                  className="bg-paper"
                />
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setPaymentTerms(tag)}
                      className={`px-2 py-0.5 text-[10px] rounded-md border transition-all ${
                        paymentTerms === tag
                          ? 'border-ink bg-ink text-volt font-semibold'
                          : 'border-ink/10 bg-paper-subtle/40 text-ink-2 hover:border-ink/30'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-4">
              <Label className="flex items-center gap-1.5">
                <CalendarIcon size={13} className="text-copper" />
                <span>Quotation deadline</span>
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {DEADLINES.map((d) => {
                  const active = deadlineDays === d.days;
                  return (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setDeadlineDays(d.days)}
                      className={`group flex flex-col items-start px-3.5 py-2 rounded-lg border text-left transition-all ${
                        active
                          ? 'border-ink bg-ink text-paper shadow-sm'
                          : 'border-ink/10 bg-paper hover:border-ink/30'
                      }`}
                    >
                      <span className={`text-xs font-bold ${active ? 'text-volt' : 'text-ink-1'}`}>{d.label}</span>
                      <span className={`text-[10px] font-mono ${active ? 'text-paper/70' : 'text-ink-4'}`}>{d.sub}</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setDeadlineDays('custom')}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
                    deadlineDays === 'custom'
                      ? 'border-ink bg-ink text-paper shadow-sm'
                      : 'border-ink/10 bg-paper hover:border-ink/30'
                  }`}
                >
                  <CalendarIcon size={12} /> Custom date
                </button>
                {deadlineDays === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customDeadline}
                    onChange={(e) => setCustomDeadline(e.target.value)}
                    className="ml-1 h-10 bg-paper px-3 text-xs text-ink shadow-[inset_0_0_0_1px_rgba(12,14,11,0.16)] focus:outline-none focus:shadow-[inset_0_0_0_1px_#0C0E0B] rounded-lg"
                  />
                )}
              </div>
              <p className="text-[11px] text-ink-4 flex items-center gap-1.5 pt-1">
                <ClockIcon size={11} className="text-ink-4" />
                Quotes will close at <span className="font-mono text-ink-2">{deadlineLabel}</span>
              </p>
            </div>
          </SectionCard>

          {/* SECTION 4 — Visibility & suppliers */}
          <SectionCard
            step={4}
            eyebrow="Invite"
            title="Visibility & suppliers"
            sub="Decide who can quote, and which suppliers to invite directly."
          >
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                isOpen
                  ? 'border-ink bg-ink/[0.04] ring-1 ring-volt/40'
                  : 'border-ink/10 bg-paper hover:border-ink/30'
              }`}
            >
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
                className="mt-0.5 size-4 accent-volt"
              />
              <div className="flex-1">
                <div className="text-sm font-semibold text-ink-1 flex items-center gap-1.5">
                  <UsersIcon size={14} className="text-copper" />
                  Open to qualified suppliers
                </div>
                <p className="text-[11px] text-ink-3 mt-0.5 leading-relaxed">
                  Verified suppliers in matching categories can also discover and quote on this RFQ. Leave off to keep the invite list private.
                </p>
              </div>
            </label>

            <div className="space-y-1.5 pt-2">
              <Label htmlFor="rfq-suppliers" className="flex items-center gap-1.5">
                <StoreIcon size={13} className="text-copper" />
                <span>Direct supplier invites</span>
                <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-ink-4">optional</span>
              </Label>
              <Input
                id="rfq-suppliers"
                value={supplierIds}
                onChange={(e) => setSupplierIds(e.target.value)}
                placeholder="Paste supplier IDs separated by commas — or invite after creating"
                className="bg-paper font-mono text-xs"
              />
              <p className="text-[11px] text-ink-4">
                Skip this — after creating the RFQ we'll suggest ranked suppliers based on catalog coverage.
              </p>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT — Live preview / sticky summary */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
          <div className="vyro-kicker text-copper">Live RFQ Preview</div>

          <Surface kind="ink" className="p-6 relative overflow-hidden grain shadow-xl border border-paper/20">
            <div className="relative z-10 space-y-5">
              {/* Card top pill */}
              <div className="flex items-center justify-between pb-3 border-b border-paper/15">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-volt animate-pulse" />
                  <span className="text-[10px] font-mono text-volt uppercase tracking-wider font-bold">
                    {fromCart ? 'Cart-driven RFQ' : 'Draft RFQ'}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-paper/50 uppercase tracking-wider">
                  {deadlineDays === 'custom' ? 'Custom' : `${DEADLINES.find((d) => d.days === deadlineDays)?.label ?? '7 days'}`}
                </span>
              </div>

              {/* Title preview */}
              <div>
                <span className="text-[10px] font-mono text-paper/40 uppercase tracking-wider block">
                  RFQ Title
                </span>
                <h3 className="vyro-display text-2xl text-paper font-bold mt-1 break-words">
                  {title.trim() || 'Untitled RFQ'}
                </h3>
                {description.trim() ? (
                  <p className="text-xs text-paper/70 mt-1.5 line-clamp-2 leading-relaxed">
                    {description}
                  </p>
                ) : (
                  <p className="text-xs text-paper/40 mt-1 italic">No description yet…</p>
                )}
              </div>

              {/* Line items summary */}
              <div className="space-y-2 pt-3 border-t border-paper/15">
                <div className="flex items-center justify-between text-[10px] font-mono text-paper/50 uppercase tracking-wider">
                  <span>Line Items</span>
                  <span>
                    {validItemCount} valid · {items.length} total
                  </span>
                </div>
                <div className="space-y-1 max-h-32 overflow-auto pr-1 scrollbar-thin">
                  {items
                    .filter((i) => i.description.trim())
                    .slice(0, 4)
                    .map((it, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-[11px] text-paper/80 font-mono"
                      >
                        <span className="w-4 h-4 rounded-sm bg-volt/20 text-volt flex items-center justify-center text-[9px] font-bold">
                          {i + 1}
                        </span>
                        <span className="flex-1 truncate">
                          {it.description} · {it.quantity || '0'} {it.unit}
                        </span>
                      </div>
                    ))}
                  {validItemCount === 0 && (
                    <div className="text-[11px] text-paper/40 italic">No items yet…</div>
                  )}
                  {validItemCount > 4 && (
                    <div className="text-[10px] text-paper/40 font-mono">
                      + {validItemCount - 4} more
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-paper/70 pt-2 border-t border-paper/10">
                  <span>Total units</span>
                  <span className="font-mono font-semibold text-volt">
                    {totalQty.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Logistics */}
              <div className="space-y-2 pt-3 border-t border-paper/15 text-xs">
                <div className="flex items-start gap-2">
                  <MapPinIcon size={13} className="text-copper shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono text-paper/40 uppercase block">Delivery</span>
                    <span className={deliveryLocation ? 'text-paper font-medium' : 'text-paper/40 italic'}>
                      {deliveryLocation || 'No location set'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ScaleIcon size={13} className="text-copper shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono text-paper/40 uppercase block">Payment terms</span>
                    <span className={paymentTerms ? 'text-paper font-medium' : 'text-paper/40 italic'}>
                      {paymentTerms || 'No preference set'}
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarIcon size={13} className="text-volt shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-[9px] font-mono text-paper/40 uppercase block">Deadline</span>
                    <span className="text-paper font-medium font-mono">{deadlineLabel}</span>
                  </div>
                </div>
              </div>

              {/* Visibility badges */}
              <div className="pt-3 border-t border-paper/15 flex flex-wrap items-center gap-1.5">
                {isOpen ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider bg-volt text-ink px-2 py-0.5 font-bold">
                    <UsersIcon size={10} /> Open
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider bg-paper/10 text-paper/80 px-2 py-0.5">
                    <XIcon size={10} /> Private
                  </span>
                )}
                {supplierIds.trim() && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider bg-copper/20 text-copper border border-copper/30 px-2 py-0.5">
                    <StoreIcon size={10} /> Direct invites
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-mint">
                  <ShieldCheckIcon size={10} /> Escrow-ready
                </span>
              </div>
            </div>
          </Surface>

          {/* How RFQs work — quick reference */}
          <div className="p-4 bg-paper border border-ink/10 space-y-2.5">
            <span className="text-[10px] font-mono text-copper uppercase tracking-wider block font-bold">
              How this works
            </span>
            <ol className="space-y-2 text-xs text-ink-3">
              <Step n={1} icon={<FileTextIcon size={12} />} title="Publish">
                Suppliers receive the RFQ and start drafting quotes against your line items.
              </Step>
              <Step n={2} icon={<ScaleIcon size={12} />} title="Negotiate">
                Compare quotes, send counter-offers, and request revisions — everything is versioned.
              </Step>
              <Step n={3} icon={<CheckCircle2Icon size={12} />} title="Award">
                Award the best quote. We'll convert it to a purchase order automatically.
              </Step>
            </ol>
          </div>

          {/* Trust strip */}
          <div className="p-3 rounded-xl bg-paper border border-ink/10 flex flex-wrap items-center gap-3 text-[11px] text-ink-3">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheckIcon size={13} className="text-copper" /> Versioned quotes
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <TruckIcon size={13} className="text-copper" /> Direct supplier invites
            </span>
          </div>
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-4 z-30 -mx-4 sm:mx-0">
        <div className="bg-paper border border-ink/15 shadow-float rounded-2xl px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            <div className="w-8 h-8 rounded-lg bg-ink text-volt flex items-center justify-center shrink-0">
              <FileTextIcon size={14} />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">Current draft</div>
              <div className="font-semibold text-ink-1 truncate max-w-[18rem]">
                {title.trim() || 'Untitled RFQ'}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2 pl-3 ml-3 border-l border-ink/10 text-[11px] text-ink-3">
              <span className="font-mono">{validItemCount}</span> item{validItemCount === 1 ? '' : 's'}
              <span className="text-ink-4">·</span>
              <span className="font-mono">{totalQty.toLocaleString()}</span> units
            </div>
          </div>

          <div className="flex items-center gap-2 sm:shrink-0">
            <Link to="/rfqs" className="hidden sm:inline-flex">
              <Button variant="ghost">Cancel</Button>
            </Link>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void submit(false)}
              icon={<FileTextIcon size={14} />}
            >
              Save draft
            </Button>
            <Button
              disabled={saving || !hasTitle || validItemCount === 0}
              onClick={() => void submit(true)}
              loading={saving}
            >
              {fromCart ? 'Request quotes' : 'Publish & invite'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Local helpers ---------- */

function SectionCard({
  step,
  eyebrow,
  title,
  sub,
  actions,
  children,
}: {
  step: number;
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Surface className="p-6 rounded-2xl space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-ink text-volt font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
            {step}
          </div>
          <div>
            <div className="vyro-kicker text-copper">{eyebrow}</div>
            <h2 className="mt-1 text-lg font-bold text-ink-1">{title}</h2>
            {sub && <p className="text-xs text-ink-3 mt-0.5 max-w-xl">{sub}</p>}
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </Surface>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold text-ink-3 tracking-[0.12em] uppercase mb-1">
      {children}
    </label>
  );
}

function Step({
  n,
  icon,
  title,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="w-5 h-5 rounded-sm bg-ink text-volt flex items-center justify-center text-[10px] font-mono font-bold shrink-0">
        {n}
      </span>
      <div className="text-[11px] leading-relaxed">
        <span className="inline-flex items-center gap-1 font-semibold text-ink-1 uppercase tracking-wider text-[10px] font-mono">
          {icon} {title}
        </span>
        <p className="text-ink-3 normal-case tracking-normal mt-0.5">{children}</p>
      </div>
    </li>
  );
}
