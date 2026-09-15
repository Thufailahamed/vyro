import type { JSX } from 'react';
import { RatingStars } from '@/reviews/RatingStars';
import { TrustSealBadge } from '@/components/TrustSealBadge';

export interface SupplierHeroProps {
  name: string;
  city: string | null | undefined;
  verificationStatus: string;
  ratingAvg: number | null;
  ratingCount: number;
  email: string | null | undefined;
  trustSealed?: boolean | undefined;
  trustSealExpiresAt?: number | null | undefined;
  memberSinceYear?: number | null | undefined;
}

export function SupplierHero(props: SupplierHeroProps): JSX.Element {
  return (
    <section className="border border-ink/10 bg-paper p-6 sm:p-10 space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-2 min-w-0">
          <h1 className="font-display font-bold text-3xl text-ink">{props.name}</h1>
          <div className="flex items-center gap-3 text-sm text-ink-3">
            {props.city && <span>📍 {props.city}</span>}
            {props.verificationStatus === 'verified' && (
              <span className="inline-flex items-center gap-1 text-mint font-medium">✓ Verified</span>
            )}
            <TrustSealBadge
              active={!!props.trustSealed}
              memberSinceYear={props.memberSinceYear ?? null}
              expiresAt={props.trustSealExpiresAt ?? null}
            />
          </div>
        </div>
        <RatingStars avg={props.ratingAvg ?? 0} count={props.ratingCount ?? 0} size="md" />
      </div>
      {props.email && (
        <a
          href={`mailto:${props.email}`}
          className="inline-block px-4 py-2 bg-copper text-paper text-sm font-semibold rounded"
        >
          Contact supplier
        </a>
      )}
    </section>
  );
}
