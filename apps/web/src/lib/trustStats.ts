export interface LiveTrustStats {
  districtsCovered: number;
  lifetimeGmvCents: number;
  activeBusinesses?: number;
  activeSuppliers: number;
}

export interface TrustStatCard {
  metric: string;
  label: string;
  sub: string;
}

const FLOOR_DISTRICTS = 25;
const FLOOR_GMV_LABEL = 'Rs. 100M+';
/** 1 million LKR, expressed in cents. */
const MILLION_LKR_CENTS = 100 * 1_000_000;

export const MARKETING_TRUST_STATS: TrustStatCard[] = [
  { metric: '25', label: 'Districts Covered', sub: 'Island-wide freight routing' },
  { metric: FLOOR_GMV_LABEL, label: 'Wholesale Throughput', sub: 'Active commercial trading volume' },
  { metric: '100%', label: 'Verified Suppliers', sub: 'Audited tax & depot identity' },
  { metric: '0%', label: 'Hidden Broker Markup', sub: 'Direct factory & mill prices' },
];

/**
 * Homepage ticker: use live counts when they look like a real network,
 * otherwise keep the marketing floor so a sparse local DB does not show "3 Districts" / "Rs. 0M+".
 */
export function renderTrustStats(live?: LiveTrustStats | null): TrustStatCard[] {
  if (!live) return MARKETING_TRUST_STATS;
  const districts = Math.max(live.districtsCovered, FLOOR_DISTRICTS);
  const gmvLabel =
    live.lifetimeGmvCents >= MILLION_LKR_CENTS
      ? `Rs. ${Math.floor(live.lifetimeGmvCents / MILLION_LKR_CENTS)}M+`
      : FLOOR_GMV_LABEL;
  return [
    { metric: String(districts), label: 'Districts Covered', sub: 'Island-wide freight routing' },
    { metric: gmvLabel, label: 'Wholesale Throughput', sub: 'Active commercial trading volume' },
    { metric: '100%', label: 'Verified Suppliers', sub: 'Audited tax & depot identity' },
    { metric: '0%', label: 'Hidden Broker Markup', sub: 'Direct factory & mill prices' },
  ];
}
