import type { JSX } from 'react';
import { RatingStars } from './RatingStars';
import { RatingDistribution } from './RatingDistribution';
import { ReviewList } from './ReviewList';
import { useSupplierReviewSummary } from './useSupplierReviewSummary';
import { ShieldCheckIcon, CheckCircleIcon } from '@/components/icons';

export function SupplierReviewsPanel({ supplierId }: { supplierId: string }): JSX.Element {
  const summary = useSupplierReviewSummary(supplierId);

  return (
    <div className="space-y-6">
      {/* Top Scorecard & Breakdown Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-7 bg-paper ring-1 ring-ink/[0.07] rounded-3xl">
        {/* Left Column: Overall Metric */}
        <div className="lg:col-span-4 flex flex-col justify-between space-y-3 pb-4 lg:pb-0 lg:border-r border-ink/[0.07] lg:pr-6">
          <div>
            <div className="text-xs text-ink-4">
              Reputation score
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-5xl sm:text-6xl font-extrabold text-ink tracking-[-0.05em] leading-none">
                {summary.avg != null ? summary.avg.toFixed(1) : '—'}
              </span>
              <span className="text-sm text-ink-4">/ 5.0</span>
            </div>
            <div className="mt-2">
              <RatingStars avg={summary.avg} count={summary.count} size="md" />
            </div>
          </div>

          <div className="pt-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bone text-xs font-medium text-ink-3">
              <ShieldCheckIcon size={14} className="text-copper shrink-0" />
              <span>
                {summary.count > 0
                  ? `${summary.count} Verified Purchase ${summary.count === 1 ? 'Review' : 'Reviews'}`
                  : 'Zero Buyer Disputes on Record'}
              </span>
            </div>
          </div>
        </div>

        {/* Middle Column: Star Distribution */}
        <div className="lg:col-span-5 flex flex-col justify-center pb-4 lg:pb-0 lg:border-r border-ink/[0.07] lg:pr-6">
          <div className="text-xs text-ink-4 mb-3">
            Rating distribution
          </div>
          {summary.count > 0 ? (
            <RatingDistribution counts={summary.distribution} total={summary.count} />
          ) : (
            <div className="space-y-2 py-1">
              <p className="text-xs text-ink-4">
                Star breakdowns calculate across 1★–5★ as buyers confirm order deliveries.
              </p>
              <div className="opacity-40 pointer-events-none">
                <RatingDistribution counts={summary.distribution} total={0} />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Platform Trust Safeguards */}
        <div className="lg:col-span-3 flex flex-col justify-center space-y-2.5">
          <div className="text-xs text-ink-4">
            Buyer trust standards
          </div>
          <div className="space-y-2 text-xs text-ink-3">
            <div className="flex items-start gap-1.5">
              <CheckCircleIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
              <span>100% verified purchases only</span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckCircleIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
              <span>Packaging & delivery tracking</span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckCircleIcon size={14} className="text-volt-deep shrink-0 mt-0.5" />
              <span>Direct supplier response channel</span>
            </div>
          </div>
        </div>
      </div>

      {/* Review List & Filters */}
      <ReviewList supplierId={supplierId} />
    </div>
  );
}