import { useEffect, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SupplierHero } from './SupplierHero';
import { SupplierProductGrid, type StorefrontOffer } from './SupplierProductGrid';
import { StorefrontMeta } from './useStorefrontMeta';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';
import { SponsoredSlot } from '../components/SponsoredSlot';
import { TrustSignalBadges } from '../components/TrustSignalBadges';
import type { TrustSignalView } from '../lib/trustApi';
import { ShieldCheckIcon, ChevronRightIcon, ArrowRightIcon } from '@/components/icons';

interface SponsoredUpsell {
  slotId: string;
  campaignId: string | null;
  productId: string | null;
  surface: 'search' | 'category' | 'homepage' | 'storefront';
  position: number;
}

interface StorefrontData {
  supplier: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    district: string | null;
    verificationStatus: string;
    businessTypeName: string | null;
    ratingCount: number;
    ratingAvg: number | null;
    trustSealed?: boolean;
    trustSealExpiresAt?: number | null;
    memberSinceYear?: number | null;
    supplierSinceYear?: number | null;
    supplierSinceDate?: string | null;
    supplierMemberYears?: number | null;
  };
  offers: StorefrontOffer[];
  trustSignals?: TrustSignalView | null;
  otherSuppliersSponsored?: SponsoredUpsell[];
}

export function StorefrontPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<StorefrontData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/suppliers/by-slug/${encodeURIComponent(slug)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Failed (${r.status})`))))
      .then((j: unknown) => {
        if (cancelled || !j || typeof j !== 'object') return;
        if (!cancelled) setData(j as StorefrontData);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-4">
        <div className="mx-auto size-12 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center font-mono font-bold text-xl">
          !
        </div>
        <h2 className="text-xl font-bold text-ink">Supplier Storefront Not Available</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto">
          {error} — This facility storefront may be pending KYB verification or the requested URL does not match an active supplier.
        </p>
        <div className="pt-2">
          <Link
            to="/marketplace"
            className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-paper text-xs font-semibold rounded-lg hover:bg-ink/90 transition shadow-xs"
          >
            <span>Return to Marketplace</span>
            <ArrowRightIcon size={14} />
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-6xl mx-auto py-20 px-4 text-center space-y-3">
        <div className="size-8 rounded-full border-2 border-copper border-t-transparent animate-spin mx-auto" />
        <p className="text-sm font-mono text-ink-3">Loading storefront credentials & catalog…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-fade-in pb-12">
      <StorefrontMeta name={data.supplier.name} city={data.supplier.city} productCount={data.offers.length} />

      {/* Top Navigation & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-ink-4 pt-1">
        <nav className="flex items-center gap-1.5 font-mono">
          <Link to="/marketplace" className="hover:text-ink transition-colors">
            Marketplace
          </Link>
          <ChevronRightIcon size={12} className="opacity-40" />
          <span className="text-ink-4">Suppliers</span>
          <ChevronRightIcon size={12} className="opacity-40" />
          <span className="text-ink font-semibold truncate max-w-[200px]">
            {data.supplier.name}
          </span>
        </nav>

        <div className="inline-flex items-center gap-2 text-[11px] font-mono">
          <span className="size-1.5 rounded-full bg-volt" />
          <span>VYRO Verified Wholesale Node</span>
        </div>
      </div>

      {/* Supplier Identity Hero */}
      <SupplierHero
        name={data.supplier.name}
        city={data.supplier.city}
        district={data.supplier.district}
        businessTypeName={data.supplier.businessTypeName}
        productCount={data.offers.length}
        slug={data.supplier.slug}
        verificationStatus={data.supplier.verificationStatus}
        ratingAvg={data.supplier.ratingAvg}
        ratingCount={data.supplier.ratingCount}
        email={null}
        trustSealed={data.supplier.trustSealed}
        trustSealExpiresAt={data.supplier.trustSealExpiresAt}
        memberSinceYear={data.supplier.memberSinceYear}
        supplierSinceYear={data.supplier.supplierSinceYear}
        supplierMemberYears={data.supplier.supplierMemberYears}
        supplierSinceDate={data.supplier.supplierSinceDate}
      />

      {/* Trust Signals Section */}
      {data.trustSignals && (
        <section aria-label="Trust signals">
          <TrustSignalBadges view={data.trustSignals} size="full" />
        </section>
      )}

      {/* Published Products / Catalog Section */}
      <section id="products" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-ink/10">
          <div>
            <div className="vyro-kicker text-copper mb-0.5">Wholesale Inventory</div>
            <h2 className="text-xl font-bold text-ink">
              Published Product Lots & Active SKUs
            </h2>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sand/30 border border-ink/10 text-xs font-mono font-medium text-ink">
            <span>{data.offers.length}</span>
            <span className="text-ink-4">{data.offers.length === 1 ? 'lot listed' : 'lots listed'}</span>
          </div>
        </div>

        <SupplierProductGrid offers={data.offers} />
      </section>

      {/* Buyer Reviews & Reputation Section */}
      <section className="space-y-4 pt-4">
        <div className="pb-2 border-b border-ink/10">
          <div className="vyro-kicker text-copper mb-0.5">Commercial Track Record</div>
          <h2 className="text-xl font-bold text-ink">
            Buyer Reviews & Verification Score
          </h2>
        </div>

        <SupplierReviewsPanel supplierId={data.supplier.id} />
      </section>

      {/* Commercial Safeguards Banner */}
      <section className="p-6 rounded-2xl border border-ink/10 bg-sand/20 space-y-4">
        <div className="vyro-kicker text-copper">Wholesale Procurement Guarantee</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <ShieldCheckIcon size={14} className="text-volt" />
              <span>Platform Escrow Protection</span>
            </div>
            <p className="text-xs text-ink-3 leading-relaxed">
              Payments remain in protected settlement escrow until delivery confirmation and cargo inspection.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <span className="text-volt text-sm">⚡</span>
              <span>Direct Bulk RFQ Processing</span>
            </div>
            <p className="text-xs text-ink-3 leading-relaxed">
              Negotiate custom volume tiers, contract schedules, and localized freight dispatch directly.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <span className="text-volt text-sm">📑</span>
              <span>Commercial Invoicing (LKR)</span>
            </div>
            <p className="text-xs text-ink-3 leading-relaxed">
              Automated 3-way reconciliation with generated purchase orders, delivery notes, and tax invoices.
            </p>
          </div>
        </div>
      </section>

      {/* Promoted / Sponsored Suppliers (if enabled) */}
      {(data.otherSuppliersSponsored ?? []).filter((s) => s.campaignId && s.productId).length > 0 && (
        <section className="space-y-4 pt-4">
          <div className="vyro-kicker text-copper mb-2">Promoted Wholesale Suppliers</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data.otherSuppliersSponsored ?? [])
              .filter((s) => s.campaignId && s.productId)
              .slice(0, 3)
              .map((s) => (
                <SponsoredSlot
                  key={s.slotId}
                  campaignId={s.campaignId!}
                  surface={s.surface}
                  position={s.position}
                >
                  <Link
                    to={`/products/${s.productId}`}
                    className="block bg-paper border border-ink/15 rounded-xl p-4 hover:border-copper/40 transition shadow-2xs"
                  >
                    <p className="text-sm font-semibold text-ink">Sponsored Product</p>
                    <p className="text-xs text-ink-4 mt-1 font-mono">Slot #{s.position}</p>
                  </Link>
                </SponsoredSlot>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
