/** Pure helpers for the VYRO AI home dashboard. No IO, fully testable. */
export interface HomeHealthScore {
  score: number;
  breakdown: {
    concentration: number;
    priceCompetitiveness: number;
    deliveryReliability: number;
    consistency: number;
    savingsOpportunity: number;
  };
}

export interface HomeConcentrationRisk {
  topSupplierShare: number;
  label: 'low' | 'moderate' | 'high';
  alternativeCount: number;
}

export interface HomePayload {
  reorderDue: Array<{ productName: string; lastPurchaseDaysAgo?: number }>;
  savingsTotal: number;
  topMoves: Array<{ productName: string; from: number; to: number; pct: number }>;
  monthly: number[];
  concentration: Array<{ supplierId: string; supplierName: string; share: number }>;
  healthScore: HomeHealthScore;
  concentrationRisk: HomeConcentrationRisk;
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatLKR(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return `Rs. ${(cents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function savingsHeadline(totalCents: number): string {
  if (totalCents <= 0) return 'No savings opportunities right now.';
  return `You could potentially save ${formatLKR(totalCents)} across frequently purchased products.`;
}

export function moveHeadline(moves: HomePayload['topMoves']): string {
  if (!moves.length) return 'No significant price moves in the last 28 days.';
  const top = moves[0]!;
  return `${top.productName} ${top.pct >= 0 ? '↑' : '↓'} ${Math.abs(top.pct)}% — largest mover.`;
}

export function healthHeadline(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Healthy';
  if (score >= 40) return 'Watch';
  return 'At risk';
}

export function concentrationLabel(share: number): string {
  if (share >= 0.5) return 'High concentration risk';
  if (share >= 0.3) return 'Moderate concentration';
  return 'Diversified';
}
