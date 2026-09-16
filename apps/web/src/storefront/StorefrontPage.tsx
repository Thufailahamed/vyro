import { useEffect, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SupplierHero } from './SupplierHero';
import { SupplierProductGrid, type StorefrontOffer } from './SupplierProductGrid';
import { StorefrontMeta } from './useStorefrontMeta';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';
import { SponsoredSlot } from '../components/SponsoredSlot';

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

  if (error) return <div className="p-8 text-center text-ink-3">{error}</div>;
  if (!data) return <div className="p-8 text-center text-ink-3">Loading…</div>;
  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <StorefrontMeta name={data.supplier.name} city={data.supplier.city} productCount={data.offers.length} />
      <SupplierHero
        name={data.supplier.name}
        city={data.supplier.city}
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
      <section>
        <div className="vyro-kicker text-copper mb-3">Published products</div>
        <SupplierProductGrid offers={data.offers} />
      </section>
      <section>
        <div className="vyro-kicker text-copper mb-3">Buyer reviews</div>
        <SupplierReviewsPanel supplierId={data.supplier.id} />
      </section>
      {(data.otherSuppliersSponsored ?? []).filter((s) => s.campaignId && s.productId).length > 0 && (
        <section>
          <div className="vyro-kicker text-copper mb-3">Other suppliers, promoted</div>
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
                  <Link to={`/products/${s.productId}`} className="block bg-paper border border-ink/15 rounded-xl p-4 hover:border-copper/40 transition">
                    <p className="text-sm font-medium">Sponsored product</p>
                    <p className="text-xs text-gray-500 mt-1">Slot #{s.position}</p>
                  </Link>
                </SponsoredSlot>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
