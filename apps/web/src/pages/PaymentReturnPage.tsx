import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner, PageHeader, Surface } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { usePageTitle } from '@/lib/usePageTitle';

interface Payment {
  id: string;
  purchaseOrderId: string;
  poNumber?: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
  amountCents: number;
  currency: string;
  transactionReference: string | null;
  confirmedAt: number | null;
}

/** How long to keep polling for the webhook before telling the user to check back. */
const MAX_POLL_MS = 45_000;
const POLL_INTERVAL_MS = 3_000;

interface Props {
  outcome: 'success' | 'cancel';
}

/**
 * Landing page for the PayHere return hop.
 *
 * The gateway redirects the buyer's browser here *before* the server-to-server
 * webhook necessarily lands, so a "success" return does not by itself mean the
 * payment is confirmed. We poll the payment record until the webhook flips it to
 * `confirmed` (or `failed`), and are explicit with the user while it is still
 * pending rather than claiming success we cannot verify.
 */
export function PaymentReturnPage({ outcome }: Props) {
  usePageTitle(outcome === 'success' ? 'Payment processing' : 'Payment cancelled');
  const { id: poId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const paymentId = params.get('paymentId');
  const [startedAt] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);

  const shouldPoll = outcome === 'success' && !timedOut;

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['payments', poId],
    queryFn: () => api.get<{ payments: Payment[] }>(`/payments/by-po/${poId}`),
    enabled: !!poId,
    refetchInterval: shouldPoll ? POLL_INTERVAL_MS : false,
  });

  const payment = useMemo(() => {
    const list = data?.payments ?? [];
    if (paymentId) {
      const exact = list.find((p) => p.id === paymentId);
      if (exact) return exact;
    }
    // Fall back to the most recently created online payment on this PO.
    return list.length > 0 ? list[list.length - 1] : null;
  }, [data, paymentId]);

  const settled =
    payment?.status === 'confirmed' ||
    payment?.status === 'failed' ||
    payment?.status === 'cancelled' ||
    payment?.status === 'chargeback';

  useEffect(() => {
    if (!shouldPoll || settled) return;
    const remaining = MAX_POLL_MS - (Date.now() - startedAt);
    if (remaining <= 0) {
      setTimedOut(true);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), remaining);
    return () => clearTimeout(t);
  }, [shouldPoll, settled, startedAt]);

  const title =
    outcome === 'cancel'
      ? 'Payment cancelled'
      : payment?.status === 'confirmed'
        ? 'Payment successful'
        : payment?.status === 'failed'
          ? 'Payment failed'
          : payment?.status === 'cancelled'
            ? 'Payment cancelled'
            : payment?.status === 'chargeback'
              ? 'Payment under review'
              : 'Verifying your payment...';
  usePageTitle(title);

  const orderLink = poId ? `/orders/${poId}` : '/orders';

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <PageHeader
        kicker={outcome === 'cancel' ? 'Checkout' : 'Payment'}
        title={title}
        sub={
          outcome === 'cancel'
            ? 'Your order has not been marked as successfully paid.'
            : payment?.status === 'confirmed'
              ? 'The supplier has been notified and will begin processing your order.'
              : payment?.status === 'failed'
                ? 'Your payment could not be completed.'
                : payment?.status === 'cancelled'
                  ? 'Your order has not been marked as successfully paid.'
                  : payment?.status === 'chargeback'
                    ? 'This payment was flagged for investigation. Our team will be in touch.'
                    : 'We are waiting for payment confirmation. Your order will update once the server callback arrives.'
        }
      />

      <Surface className="mt-8 p-8">
        {error && <ErrorBanner message="Could not load the payment status for this order." />}

        {payment && (
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-4">Amount</dt>
              <dd className="mt-1 font-medium">{formatLKR(payment.amountCents)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-ink-4">Status</dt>
              <dd className="mt-1 font-medium capitalize">{payment.status}</dd>
            </div>
            {payment.transactionReference && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-ink-4">Reference</dt>
                <dd className="mt-1 font-mono text-xs">{payment.transactionReference}</dd>
              </div>
            )}
          </dl>
        )}

        {payment?.status === 'confirmed' && (
          <div className="mt-6">
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink-4">Your payment of</p>
            <p className="mt-1 text-2xl font-medium">{formatLKR(payment.amountCents)}</p>
            <p className="mt-1 text-sm text-ink-4">has been confirmed.</p>
          </div>
        )}

        {outcome === 'success' && !settled && (
          <div className="mt-6 text-sm text-ink-4">
            <p aria-live="polite" className="font-medium">Payment processing</p>
            {isLoading && <p>Loading payment…</p>}
            {!isLoading && !timedOut && (
              <p aria-live="polite">Waiting for gateway confirmation…</p>
            )}
            {timedOut && (
              <p aria-live="polite">
                Still not confirmed. Gateways occasionally take a few minutes. Your order page will
                update automatically once the callback arrives — you do not need to pay again.
              </p>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {payment?.status === 'confirmed' ? (
            <>
              <Link to={orderLink}>
                <Button>View order</Button>
              </Link>
              <Link to="/orders">
                <Button variant="secondary">Continue shopping</Button>
              </Link>
              <Link to="/dashboard">
                <Button variant="secondary">Back to dashboard</Button>
              </Link>
            </>
          ) : (
            <>
              <Link to={orderLink}>
                <Button>View order</Button>
              </Link>
              {outcome === 'success' && !settled && (
                <Button variant="secondary" onClick={() => void refetch()}>
                  Refresh status
                </Button>
              )}
              {(outcome === 'cancel' ||
                payment?.status === 'failed' ||
                payment?.status === 'cancelled') && (
                <Link to={orderLink}>
                  <Button variant="secondary">Try again</Button>
                </Link>
              )}
            </>
          )}
        </div>
      </Surface>
    </div>
  );
}
