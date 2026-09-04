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
        <Card className="p-8 space-y-4">
          <h2 className="text-xl font-bold text-slate-800">No Business Profile Found</h2>
          <p className="text-sm text-slate-500">Please register your business entity before proceeding to checkout.</p>
          <Link to="/onboarding/business">
            <Button>Set Up Business</Button>
          </Link>
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
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Checkout Flow Step Indicator */}
      <div className="flex items-center justify-center gap-3 text-xs font-semibold pb-2">
        <Link to="/cart" className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors px-3 py-1.5">
          <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
          <span>Review Cart</span>
        </Link>
        <div className="h-px w-8 bg-slate-300" />
        <div className="flex items-center gap-2 text-brand-700 bg-brand-50 px-3 py-1.5 rounded-full border border-brand-200 shadow-soft-sm">
          <span className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px] font-bold">2</span>
          <span>Checkout & Notes</span>
        </div>
        <div className="h-px w-8 bg-slate-300" />
        <div className="flex items-center gap-2 text-slate-400 px-3 py-1.5">
          <span className="h-5 w-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">3</span>
          <span>PO Confirmation</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Issue Purchase Orders
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Provide delivery instructions and finalize legally binding purchase orders for your suppliers.
          </p>
        </div>
        <Link to="/cart" className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
          <ArrowLeftIcon size={14} /> Back to Cart
        </Link>
      </div>

      <ErrorBanner message={err} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Form: Notes & PO terms */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border-slate-200/90 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-100">
              <TruckIcon size={18} className="text-brand-600" />
              <h2 className="text-base font-bold text-slate-900">Delivery & Logistics Notes</h2>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              These instructions will be appended to the official Purchase Order document sent to all recipient suppliers.
            </p>

            <form id="checkout-form" onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="notes">Special Dispatch or Delivery Instructions (Optional)</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Deliver between 9:00 AM - 2:00 PM at back warehouse dock #2. Call driver 1 hour prior to arrival on 077-XXXXXXX."
                />
              </div>
            </form>
          </Card>

          {/* Verification terms */}
          <Card className="p-6 border-slate-200/90 space-y-3 bg-slate-50/70">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheckIcon size={15} className="text-emerald-600" />
              VYRO Purchase Order Terms
            </h3>
            <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4 leading-relaxed">
              <li>
                Each supplier will receive an independent Purchase Order with their respective line items and MOQ requirements.
              </li>
              <li>
                Suppliers have up to 24 hours to formally accept or decline the purchase order via their dashboard.
              </li>
              <li>
                Payment terms and delivery dispatch timelines apply as stated in each supplier's agreement.
              </li>
            </ul>
          </Card>
        </div>

        {/* Right Sidebar: Confirm & Submit */}
        <div className="space-y-4">
          <Card className="p-6 border-slate-200/90 space-y-5 shadow-soft-sm sticky top-24">
            <h3 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
              Checkout Confirmation
            </h3>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckCircleIcon size={16} className="text-emerald-600 shrink-0" />
                <span>Instant dispatch notification to suppliers</span>
              </div>
              <div className="flex items-center gap-2">
                <ClockIcon size={16} className="text-brand-600 shrink-0" />
                <span>Timestamped audit trail generated</span>
              </div>
              <div className="flex items-center gap-2">
                <FileTextIcon size={16} className="text-purple-600 shrink-0" />
                <span>Official PDF-compatible purchase order</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <Button
                type="submit"
                form="checkout-form"
                disabled={loading}
                loading={loading}
                size="lg"
                className="w-full font-bold shadow-soft-sm"
              >
                Confirm & Issue POs
              </Button>
            </div>

            <p className="text-[11px] text-slate-600 text-center leading-tight">
              By confirming, you authorize the generation of purchase orders under your business registration.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
