import type { AiRepos } from './intents/repos';

const DAY = 86400000;

/** Aggregate pull-based AI Home payload. Per-source failures degrade, never throw. */
export async function buildHomePayload(repos: AiRepos, businessId: string): Promise<{
  reorderDue: unknown[];
  savingsTotal: number;
  topMoves: Array<{ productName: string; from: number; to: number; pct: number }>;
  monthly: number[];
  concentration: Array<{ supplierId: string; supplierName: string; share: number }>;
}> {
  const now = Date.now();
  const [moves, savings, monthly, conc] = await Promise.all([
    repos.priceChangeMovers({ businessId, sinceMs: now - 28 * DAY }).catch(() => []),
    repos.savingsOpportunities({ businessId, sinceMs: now - 60 * DAY }).catch(() => []),
    repos.monthlySpend({ businessId, months: 3 }).catch(() => []),
    repos.concentration({ businessId, sinceMs: now - 90 * DAY }).catch(() => []),
  ]);
  return {
    reorderDue: [],
    savingsTotal: savings.reduce((s, o) => s + o.savingCents, 0),
    topMoves: moves.slice(0, 4),
    monthly,
    concentration: conc.slice(0, 3),
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
