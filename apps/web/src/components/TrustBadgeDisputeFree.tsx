import type { JSX } from 'react';
import type { TrustBadgeSize } from './TrustBadgeKyc';

export function TrustBadgeDisputeFree({ size = 'full' }: { size?: TrustBadgeSize }): JSX.Element {
  if (size === 'compact') {
    return (
      <span
        title="Dispute-free"
        aria-label="Dispute-free"
        className="trust-badge trust-badge-compact dispute-free"
      >
        🛡
      </span>
    );
  }
  return (
    <span className="trust-badge dispute-free inline-flex items-center gap-1 px-2 py-1 rounded-full bg-violet-50 text-violet-800 text-xs font-medium border border-violet-200">
      🛡 Dispute-free
    </span>
  );
}
