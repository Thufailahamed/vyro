import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  campaignId: string | null;
  surface: 'search' | 'category' | 'homepage' | 'storefront';
  position: number;
  children?: React.ReactNode;
}

export function SponsoredSlot({ campaignId, surface, position, children }: Props) {
  if (!campaignId) return <>{children}</>;
  return (
    <div className="relative" data-sponsored-slot={surface} data-position={position}>
      <span
        className="absolute top-1 left-1 z-10 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
        title="Paid placement. Learn more."
        aria-label="Sponsored placement"
      >
        Sponsored
      </span>
      <Link to="/sponsored" className="absolute top-1 right-1 z-10 text-xs text-amber-700 underline">
        Ad disclosure
      </Link>
      {children}
    </div>
  );
}