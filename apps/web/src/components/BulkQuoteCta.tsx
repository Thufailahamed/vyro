import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function useRfqQualify(totalCents: number, quantity: number) {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  return useQuery({
    queryKey: ['rfq-qualify', totalCents, quantity],
    queryFn: () => api.post<{ qualifies: boolean; valueThresholdCents: number; quantityThreshold: number }>('/rfqs/qualify', { cartTotalCents: totalCents, cartQuantity: quantity }),
    enabled: !!businessId && (totalCents > 0 || quantity > 0),
  });
}

export function BulkQuoteCta({ totalCents, quantity, compact }: { totalCents: number; quantity: number; compact?: boolean }) {
  const { data } = useRfqQualify(totalCents, quantity);
  return (
    <a
      href="/rfqs/new?fromCart=1"
      className={compact ? 'text-sm underline text-ink-3 hover:text-ink' : 'block rounded-2xl border border-line bg-paper p-5 hover:border-ink transition-colors'}
    >
      {compact ? (
        <>Need {quantity} units? Request a custom supplier quote.</>
      ) : (
        <>
          <div className="text-xs uppercase tracking-widest text-ink-4">Bulk order</div>
          <div className="mt-1 text-xl font-semibold">Request Bulk Quote</div>
          <p className="mt-1 text-sm text-ink-3">
            {data?.qualifies
              ? `This order qualifies for negotiated pricing (over ${((data.valueThresholdCents ?? 0) / 100).toLocaleString()} or ${data.quantityThreshold}+ units).`
              : 'Need a large quantity? Request custom supplier quotes instead of catalog price.'}
          </p>
          <span className="mt-3 inline-block rounded-full bg-ink px-4 py-2 text-sm text-white">Request quotes for this order →</span>
        </>
      )}
    </a>
  );
}
