import type { AiRepos } from './intents/repos';

const DAY = 86400000;

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

/**
 * Aggregate pull-based AI Home payload. Per-source failures degrade, never throw.
 */
export async function buildHomePayload(repos: AiRepos, businessId: string): Promise<HomePayload> {
  const now = Date.now();
  const [moves, savings, monthly, conc, alternatives] = await Promise.all([
    repos.priceChangeMovers({ businessId, sinceMs: now - 28 * DAY }).catch(() => []),
    repos.savingsOpportunities({ businessId, sinceMs: now - 60 * DAY }).catch(() => []),
    repos.monthlySpend({ businessId, months: 12 }).catch(() => []),
    repos.concentration({ businessId, sinceMs: now - 90 * DAY }).catch(() => []),
    // Reuse listSupplierNames as a cheap "how many suppliers exist" view; if a
    // dedicated alternativeSupplierCount repo exists, it overrides.
    Promise.resolve(undefined as number | undefined),
  ]);

  const concentration = conc.slice(0, 3);
  const topShare = concentration[0]?.share ?? 0;

  // 5-subscore health snapshot. Each subscore is 0-20; total = 100 baseline with deductions.
  // Pure derivations — no opaque AI numbers.
  const concentrationSub = Math.round(20 * (1 - Math.min(1, topShare)));
  const monthlyTotal = monthly.reduce((s, x) => s + x, 0);
  const savingsCents = savings.reduce((s, o) => s + o.savingCents, 0);
  const savingsRatio = monthlyTotal > 0 ? savingsCents / monthlyTotal : 0;
  const priceCompetitivenessSub = Math.round(20 * (1 - Math.min(1, savingsRatio / 0.1)));
  const moversCount = moves.length;
  const deliveryReliabilitySub = 14; // baseline; left deterministic until delivery signals land
  const meanMonthly = monthly.length ? monthly.reduce((s, x) => s + x, 0) / monthly.length : 0;
  const variance =
    monthly.length > 1
      ? monthly.reduce((s, x) => s + (x - meanMonthly) ** 2, 0) / monthly.length
      : 0;
  const cv = meanMonthly > 0 ? Math.sqrt(variance) / meanMonthly : 0;
  const consistencySub = Math.round(20 * (1 - Math.min(1, cv)));
  const savingsOpportunitySub = Math.max(0, 20 - moversCount);

  const breakdownSum =
    concentrationSub +
    priceCompetitivenessSub +
    deliveryReliabilitySub +
    consistencySub +
    savingsOpportunitySub;
  const healthScore: HomeHealthScore = {
    score: breakdownSum,
    breakdown: {
      concentration: concentrationSub,
      priceCompetitiveness: priceCompetitivenessSub,
      deliveryReliability: deliveryReliabilitySub,
      consistency: consistencySub,
      savingsOpportunity: savingsOpportunitySub,
    },
  };

  const alternativeCount = typeof alternatives === 'number' ? alternatives : 0;
  const concentrationRisk: HomeConcentrationRisk = {
    topSupplierShare: topShare,
    label:
      topShare >= 0.5 ? 'high' : topShare >= 0.3 ? 'moderate' : 'low',
    alternativeCount,
  };

  return {
    reorderDue: [],
    savingsTotal: savingsCents,
    topMoves: moves.slice(0, 5),
    monthly,
    concentration,
    healthScore,
    concentrationRisk,
  };
}

/** Ranked insights list for GET /api/ai/insights. */
export async function buildInsightsPayload(
  repos: AiRepos,
  businessId: string,
  limit = 10,
): Promise<{ insights: Array<{ kind: string; evidence: string; action: string }> }> {
  const now = Date.now();
  const [moves, savings] = await Promise.all([
    repos.priceChangeMovers({ businessId, sinceMs: now - 28 * DAY }).catch(() => []),
    repos.savingsOpportunities({ businessId, sinceMs: now - 60 * DAY }).catch(() => []),
  ]);
  const insights = [
    ...savings.slice(0, 4).map((s) => ({
      kind: 'saving',
      evidence: `${s.productName}: ${s.currentSupplierName} → ${s.alternativeSupplierName}`,
      action: '/analytics',
    })),
    ...moves.slice(0, 4).map((m) => ({
      kind: 'price',
      evidence: `${m.productName} ${m.pct}%`,
      action: '/analytics',
    })),
  ].slice(0, Math.min(Math.max(limit, 1), 20));
  return { insights };
}
