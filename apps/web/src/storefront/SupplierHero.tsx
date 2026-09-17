import { useState, type JSX } from 'react';
import { RatingStars } from '@/reviews/RatingStars';
import { TrustSealBadge } from '@/components/TrustSealBadge';
import { MemberSinceBadge } from '@/components/MemberSinceBadge';
import {
  ShieldCheckIcon,
  PackageIcon,
  TruckIcon,
  CopyIcon,
  CheckCheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
} from '@/components/icons';

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
  supplierSinceYear?: number | null | undefined;
  supplierMemberYears?: number | null | undefined;
  supplierSinceDate?: string | null | undefined;
  businessTypeName?: string | null | undefined;
  district?: string | null | undefined;
  productCount?: number | undefined;
  slug?: string | null | undefined;
}

export function SupplierHero(props: SupplierHeroProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const isVerified = props.verificationStatus === 'verified';
  const initial = props.name ? props.name.trim().charAt(0).toUpperCase() : 'S';

  async function handleCopyLink() {
    try {
      if (typeof window !== 'undefined') {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink/10 bg-paper p-6 sm:p-8 space-y-6 shadow-xs">
      {/* Subtle top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-volt via-mint to-copper opacity-90" />

      {/* Main identity row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Avatar & Supplier Information */}
        <div className="flex items-start gap-4 sm:gap-5 min-w-0">
          <div className="size-16 sm:size-20 rounded-xl bg-ink text-volt font-mono font-extrabold text-2xl sm:text-3xl flex items-center justify-center border-2 border-volt/30 shadow-xs shrink-0 select-none">
            {initial}
          </div>

          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="vyro-kicker text-copper text-[11px]">
                {props.businessTypeName || 'Wholesale Supplier Facility'}
              </span>
              {isVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-mint/10 border border-mint/20 text-mint text-xs font-semibold">
                  <span className="size-1.5 rounded-full bg-mint animate-pulse" />
                  <span>✓ Verified</span>
                </span>
              )}
            </div>

            <h1 className="font-display font-extrabold text-2xl sm:text-4xl text-ink tracking-tight truncate">
              {props.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-ink-3">
              {props.city && (
                <span className="inline-flex items-center gap-1 font-medium text-ink-2">
                  <span>📍</span>
                  <span>
                    {props.city}
                    {props.district && props.district !== props.city ? `, ${props.district}` : ''}
                  </span>
                </span>
              )}
              <TrustSealBadge
                active={!!props.trustSealed}
                memberSinceYear={props.memberSinceYear ?? null}
                expiresAt={props.trustSealExpiresAt ?? null}
              />
              <MemberSinceBadge
                sinceYear={props.supplierSinceYear ?? null}
                memberYears={props.supplierMemberYears ?? null}
                sinceDate={props.supplierSinceDate ?? null}
              />
            </div>
          </div>
        </div>

        {/* Right: Reputation & Performance summary */}
        <div className="flex flex-col sm:items-end justify-between gap-3 p-4 rounded-xl bg-sand/30 border border-ink/10 shrink-0">
          <div className="flex sm:flex-col sm:items-end justify-between items-center gap-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              Wholesale Trust Record
            </div>
            <RatingStars avg={props.ratingAvg ?? 0} count={props.ratingCount ?? 0} size="md" />
          </div>
          <div className="text-xs font-mono text-ink-4 flex items-center gap-1.5">
            <ShieldCheckIcon size={13} className="text-volt shrink-0" />
            <span>Authenticated PO Fulfillment</span>
          </div>
        </div>
      </div>

      {/* Operational Highlights Strip */}
      <div className="pt-2 border-t border-ink/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-sand/20 border border-ink/5">
          <PackageIcon size={15} className="text-copper shrink-0" />
          <div className="truncate">
            <span className="font-mono font-bold text-ink">{props.productCount ?? 1}</span>
            <span className="text-ink-4 ml-1">Published {props.productCount === 1 ? 'SKU' : 'SKUs'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-sand/20 border border-ink/5">
          <TruckIcon size={15} className="text-volt shrink-0" />
          <div className="truncate">
            <span className="font-medium text-ink">Depot Dispatch</span>
            <span className="text-ink-4 ml-1 hidden sm:inline">Available</span>
          </div>
        </div>

        <div className="flex items-center gap-2 p-2 rounded-lg bg-sand/20 border border-ink/5">
          <ShieldCheckIcon size={15} className="text-mint shrink-0" />
          <div className="truncate">
            <span className="font-medium text-ink">Escrow Protected</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink/15 bg-paper hover:bg-sand/40 text-xs font-medium text-ink transition-colors shadow-2xs cursor-pointer"
            title="Copy public storefront link"
          >
            {copied ? (
              <>
                <CheckCheckIcon size={13} className="text-volt" />
                <span className="text-volt font-semibold">Link Copied</span>
              </>
            ) : (
              <>
                <CopyIcon size={13} className="text-ink-3" />
                <span>Share Storefront</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Optional Contact Button */}
      {props.email && (
        <div className="pt-1">
          <a
            href={`mailto:${props.email}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-paper text-xs sm:text-sm font-semibold rounded-lg hover:bg-ink/90 transition shadow-xs"
          >
            <span>Contact Facility</span>
            <ExternalLinkIcon size={13} />
          </a>
        </div>
      )}
    </section>
  );
}
