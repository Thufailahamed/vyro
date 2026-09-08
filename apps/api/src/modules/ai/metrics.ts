import type { Env } from '../../env';

export interface AiMetricRow {
  businessId: string;
  userId: string;
  intent: string;
  provider: string;
  model: string;
  latencyMs: number;
  tokensIn?: number;
  tokensOut?: number;
  ok: boolean;
  errorCode?: string;
}

/**
 * recordAiMetric: write one Analytics Engine data point.
 * Safe to call without METRICS binding (no-op).
 * NEVER throws — observability must never break the request path.
 */
export function recordAiMetric(env: Env, row: AiMetricRow): void {
  const metrics = (env as any).METRICS;
  if (!metrics) return;
  try {
    metrics.writeDataPoint({
      blobs: [row.intent, row.provider, row.model, row.ok ? 'ok' : 'fail', row.errorCode ?? ''],
      doubles: [row.latencyMs, row.tokensIn ?? 0, row.tokensOut ?? 0],
      indexes: [row.businessId, row.userId],
    });
  } catch {
    // swallow
  }
}
