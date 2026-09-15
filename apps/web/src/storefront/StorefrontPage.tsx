import { useEffect, useState, type JSX } from 'react';
import { useParams } from 'react-router-dom';
import { SupplierHero } from './SupplierHero';
import { SupplierProductGrid, type StorefrontOffer } from './SupplierProductGrid';
import { StorefrontMeta } from './useStorefrontMeta';
import { SupplierReviewsPanel } from '@/reviews/SupplierReviewsPanel';

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
  };
  offers: StorefrontOffer[];
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
      />
      <section>
        <div className="vyro-kicker text-copper mb-3">Published products</div>
        <SupplierProductGrid offers={data.offers} />
      </section>
      <section>
        <div className="vyro-kicker text-copper mb-3">Buyer reviews</div>
        <SupplierReviewsPanel supplierId={data.supplier.id} />
      </section>
    </div>
  );
}
