import { INSIGHT_THRESHOLDS, type InsightKind } from '../modules/ai/insightThresholds';

export interface InsightInput {
  kind: InsightKind;
  summary: string;
  evidenceUrl?: string;
  payload: Record<string, unknown>;
}

interface InsightRepo {
  listActiveBusinessIds(): Promise<string[]>;
  priceChangeMovers(opts: { businessId: string; sinceMs: number }): Promise<Array<{ productName: string; from: number; to: number; pct: number }>>;
  savingsOpportunities(opts: { businessId: string; sinceMs: number }): Promise<Array<{ productName: string; savingCents: number }>>;
  concentration(opts: { businessId: string; sinceMs: number }): Promise<Array<{ supplierId: string; supplierName: string; share: number }>>;
}

interface InsightDispatcher {
  notifyAiInsight(businessId: string, insight: { kind: InsightKind; summary: string; evidenceUrl?: string }): Promise<unknown>;
  listInsightEvents(businessId: string): Promise<Array<{ payloadHash: string; kind: string }>>;
  recordInsightEvent(businessId: string, kind: string, payloadHash: string): Promise<unknown>;
}

const DAY = 24 * 60 * 60 * 1000;

async function hashPayload(obj: unknown): Promise<string> {
  const sortedKeys = Object.keys(obj as object).sort();
  const text = JSON.stringify(obj, sortedKeys);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function evaluateInsightsForBusiness(
  businessId: string,
  repos: InsightRepo,
  dispatcher: InsightDispatcher,
  now: number = Date.now(),
): Promise<InsightInput[]> {
  const seen = await dispatcher.listInsightEvents(businessId);
  const seenHashes = new Set<string>();
  for (const e of seen) seenHashes.add(`${e.kind}:${e.payloadHash}`);
  const out: InsightInput[] = [];

  // price_drop
  const movers = await repos.priceChangeMovers({ businessId, sinceMs: now - 7 * DAY });
  for (const m of movers) {
    if (m.pct > (INSIGHT_THRESHOLDS.price_drop.pct ?? -5)) continue;
    const payload = { productName: m.productName, from: m.from, to: m.to, pct: m.pct };
    const hash = await hashPayload(payload);
    if (seenHashes.has(`price_drop:${hash}`)) continue;
    out.push({ kind: 'price_drop', summary: `${m.productName} dropped ${Math.abs(m.pct)}% in 7d`, payload, evidenceUrl: '/ai' });
  }

  // savings_opportunity
  const savings = await repos.savingsOpportunities({ businessId, sinceMs: now - 30 * DAY });
  for (const s of savings) {
    if (s.savingCents < (INSIGHT_THRESHOLDS.savings_opportunity.minAmountCents ?? 500000)) continue;
    const payload = { productName: s.productName, savingCents: s.savingCents };
    const hash = await hashPayload(payload);
    if (seenHashes.has(`savings_opportunity:${hash}`)) continue;
    out.push({ kind: 'savings_opportunity', summary: `Save Rs. ${(s.savingCents / 100).toFixed(0)} on ${s.productName}`, payload, evidenceUrl: '/ai' });
  }

  // concentration_risk
  const conc = await repos.concentration({ businessId, sinceMs: now - 90 * DAY });
  for (const c of conc) {
    if (c.share < 0.6) continue;
    const payload = { supplierId: c.supplierId, share: c.share };
    const hash = await hashPayload(payload);
    if (seenHashes.has(`concentration_risk:${hash}`)) continue;
    out.push({ kind: 'concentration_risk', summary: `${c.supplierName} handles ${(c.share * 100).toFixed(0)}% of recent spend`, payload, evidenceUrl: '/ai' });
  }

  return out;
}

export async function runAiInsights(env: { DB: D1Database; NOTIFICATIONS_QUEUE?: Queue }): Promise<{ businesses: number; insights: number }> {
  const { drizzleRepos } = await import('../modules/ai/intents/drizzleRepos');
  const { notifyAiInsight, listInsightEvents, recordInsightEvent } = await import('../modules/notifications/dispatcher');
  const repos = drizzleRepos(env as never);
  const businesses = await repos.listActiveBusinessIds();
  let insights = 0;
  for (const b of businesses) {
    const list = await evaluateInsightsForBusiness(b, repos, {
      notifyAiInsight: async (biz, ins) => notifyAiInsight(env.DB, env.NOTIFICATIONS_QUEUE, biz, ins),
      listInsightEvents: async (biz) => listInsightEvents(env.DB, biz),
      recordInsightEvent: async (biz, k, h) => recordInsightEvent(env.DB, biz, k, h),
    });
    for (const i of list) {
      await notifyAiInsight(env.DB, env.NOTIFICATIONS_QUEUE, b, i);
      const hash = await hashPayload(i.payload);
      await recordInsightEvent(env.DB, b, i.kind, hash);
      insights++;
    }
  }
  return { businesses: businesses.length, insights };
}
