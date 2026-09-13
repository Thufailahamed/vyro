import type { SloRule } from '@vyro/shared';
import { queryAe } from './aeClient';

export type Verdict = {
  ok: boolean;
  value: number | null;
  rule: SloRule;
};

function compare(
  op: SloRule['comparator'],
  value: number,
  threshold: number,
): boolean {
  switch (op) {
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'eq':
      return value === threshold;
  }
}

async function runQuery(
  env: any,
  rule: SloRule,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  if (rule.query.kind === 'ae_sql') {
    const rows = await queryAe(env, rule.query.sql, fetchImpl);
    return rows[0]?.v ?? null;
  }
  if (rule.query.kind === 'd1_health') {
    try {
      const row = await env.DB.prepare('SELECT 1 as ok').first();
      return row?.ok === 1 ? 1 : 0;
    } catch {
      return 0;
    }
  }
  if (rule.query.kind === 'staleness') {
    const v = await env.ALERTS_KV.get(rule.query.key);
    if (!v) return Number.MAX_SAFE_INTEGER;
    const n = Number(v);
    return Number.isFinite(n) ? Date.now() - n : Number.MAX_SAFE_INTEGER;
  }
  // payment_lag + queue_depth: implementations added in sweep layer.
  return null;
}

export async function evaluateRule(
  env: any,
  rule: SloRule,
  fetchImpl: typeof fetch = fetch,
): Promise<Verdict> {
  let value: number | null = null;
  try {
    value = await runQuery(env, rule, fetchImpl);
  } catch {
    return { ok: true, value: null, rule };
  }
  if (value === null) {
    return { ok: true, value: null, rule };
  }
  const ok = !compare(rule.comparator, value, rule.threshold);
  return { ok, value, rule };
}