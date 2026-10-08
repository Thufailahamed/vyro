import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { SupplierHero } from './SupplierHero';
import { SupplierProductGrid, type StorefrontOffer } from './SupplierProductGrid';
import { StorefrontMeta } from './useStorefrontMeta';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';
import { SponsoredSlot } from '../components/SponsoredSlot';
import type { TrustSignalView } from '../lib/trustApi';
import { ShieldCheckIcon, ChevronRightIcon, ArrowRightIcon, ScaleIcon, FileTextIcon } from '@/components/icons';

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
    api
      .get<StorefrontData>(`/suppliers/by-slug/${encodeURIComponent(slug)}`)
      .then((j) => {
        if (!cancelled) setData(j);
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
            to="/search"
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
      <div className="max-w-6xl mx-auto space-y-8 pb-12" aria-busy="true" aria-label="Loading storefront">
        <div className="h-4 w-56 rounded bg-ink/5 animate-pulse" />
        <div className="rounded-2xl border border-ink/10 bg-paper overflow-hidden">
          <div className="h-28 sm:h-36 bg-ink/90 animate-pulse" />
          <div className="px-5 sm:px-8 pb-8 space-y-4">
            <div className="-mt-10 size-20 sm:size-24 rounded-2xl bg-ink-6 ring-4 ring-paper animate-pulse" />
            <div className="h-3 w-40 rounded bg-ink/5 animate-pulse" />
            <div className="h-10 w-72 max-w-full rounded bg-ink/10 animate-pulse" />
            <div className="h-4 w-52 rounded bg-ink/5 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-ink/10 bg-paper overflow-hidden">
              <div className="aspect-[4/3] bg-bone animate-pulse" />
              <div className="p-5 space-y-2">
                <div className="h-3 w-24 rounded bg-ink/5 animate-pulse" />
                <div className="h-5 w-3/4 rounded bg-ink/10 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <p className="sr-only">Loading storefront credentials & catalog…</p>
      </div>
    );
  }

  const leadTimes = data.offers
    .map((o) => o.leadTimeDays)
    .filter((d): d is number => typeof d === 'number');
  const fastestLeadDays = leadTimes.length ? Math.min(...leadTimes) : null;
  const sponsored = (data.otherSuppliersSponsored ?? []).filter((s) => s.campaignId && s.productId);

  return (
    <div className="space-y-12 max-w-6xl mx-auto animate-fade-in pb-16">
      <StorefrontMeta name={data.supplier.name} city={data.supplier.city} productCount={data.offers.length} />

      <div className="space-y-5">
        {/* Top Navigation & Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-ink-4 pt-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 font-mono">
            <Link to="/search" className="hover:text-ink transition-colors">
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
            <span className="size-1.5 rounded-full bg-volt shadow-[0_0_6px_rgba(198,220,74,0.9)]" />
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
          fastestLeadDays={fastestLeadDays}
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
          trustSignals={data.trustSignals}
        />
      </div>

      {/* Published Products / Catalog Section */}
      <section id="products" className="space-y-6 scroll-mt-24">
        <SectionHeader
          index="01"
          kicker="Wholesale Inventory"
          title="Published Product Lots & Active SKUs"
          aside={
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-paper border border-ink/10 text-xs font-mono font-medium text-ink">
              <span className="font-bold">{data.offers.length}</span>
              <span className="text-ink-4">{data.offers.length === 1 ? 'lot listed' : 'lots listed'}</span>
            </div>
          }
        />

        <SupplierProductGrid offers={data.offers} />
      </section>

      {/* Buyer Reviews & Reputation Section */}
      <section className="space-y-6">
        <SectionHeader
          index="02"
          kicker="Commercial Track Record"
          title="Buyer Reviews & Verification Score"
        />

        <SupplierReviewsPanel supplierId={data.supplier.id} />
      </section>

      {/* Commercial Safeguards Banner */}
      <section className="relative overflow-hidden rounded-2xl bg-ink text-paper p-6 sm:p-10">
        <div aria-hidden="true" className="absolute -top-32 -right-20 size-96 rounded-full bg-volt/15 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-40 -left-24 size-96 rounded-full bg-copper/20 blur-3xl" />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-8 lg:gap-12">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-volt">
              Wholesale Procurement Guarantee
            </div>
            <h2 className="font-display font-bold text-2xl sm:text-3xl leading-tight tracking-tight">
              Every order is protected end to end.
            </h2>
            <p className="text-sm text-paper/60 leading-relaxed max-w-xs">
              Buy from {data.supplier.name} with settlement, negotiation and invoicing handled by VYRO.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-xl overflow-hidden bg-paper/10">
            {GUARANTEES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="bg-ink/95 p-5 space-y-3">
                <div className="size-9 rounded-lg bg-volt/10 border border-volt/20 flex items-center justify-center text-volt">
                  <Icon size={17} />
                </div>
                <div className="text-sm font-semibold">{title}</div>
                <p className="text-xs text-paper/55 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Promoted / Sponsored Suppliers (if enabled) */}
      {sponsored.length > 0 && (
        <section className="space-y-4">
          <div className="vyro-kicker text-copper">Promoted Wholesale Suppliers</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sponsored.slice(0, 3).map((s) => (
              <SponsoredSlot
                key={s.slotId}
                campaignId={s.campaignId!}
                surface={s.surface}
                position={s.position}
              >
                <Link
                  to={`/products/${s.productId}`}
                  className="group flex items-center justify-between bg-paper border border-ink/10 rounded-2xl p-5 hover:border-ink/20 hover:shadow-soft-md transition"
                >
                  <div>
                    <p className="text-sm font-semibold text-ink">Sponsored Product</p>
                    <p className="text-xs text-ink-4 mt-1 font-mono">Slot #{s.position}</p>
                  </div>
                  <ArrowRightIcon size={16} className="text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
              </SponsoredSlot>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const GUARANTEES = [
  {
    icon: ShieldCheckIcon,
    title: 'Platform Escrow Protection',
    body: 'Payments remain in protected settlement escrow until delivery confirmation and cargo inspection.',
  },
  {
    icon: ScaleIcon,
    title: 'Direct Bulk RFQ Processing',
    body: 'Negotiate custom volume tiers, contract schedules, and localized freight dispatch directly.',
  },
  {
    icon: FileTextIcon,
    title: 'Commercial Invoicing (LKR)',
    body: 'Automated 3-way reconciliation with generated purchase orders, delivery notes, and tax invoices.',
  },
];

function SectionHeader({
  index,
  kicker,
  title,
  aside,
}: {
  index: string;
  kicker: string;
  title: string;
  aside?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-ink/10">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-ink-4">{index}</span>
          <span className="h-px w-6 bg-copper/50" />
          <span className="vyro-kicker text-copper">{kicker}</span>
        </div>
        <h2 className="font-display font-bold text-2xl sm:text-[1.75rem] leading-tight tracking-tight text-ink">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}
