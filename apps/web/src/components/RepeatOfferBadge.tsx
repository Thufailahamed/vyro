import type { RepeatOffer } from '@vyro/validation';
import { formatLKR } from '@/lib/format';

export function RepeatOfferBadge({ offer }: { offer: RepeatOffer }) {
  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
      <strong>Repeat Offer:</strong> You&apos;ve spent{' '}
      <span className="font-semibold">{formatLKR(offer.trailingSpendCents)}</span> with{' '}
      {offer.supplierName || 'this supplier'} in the last 90 days —{' '}
      <span className="font-semibold">{offer.percent}% off</span> your next order!
    </div>
  );
}
