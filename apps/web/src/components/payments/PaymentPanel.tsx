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
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
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
      if (r.isMock) {
        setErr('Online checkout is running against the staging payment simulator — no real money will move. Configure PayHere credentials for live payments.');
      }
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
      await api.post<{ id: string }>(
        `/payments`,
        {
          purchaseOrderId,
          method: 'bank_transfer',
          transactionReference: ref || undefined,
          notes: 'Recorded from order detail',
        },
        { idempotencyKey },
      );
      // Offline payments stay pending until the supplier confirms receipt.
      // Do NOT auto-confirm here: POST /:id/confirm requires supplier/admin.
      setRef('');
      await refetch();
      setErr('');
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

  const failedPayments = payments.filter(
    (p) => p.status === 'failed' || p.status === 'cancelled' || p.status === 'chargeback',
  );
  const lastFailed = failedPayments[failedPayments.length - 1];

  return (
    <Surface className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="vyro-kicker">Payment</div>
          <h3 className="font-display text-lg mt-1">Order total {formatLKR(totalCents)}</h3>
        </div>
        <span className="vyro-metric text-sm text-ink-4">
          {formatLKR(confirmedTotal)} / {formatLKR(totalCents)}
        </span>
      </div>

      <div className="border border-ink/10 p-3">
        <div className="text-xs uppercase tracking-[0.14em] text-ink-4">Payment method</div>
        <div className="mt-1 font-medium">PayHere</div>
        <p className="mt-1 text-xs text-ink-4">
          Accept online payment securely through PayHere. You will be redirected to PayHere to
          complete payment — we never see or store your card details.
        </p>
      </div>

      <ErrorBanner message={err} />
      {busy && <p aria-live="polite" className="text-xs text-ink-4">Preparing secure payment…</p>}

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
                  Pay securely
                </Button>
              )}
              {(p.status === 'failed' || p.status === 'cancelled' || p.status === 'chargeback') &&
                canRecord && (
                  <span className="text-[11px] text-ink-4">
                    {p.status === 'chargeback' ? 'Flagged for review' : 'Not paid — try again below'}
                  </span>
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
                    notes: lastFailed ? `Retry after ${lastFailed.status}` : 'Pay online via PayHere',
                  });
                  await payOnline(r.id);
                } catch (e) {
                  setErr(e instanceof ApiError ? e.message : 'Pay online failed');
                  setBusy(false);
                }
              }}
              loading={busy}
            >
              Pay securely
            </Button>
          </div>
        </div>
      )}

      {outstanding > 0 && poStatus !== 'cancelled' && (
        <p className="text-[11px] text-ink-4">
          Outstanding: <span className="vyro-metric">{formatLKR(outstanding)}</span>
          {' · '}After PayHere you will return here — status updates only from server confirmation.
        </p>
      )}
    </Surface>
  );
}
