import type { JSX } from 'react';
import type { TrustBadgeSize } from './TrustBadgeKyc';

export function TrustBadgeMemberSince({
  year,
  size = 'full',
}: {
  year: number;
  size?: TrustBadgeSize;
}): JSX.Element {
  if (size === 'compact') {
    return (
      <span
        title={`Member since ${year}`}
        aria-label={`Member since ${year}`}
        className="trust-badge trust-badge-compact member"
      >
        📅
      </span>
    );
  }
  return (
    <span className="trust-badge member inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sky-50 text-sky-800 text-xs font-medium border border-sky-200">
      📅 Member since {year}
    </span>
  );
}
