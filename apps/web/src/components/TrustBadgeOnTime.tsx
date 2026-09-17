import type { JSX } from 'react';
import type { TrustBadgeSize } from './TrustBadgeKyc';

export function TrustBadgeOnTime({
  pct,
  sample,
  size = 'full',
}: {
  pct: number;
  sample: number;
  size?: TrustBadgeSize;
}): JSX.Element {
  if (size === 'compact') {
    return (
      <span
        title={`On-time delivery ${pct}% (${sample} orders)`}
        aria-label={`On-time delivery ${pct} percent`}
        className="trust-badge trust-badge-compact ontime"
      >
        ⏱
      </span>
    );
  }
  return (
    <span className="trust-badge ontime inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
      ⏱ On-time delivery {pct}% <small className="opacity-70">({sample} orders)</small>
    </span>
  );
}
