import type { JSX } from 'react';

export type TrustBadgeSize = 'full' | 'compact' | 'verbose';

export function TrustBadgeKyc({ size = 'full' }: { size?: TrustBadgeSize }): JSX.Element {
  if (size === 'compact') {
    return (
      <span
        title="Verified business"
        aria-label="Verified business"
        className="trust-badge trust-badge-compact kyc"
      >
        ✅
      </span>
    );
  }
  return (
    <span className="trust-badge kyc inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200">
      ✅ Verified business
    </span>
  );
}
