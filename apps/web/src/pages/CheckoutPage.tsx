import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button, ErrorBanner, Label, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ArrowLeftIcon } from '@/components/icons';
import { FlowLine } from '@/components/brand/FlowLine';
import { Surface } from '@/components/brand/Surface';

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const businessId = user?.memberships?.[0]?.businessId;
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (!businessId) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">No business profile found</h2>
        <Link to="/onboarding/business" className="mt-4 inline-block">
          <Button>Set up business</Button>
        </Link>
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
    <div className="space-y-8 max-w-4xl">
      <div className="max-w-xl">
        <FlowLine
          nodes={[
            { label: 'Cart', state: 'done' },
            { label: 'Checkout', state: 'active' },
            { label: 'Purchase orders', state: 'idle' },
          ]}
        />
      </div>
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="vyro-kicker">Checkout</div>
          <h1 className="mt-2 vyro-display text-4xl">Issue purchase orders</h1>
        </div>
        <Link to="/cart" className="text-xs text-ink-4 inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeftIcon size={14} /> Cart
        </Link>
      </header>
      <ErrorBanner message={err} />
      <div className="grid lg:grid-cols-[1fr_300px] gap-8">
        <Surface className="p-6">
          <h2 className="font-display text-xl">Delivery notes</h2>
          <p className="mt-2 text-xs text-ink-4">Appended to every supplier PO issued from this cart.</p>
          <form id="checkout-form" onSubmit={submit} className="mt-5">
            <Label htmlFor="notes">Special instructions</Label>
            <Textarea
              id="notes"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dock hours, contact on arrival, warehouse notes…"
            />
          </form>
        </Surface>
        <Surface kind="floating" className="p-6">
          <p className="text-sm text-ink-3 leading-relaxed">
            Each supplier receives an independent purchase order. Acceptance is logged on the order journey.
          </p>
          <Button type="submit" form="checkout-form" loading={loading} size="lg" className="w-full mt-6">
            Confirm & issue
          </Button>
        </Surface>
      </div>
    </div>
  );
}
