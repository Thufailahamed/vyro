import type { JSX } from 'react';
import type { TrustSignalView } from '../lib/trustApi';
import { TrustBadgeKyc, type TrustBadgeSize } from './TrustBadgeKyc';
import { TrustBadgeMemberSince } from './TrustBadgeMemberSince';
import { TrustBadgeOnTime } from './TrustBadgeOnTime';
import { TrustBadgeDisputeFree } from './TrustBadgeDisputeFree';

export function TrustSignalBadges({
  view,
  size = 'full',
}: {
  view: TrustSignalView | null;
  size?: TrustBadgeSize;
}): JSX.Element | null {
  if (!view) return null;

  const meetsSample = view.onTimeSampleSize >= 5;
  const hasAny =
    view.kyc || view.memberSinceYear != null || (view.onTimePct != null && meetsSample) || view.disputeFree;
  if (!hasAny) return null;

  return (
    <div
      className={`trust-signal-badges size-${size} flex flex-wrap items-center gap-2`}
      aria-label="Supplier trust signals"
    >
      {view.kyc && <TrustBadgeKyc size={size} />}
      {view.memberSinceYear && (
        <TrustBadgeMemberSince year={view.memberSinceYear} size={size} />
      )}
      {view.onTimePct != null && meetsSample && (
        <TrustBadgeOnTime pct={view.onTimePct} sample={view.onTimeSampleSize} size={size} />
      )}
      {view.disputeFree && <TrustBadgeDisputeFree size={size} />}
    </div>
  );
}
