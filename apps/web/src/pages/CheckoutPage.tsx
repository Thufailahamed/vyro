import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, Card, ErrorBanner, Label, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  FileTextIcon,
  ShieldCheckIcon,
  TruckIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@/components/icons';

const STEPS = [
  { label: 'Review Cart', state: 'done' },
  { label: 'Checkout & Notes', state: 'active' },
  { label: 'PO Confirmation', state: 'pending' },
];

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const businessId = user?.memberships?.[0]?.businessId;
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (!businessId) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <Card className="p-10 space-y-4">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">No business profile found</h2>
          <p className="text-sm text-slate-500">Please register your business entity before proceeding to checkout.</p>
          <Link to="/onboarding/business"><Button>Set up business</Button></Link>
        </Card>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api.post<{ poIds: string[]; count: number }>('/purchase-orders/checkout', {
        businessId,
        notes,
      });
      if (res.poIds && res.poIds.length > 0) {
        navigate(`/orders/${res.poIds[0]}`);
      } else {
        navigate('/orders');
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to place purchase orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <ol className="flex items-center justify-center gap-2 text-xs font-medium">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 h-7 rounded-full border transition-colors ${
                s.state === 'active'
                  ? 'bg-slate-950 text-white border-slate-950'
                  : s.state === 'done'
                  ? 'bg-cyan/10 text-cyan-deep border-cyan/30'
                  : 'bg-white text-slate-500 border-slate-200'
              }`}
            >
              <span
                className={`size-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold ${
                  s.state === 'active' ? 'bg-cyan text-slate-950' : s.state === 'done' ? 'bg-cyan-deep text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {s.state === 'done' ? '✓' : i + 1}
              </span>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-10 bg-slate-200" aria-hidden />}
          </li>
        ))}
      </ol>

      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-cyan/15 text-cyan-deep">Checkout</span>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-950 text-balance">
            Issue purchase orders
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Provide delivery instructions and finalize legally binding purchase orders for your suppliers.
          </p>
        </div>
        <Link to="/cart" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 transition-colors">
          <ArrowLeftIcon size={14} /> Back to cart
        </Link>
      </header>

      <ErrorBanner message={err} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
        <div className="space-y-6">
          <Card className="p-6 border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <span className="size-8 rounded-md bg-cyan/15 text-cyan-deep inline-flex items-center justify-center">
                <TruckIcon size={16} />
              </span>
              <h2 className="text-lg font-semibold text-slate-950">Delivery & logistics notes</h2>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              These instructions will be appended to the official Purchase Order document sent to all recipient suppliers.
            </p>
            <form id="checkout-form" onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="notes">Special dispatch or delivery instructions (optional)</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Deliver between 9:00 AM - 2:00 PM at back warehouse dock #2. Call driver 1 hour prior on 077-XXXXXXX."
                />
              </div>
            </form>
          </Card>

          <Card className="p-6 border-slate-200 space-y-3 bg-slate-50">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-2">
              <ShieldCheckIcon size={15} className="text-emerald-600" /> VYRO Purchase Order terms
            </h3>
            <ul className="text-sm text-slate-700 space-y-2 list-disc pl-5 leading-relaxed">
              <li>Each supplier receives an independent Purchase Order with their respective line items and MOQs.</li>
              <li>Suppliers have up to 24 hours to formally accept or decline via their dashboard.</li>
              <li>Payment and dispatch timelines apply as stated in each supplier's agreement.</li>
            </ul>
          </Card>
        </div>

        <Card className="p-6 border-slate-200 space-y-5 lg:sticky lg:top-24 shadow-soft-sm">
          <h3 className="text-lg font-semibold text-slate-950 pb-3 border-b border-slate-200">Checkout confirmation</h3>
          <ul className="space-y-3 text-sm text-slate-700">
            <li className="flex items-center gap-2"><CheckCircleIcon size={16} className="text-emerald-600 shrink-0" /> Instant dispatch notification to suppliers</li>
            <li className="flex items-center gap-2"><ClockIcon size={16} className="text-cyan-deep shrink-0" /> Timestamped audit trail generated</li>
            <li className="flex items-center gap-2"><FileTextIcon size={16} className="text-violet-500 shrink-0" /> Official PDF-compatible purchase order</li>
          </ul>
          <div className="pt-3 border-t border-slate-200">
            <Button
              type="submit"
              form="checkout-form"
              disabled={loading}
              loading={loading}
              size="lg"
              className="w-full font-semibold"
            >
              Confirm & issue POs
            </Button>
          </div>
          <p className="text-[11px] text-slate-500 text-center leading-tight">
            By confirming, you authorize the generation of purchase orders under your business registration.
          </p>
        </Card>
      </div>
    </div>
  );
}
