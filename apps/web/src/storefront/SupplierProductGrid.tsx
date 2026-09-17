import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { formatLKR } from '@/lib/format';
import { PackageIcon, ArrowRightIcon, ExternalLinkIcon, CheckCircle2Icon } from '@/components/icons';

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
      <div className="border border-dashed border-ink/15 rounded-xl p-10 text-center bg-paper/60 space-y-3">
        <PackageIcon size={36} className="mx-auto text-ink-4 opacity-50" />
        <div className="space-y-1 max-w-sm mx-auto">
          <h4 className="text-sm font-semibold text-ink">No published products yet.</h4>
          <p className="text-xs text-ink-3">
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

        return (
          <div
            key={o.id}
            className="group flex flex-col justify-between rounded-xl border border-ink/10 bg-paper hover:border-ink/30 hover:shadow-md transition-all duration-200 overflow-hidden"
          >
            <div>
              {/* Product Image / Visual Frame */}
              <Link to={`/products/${o.productId}`} className="block relative aspect-4/3 bg-sand/30 overflow-hidden border-b border-ink/5">
                {o.productImage ? (
                  <img
                    src={o.productImage}
                    alt={o.productName ?? 'Product'}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-ink-4 bg-sand/20">
                    <PackageIcon size={32} className="opacity-40" />
                    <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                      {o.categoryName || 'Commercial SKU'}
                    </span>
                  </div>
                )}

                {/* Overlays */}
                <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider ${
                      inStock
                        ? 'bg-paper/90 text-mint border border-mint/30 shadow-2xs backdrop-blur-xs'
                        : 'bg-paper/90 text-rose-600 border border-rose-200 shadow-2xs backdrop-blur-xs'
                    }`}
                  >
                    <span className={`size-1.5 rounded-full ${inStock ? 'bg-mint' : 'bg-rose-500'}`} />
                    <span>{inStock ? 'In Stock' : 'Low Stock'}</span>
                  </span>
                </div>

                <div className="absolute top-2.5 right-2.5">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-ink-3 bg-paper/90 border border-ink/15 shadow-2xs backdrop-blur-xs">
                    <span>⚡ Lead {leadDays}d</span>
                  </span>
                </div>
              </Link>

              {/* Product Info */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-copper">
                  <span className="uppercase tracking-wider truncate">
                    {o.categoryName || o.brand || 'Commercial Wholesale'}
                  </span>
                  {o.brand && (
                    <span className="text-ink-4 truncate ml-2">Brand: {o.brand}</span>
                  )}
                </div>

                <Link to={`/products/${o.productId}`} className="block">
                  <h3 className="font-semibold text-base text-ink line-clamp-1 group-hover:text-copper transition-colors">
                    {o.productName ?? 'Wholesale Product Lot'}
                  </h3>
                </Link>

                {/* Specifications strip */}
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3 pt-1 font-mono">
                  {o.unit && (
                    <span className="bg-sand/30 px-2 py-0.5 rounded border border-ink/5">
                      Unit: <strong className="text-ink-2">{o.unit}</strong>
                    </span>
                  )}
                  {o.packSize && (
                    <span className="bg-sand/30 px-2 py-0.5 rounded border border-ink/5">
                      Pack: <strong className="text-ink-2">{o.packSize}</strong>
                    </span>
                  )}
                  <span className="bg-sand/30 px-2 py-0.5 rounded border border-ink/5">
                    MOQ: <strong className="text-ink-2">{o.minOrderQty ?? 1}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Price & Action Footer */}
            <div className="p-4 pt-3 border-t border-ink/10 bg-sand/15 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
                  Wholesale Price
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-lg font-bold text-ink">
                    {formatLKR(o.priceCents)}
                  </span>
                  {o.unit && (
                    <span className="text-xs text-ink-4 font-mono">/{o.unit}</span>
                  )}
                </div>
              </div>

              <Link
                to={`/products/${o.productId}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ink text-paper text-xs font-semibold hover:bg-ink/90 active:scale-[0.99] transition shadow-2xs shrink-0"
              >
                <span>View SKU</span>
                <ArrowRightIcon size={13} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
