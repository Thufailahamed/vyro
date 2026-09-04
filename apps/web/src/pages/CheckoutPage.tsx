import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorBanner, Label, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const businessId = user?.memberships[0]?.businessId;
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (!businessId) return <p className="text-muted">Set up a business first.</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await api.post<{ poIds: string[]; count: number }>('/purchase-orders/checkout', { businessId, notes });
      navigate(`/orders/${res.poIds[0]}`);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Checkout failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Checkout</h1>
      <Card>
        <p className="text-sm text-muted mb-3">
          Your cart is split into one purchase order per supplier. Each PO will land in the supplier's inbox for acceptance.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <ErrorBanner message={err} />
          <div><Label>Delivery notes (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <Button disabled={loading} className="w-full">{loading ? 'Placing…' : 'Place orders'}</Button>
        </form>
      </Card>
    </div>
  );
}
