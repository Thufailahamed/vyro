import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { formatLKR } from '@/lib/format';
import { PackageIcon, ArrowRightIcon, ClockIcon } from '@/components/icons';

export interface StorefrontOffer {
  id: string;
  productId: string;
  productName?: string | null;
  productImage?: string | null;
  unit?: string | null;
  packSize?: string | null;
  priceCents: number;
  leadTimeDays?: number | null;
  productDescription?: string | null;
  categoryName?: string | null;
  brand?: string | null;
  minOrderQty?: number | null;
  availabilityStatus?: string | null;
  stockQty?: number | null;
}

export function SupplierProductGrid({ offers }: { offers: StorefrontOffer[] }): JSX.Element {
  if (!offers.length) {
    return (
      <div className="rounded-2xl border border-dashed border-ink/15 bg-pearl/60 px-6 py-14 text-center">
        <div className="mx-auto mb-4 size-14 rounded-2xl bg-bone border border-ink/10 flex items-center justify-center">
          <PackageIcon size={26} className="text-ink-4" />
        </div>
        <div className="space-y-1.5 max-w-sm mx-auto">
          <h4 className="font-display text-lg font-bold text-ink">No published products yet</h4>
          <p className="text-sm text-ink-3 leading-relaxed">
            This supplier facility is currently updating their active catalog lots and wholesale rate card. Check back shortly or request a direct custom quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {offers.map((o) => {
        const inStock = o.availabilityStatus !== 'out_of_stock';
        const leadDays = typeof o.leadTimeDays === 'number' ? o.leadTimeDays : 1;
        const href = `/products/${o.productId}`;
        const specs = [
          o.unit ? { k: 'Unit', v: o.unit } : null,
          o.packSize ? { k: 'Pack', v: o.packSize } : null,
          { k: 'MOQ', v: String(o.minOrderQty ?? 1) },
        ].filter((s): s is { k: string; v: string } => s !== null);

        return (
          <article
            key={o.id}
            className="group relative flex flex-col rounded-2xl border border-ink/10 bg-paper overflow-hidden transition-all duration-240 ease-cinematic hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-soft-lg"
          >
            {/* Visual */}
            <Link to={href} className="block relative aspect-[4/3] bg-bone overflow-hidden">
              {o.productImage ? (
                <img
                  src={o.productImage}
                  alt={o.productName ?? 'Product'}
                  loading="lazy"
                  className="object-cover w-full h-full transition-transform duration-480 ease-cinematic group-hover:scale-[1.04]"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 bg-gradient-to-br from-bone to-mist/60">
                  <PackageIcon size={32} className="text-ink-4 opacity-50" />
                  <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-ink-4">
                    {o.categoryName || 'Commercial SKU'}
                  </span>
                </div>
              )}

              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ink/25 to-transparent opacity-0 transition-opacity duration-240 group-hover:opacity-100" />

              <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-paper/95 shadow-soft-sm backdrop-blur ${
                    inStock ? 'text-mint' : 'text-rose'
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${inStock ? 'bg-mint' : 'bg-rose'}`} />
                  {inStock ? 'In Stock' : 'Low Stock'}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium text-ink-2 bg-paper/95 shadow-soft-sm backdrop-blur">
                  <ClockIcon size={11} className="text-copper" />
                  Lead {leadDays}d
                </span>
              </div>
            </Link>

            {/* Info */}
            <div className="flex-1 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-[0.14em]">
                <span className="text-copper truncate">
                  {o.categoryName || o.brand || 'Commercial Wholesale'}
                </span>
                {o.brand && o.categoryName && <span className="text-ink-4 truncate">{o.brand}</span>}
              </div>

              <Link to={href} className="block">
                <h3 className="font-display font-bold text-lg leading-snug text-ink line-clamp-2 transition-colors group-hover:text-copper-deep">
                  {o.productName ?? 'Wholesale Product Lot'}
                </h3>
              </Link>

              <dl className="flex flex-wrap gap-1.5 pt-0.5">
                {specs.map((s) => (
                  <div
                    key={s.k}
                    className="inline-flex items-center gap-1 rounded-md bg-bone px-2 py-1 text-[11px] font-mono"
                  >
                    <dt className="text-ink-4">{s.k}</dt>
                    <dd className="font-semibold text-ink-2">{s.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Price & action */}
            <div className="mx-5 mb-5 pt-4 border-t border-ink/10 flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">
                  Wholesale price
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="font-mono text-xl font-bold tracking-tight text-ink">
                    {formatLKR(o.priceCents)}
                  </span>
                  {o.unit && <span className="text-xs text-ink-4 font-mono">/{o.unit}</span>}
                </div>
              </div>

              <Link
                to={href}
                aria-label={`View ${o.productName ?? 'SKU'}`}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-ink text-paper text-xs font-semibold transition-colors hover:bg-ink-2 shrink-0"
              >
                <span>View SKU</span>
                <ArrowRightIcon size={13} className="text-volt transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
