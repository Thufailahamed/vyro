import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Input, Surface } from '@/components/ui';
import { StatusBadge } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';

interface Payment {
  id: string;
  purchaseOrderId: string;
  method: 'cash' | 'bank_transfer' | 'online';
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  transactionReference: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  notes: string | null;
  createdAt: number;
}

interface Props {
  purchaseOrderId: string;
  poStatus: string;
  totalCents: number;
}

export function PaymentPanel({ purchaseOrderId, poStatus, totalCents }: Props) {
  const { user } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState('');

  const isBusinessMember = !!user?.memberships?.length;
  const isSupplierMember = !!user?.supplierMemberships?.length;
  const isAdmin = !!user?.isAdmin;

  const { data, refetch } = useQuery({
    queryKey: ['payments', purchaseOrderId],
    queryFn: () => api.get<{ payments: Payment[] }>(`/payments/by-po/${purchaseOrderId}`),
  });

  const payments = data?.payments ?? [];
  const confirmedTotal = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.amountCents, 0);
  const outstanding = totalCents - confirmedTotal;

  async function payOnline(paymentId: string) {
    setErr('');
    setBusy(true);
    try {
      const r = await api.post<{ redirectUrl: string; isMock: boolean; provider: string }>(
        `/payments/${paymentId}/checkout`,
      );
      window.location.href = r.redirectUrl;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Checkout failed');
    } finally {
      setBusy(false);
    }
  }

  async function recordCashPayment() {
    setErr('');
    setBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const r = await api.post<{ id: string }>(`/payments`, {
        purchaseOrderId,
        method: 'bank_transfer',
        transactionReference: ref || undefined,
        notes: 'Recorded from order detail',
      });
      // Confirm immediately for offline methods
      await api.post(`/payments/${r.id}/confirm`, { status: 'confirmed' });
      setRef('');
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Payment failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment(paymentId: string) {
    setErr('');
    setBusy(true);
    try {
      await api.post(`/payments/${paymentId}/confirm`, { status: 'confirmed' });
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Confirm failed');
    } finally {
      setBusy(false);
    }
  }

  const canRecord = isBusinessMember && outstanding > 0;
  const canConfirm = (isSupplierMember || isAdmin);

  return (
    <Surface className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg">Payment</h3>
        <span className="vyro-metric text-sm text-ink-4">
          {formatLKR(confirmedTotal)} / {formatLKR(totalCents)}
        </span>
      </div>

      <ErrorBanner message={err} />

      {payments.length === 0 ? (
        <p className="text-sm text-ink-4">No payments recorded yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-ink/5 pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status}>{p.status}</StatusBadge>
                  <span className="vyro-metric">{formatLKR(p.amountCents)}</span>
                  <span className="text-[11px] uppercase text-ink-4">{p.method}</span>
                </div>
                {p.transactionReference && (
                  <div className="text-[11px] text-ink-4 mt-1">ref: {p.transactionReference}</div>
                )}
              </div>
              {p.status === 'pending' && canConfirm && (
                <Button size="sm" onClick={() => confirmPayment(p.id)} loading={busy}>
                  Confirm receipt
                </Button>
              )}
              {p.status === 'pending' && p.method === 'online' && canRecord && (
                <Button size="sm" onClick={() => payOnline(p.id)} loading={busy}>
                  Pay online
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canRecord && outstanding > 0 && poStatus !== 'cancelled' && (
        <div className="space-y-2 pt-2 border-t border-ink/10">
          <Input
            placeholder="Bank reference / transaction ID"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={recordCashPayment} loading={busy} variant="secondary">
              Mark paid (bank)
            </Button>
            <Button
              onClick={async () => {
                setErr('');
                setBusy(true);
                try {
                  const r = await api.post<{ id: string }>(`/payments`, {
                    purchaseOrderId,
                    method: 'online',
                    notes: 'Pay online',
                  });
                  await payOnline(r.id);
                } catch (e) {
                  setErr(e instanceof ApiError ? e.message : 'Pay online failed');
                  setBusy(false);
                }
              }}
              loading={busy}
            >
              Pay online
            </Button>
          </div>
        </div>
      )}

      {outstanding > 0 && poStatus !== 'cancelled' && (
        <p className="text-[11px] text-ink-4">
          Outstanding: <span className="vyro-metric">{formatLKR(outstanding)}</span>
        </p>
      )}
    </Surface>
  );
}
