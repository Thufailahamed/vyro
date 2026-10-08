import { useState, type JSX, type ReactNode } from 'react';
import type { TrustSignalView } from '@/lib/trustApi';
import {
  ShieldCheckIcon,
  PackageIcon,
  CopyIcon,
  CheckCheckIcon,
  ExternalLinkIcon,
  MapPinIcon,
  ClockIcon,
  CalendarIcon,
  ArrowRightIcon,
  CheckIcon,
  TruckIcon,
  BanknoteIcon,
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
  fastestLeadDays?: number | null | undefined;
  slug?: string | null | undefined;
  trustSignals?: TrustSignalView | null | undefined;
}

function Chip({ icon, children, tone = 'plain', title }: { icon: ReactNode; children: ReactNode; tone?: 'plain' | 'volt' | 'gold'; title?: string }): JSX.Element {
  const tones = {
    plain: 'border-paper/15 bg-paper/[0.06] text-paper/80',
    volt: 'border-volt/30 bg-volt/10 text-volt',
    gold: 'border-amber/40 bg-amber/15 text-[#E9B872]',
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full border text-[11px] font-medium backdrop-blur-sm ${tones[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

export function SupplierHero(props: SupplierHeroProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const isVerified = props.verificationStatus === 'verified';
  const initial = props.name ? props.name.trim().charAt(0).toUpperCase() : 'S';
  const productCount = props.productCount ?? 0;
  const sinceYear = props.supplierSinceYear ?? props.memberSinceYear ?? props.trustSignals?.memberSinceYear ?? null;
  const memberYears = props.supplierMemberYears;
  const hasRating = props.ratingCount > 0 && props.ratingAvg != null;
  const ts = props.trustSignals;
  const showOnTime = ts?.onTimePct != null && ts.onTimeSampleSize >= 5;
  const location = props.city
    ? `${props.city}${props.district && props.district !== props.city ? `, ${props.district}` : ''}`
    : null;
  const sealExp = props.trustSealExpiresAt ? new Date(props.trustSealExpiresAt).toLocaleDateString() : null;

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

  const stats: { label: string; value: ReactNode; hint: string; icon: JSX.Element }[] = [
    {
      label: 'Active catalog',
      value: productCount,
      hint: productCount === 1 ? 'Published SKU' : 'Published SKUs',
      icon: <PackageIcon size={14} />,
    },
    {
      label: 'Fastest lead',
      value: props.fastestLeadDays != null ? `${props.fastestLeadDays}d` : '—',
      hint: 'Depot dispatch',
      icon: <ClockIcon size={14} />,
    },
    {
      label: 'Buyer rating',
      value: hasRating ? (
        <span className="inline-flex items-baseline gap-1.5">
          {props.ratingAvg!.toFixed(1)}
          <span className="text-base text-volt">★</span>
        </span>
      ) : (
        'New'
      ),
      hint: hasRating
        ? `${props.ratingCount} verified ${props.ratingCount === 1 ? 'review' : 'reviews'}`
        : 'Awaiting first review',
      icon: <span className="text-[12px] leading-none">★</span>,
    },
    {
      label: 'On VYRO since',
      value: sinceYear ?? '—',
      hint: memberYears != null && memberYears > 0 ? `${memberYears} yrs trading` : 'New member',
      icon: <CalendarIcon size={14} />,
    },
  ];

  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-ink text-paper shadow-soft-lg ring-1 ring-ink/10">
      {/* Atmosphere */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(250,247,240,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(250,247,240,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 75% 20%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 80% at 75% 20%, black, transparent)',
          }}
        />
        <div className="absolute -top-40 -left-24 size-[28rem] rounded-full bg-volt/20 blur-[110px]" />
        <div className="absolute -top-20 right-[-6rem] size-[26rem] rounded-full bg-copper/25 blur-[120px]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-volt/50 to-transparent" />
      </div>

      <div className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
        {/* Identity */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-10">
          <div className="flex items-start sm:items-center gap-5 sm:gap-6 min-w-0">
            <div className="relative shrink-0">
              <div className="size-20 sm:size-28 rounded-2xl sm:rounded-[1.75rem] bg-gradient-to-br from-volt-glow to-volt text-ink font-display font-extrabold text-4xl sm:text-5xl flex items-center justify-center shadow-[0_20px_50px_-20px_rgba(198,220,74,0.7)] select-none">
                {initial}
              </div>
              {isVerified && (
                <span
                  className="absolute -bottom-1.5 -right-1.5 size-7 sm:size-8 rounded-full bg-paper text-ink flex items-center justify-center ring-4 ring-ink"
                  title="Verified business"
                >
                  <CheckIcon size={15} strokeWidth={3} />
                </span>
              )}
            </div>

            <div className="min-w-0 space-y-2.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-copper-soft">
                {props.businessTypeName || 'Wholesale Supplier Facility'}
              </div>
              <h1 className="font-display font-extrabold text-4xl sm:text-6xl leading-[0.9] tracking-tight text-paper break-words">
                {props.name}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-paper/60">
                {location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon size={15} className="text-volt" />
                    {location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheckIcon size={15} className="text-volt" />
                  Authenticated PO fulfillment
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded-full whitespace-nowrap border border-paper/20 bg-paper/5 text-sm font-medium text-paper hover:bg-paper/10 transition-colors cursor-pointer backdrop-blur-sm"
              title="Copy public storefront link"
            >
              {copied ? (
                <>
                  <CheckCheckIcon size={15} className="text-volt" />
                  <span className="text-volt">Link Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon size={15} className="text-paper/70" />
                  <span>Share Storefront</span>
                </>
              )}
            </button>
            {props.email ? (
              <a
                href={`mailto:${props.email}`}
                className="inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded-full whitespace-nowrap bg-volt text-ink text-sm font-semibold hover:bg-volt-glow transition-colors"
              >
                <span>Contact Facility</span>
                <ExternalLinkIcon size={14} />
              </a>
            ) : (
              <a
                href="#products"
                className="group inline-flex items-center justify-center gap-2 h-11 px-4 sm:px-5 rounded-full whitespace-nowrap bg-volt text-ink text-sm font-semibold hover:bg-volt-glow transition-colors"
              >
                <span>Browse catalog</span>
                <ArrowRightIcon size={15} className="transition-transform group-hover:translate-x-0.5" />
              </a>
            )}
          </div>
        </div>

        {/* Trust chips */}
        <div className="mt-7 flex flex-wrap items-center gap-2" aria-label="Supplier trust signals">
          {(isVerified || ts?.kyc) && (
            <Chip tone="volt" icon={<CheckIcon size={12} strokeWidth={3} />}>
              Verified business
            </Chip>
          )}
          {props.trustSealed && (
            <Chip
              tone="gold"
              icon={<ShieldCheckIcon size={12} />}
              title={sealExp ? `TrustSEAL verified · expires ${sealExp}` : 'TrustSEAL verified supplier'}
            >
              TrustSEAL
            </Chip>
          )}
          {ts?.disputeFree && <Chip icon={<ShieldCheckIcon size={12} />}>Dispute-free</Chip>}
          {showOnTime && (
            <Chip icon={<TruckIcon size={12} />}>
              {Math.round(ts!.onTimePct!)}% on-time · {ts!.onTimeSampleSize} orders
            </Chip>
          )}
          <Chip icon={<BanknoteIcon size={12} />}>Escrow protected</Chip>
        </div>
      </div>

      {/* Stat strip */}
      <dl className="grid grid-cols-2 lg:grid-cols-4 border-t border-paper/10 bg-paper/[0.03]">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`px-5 sm:px-8 lg:px-10 py-5 border-paper/10 ${i % 2 === 1 ? 'border-l' : ''} ${i >= 2 ? 'border-t lg:border-t-0' : ''} ${i === 2 ? 'lg:border-l' : ''}`}
          >
            <dt className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-paper/45">
              <span className="text-copper-soft">{s.icon}</span>
              {s.label}
            </dt>
            <dd className="mt-2">
              <div className="font-display font-bold text-2xl sm:text-3xl leading-none tracking-tight text-paper">
                {s.value}
              </div>
              <div className="mt-1.5 text-xs text-paper/45 truncate">{s.hint}</div>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
