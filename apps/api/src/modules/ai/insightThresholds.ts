export type InsightKind =
  | 'price_drop'
  | 'price_increase'
  | 'reorder_due'
  | 'savings_opportunity'
  | 'supplier_signal'
  | 'health_score'
  | 'concentration_risk';

export const INSIGHT_THRESHOLDS: Record<InsightKind, {
  description: string;
  pct?: number;
  windowDays?: number;
  minAmountCents?: number;
  minHealthDelta?: number;
}> = {
  price_drop:         { description: 'Price drop ≥ 5% over 7d',          pct: -5,    windowDays: 7 },
  price_increase:     { description: 'Price increase ≥ 10% over 28d',    pct: 10,    windowDays: 28 },
  reorder_due:        { description: 'Reorder due (cadence signal)' },
  savings_opportunity:{ description: 'Savings ≥ Rs. 5,000',                minAmountCents: 500000 },
  supplier_signal:    { description: 'Supplier delivery/cancellation change ≥ 15%', pct: 15, windowDays: 30 },
  health_score:       { description: 'Procurement health score change ≥ 5 points', minHealthDelta: 5 },
  concentration_risk: { description: 'Supplier concentration entered "high"' },
};
