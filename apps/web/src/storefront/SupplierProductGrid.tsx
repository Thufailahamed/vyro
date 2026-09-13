import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { formatLKR } from '@/lib/format';

export interface StorefrontOffer {
  id: string;
  productId: string;
  productName?: string | null;
  productImage?: string | null;
  unit?: string | null;
  packSize?: string | null;
  priceCents: number;
  leadTimeDays?: number | null;
}

export function SupplierProductGrid({ offers }: { offers: StorefrontOffer[] }): JSX.Element {
  if (!offers.length) {
    return (
      <div className="border border-dashed border-ink/10 p-8 text-center text-sm text-ink-3">
        No published products yet.
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {offers.map((o) => (
        <Link
          key={o.id}
          to={`/products/${o.productId}`}
          className="border border-ink/10 bg-paper hover:border-ink transition p-4 space-y-2 block"
        >
          <div className="aspect-square bg-ink/5 flex items-center justify-center text-xs text-ink-4">
            {o.productImage ? (
              <img src={o.productImage} alt={o.productName ?? ''} className="object-cover w-full h-full" />
            ) : (
              <span>No image</span>
            )}
          </div>
          <div className="font-semibold text-sm text-ink truncate">{o.productName ?? '—'}</div>
          <div className="text-xs text-ink-3">{o.unit} {o.packSize ? `· ${o.packSize}` : ''}</div>
          <div className="font-mono text-sm text-copper">{formatLKR(o.priceCents)}</div>
          {typeof o.leadTimeDays === 'number' && (
            <div className="text-xs text-ink-4">Lead {o.leadTimeDays}d</div>
          )}
        </Link>
      ))}
    </div>
  );
}
