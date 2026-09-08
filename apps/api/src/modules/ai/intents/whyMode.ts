import { buildWhyAnswer } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';

const WHY_INTENTS = new Set([
  'spend_summary',
  'product_spend',
  'supplier_spend',
  'price_changes',
  'price_watch',
  'price_anomaly',
  'spend_forecast',
  'supplier_intel',
  'procurement_health',
  'category_intel',
]);

export interface WhyEvidence { label: string; value: string }
export interface WhyCardPayload {
  question: string;
  answer: string;
  evidence: WhyEvidence[];
  recommendation: string | null;
}

function formatRs(cents: number, signed = false): string {
  const n = cents / 100;
  return `Rs. ${n.toLocaleString('en-LK', signed ? { signDisplay: 'always' } : undefined)}`;
}

/**
 * Append a why_card to a handler result when WHY mode is requested.
 * Never replaces the primary component — keeps it additive so card stack
 * still tells the original story.
 */
export async function applyWhyMode(
  ctx: IntentContext,
  result: HandlerResult,
  _repos: unknown,
): Promise<HandlerResult> {
  const slots = ctx.classify.slots as { whyRequested?: boolean };
  if (!slots.whyRequested || !WHY_INTENTS.has(ctx.classify.intent)) return result;
  const r = (result.rawSummary ?? {}) as Record<string, unknown>;

  const evidence: WhyEvidence[] = [];
  let recommendation: string | null = null;

  const totalCents = typeof r.totalCents === 'number' ? (r.totalCents as number) : undefined;
  const prevTotalCents = typeof r.prevTotalCents === 'number' ? (r.prevTotalCents as number) : undefined;
  if (totalCents !== undefined && prevTotalCents !== undefined) {
    const delta = totalCents - prevTotalCents;
    evidence.push({ label: 'Current period', value: formatRs(totalCents) });
    evidence.push({ label: 'Prior period', value: formatRs(prevTotalCents) });
    evidence.push({ label: 'Change', value: formatRs(delta, true) });
  } else if (totalCents !== undefined) {
    evidence.push({ label: 'Period total', value: formatRs(totalCents) });
  }

  const driver = r.topDriver as { productName?: string; pct?: number } | undefined;
  if (driver?.productName) {
    evidence.push({ label: 'Top driver', value: `${driver.productName} (${driver.pct ?? 0}%)` });
    recommendation = `Compare alternative suppliers for ${driver.productName}.`;
  }

  const movers = Array.isArray(r.movers) ? (r.movers as Array<{ productName?: string; pct?: number }>) : undefined;
  if (movers && movers.length > 0) {
    movers.slice(0, 3).forEach((m, i) => {
      if (m?.productName) {
        evidence.push({
          label: i === 0 ? 'Mover' : `Mover #${i + 1}`,
          value: `${m.productName}${typeof m.pct === 'number' ? ` (${m.pct}%)` : ''}`,
        });
      }
    });
  }

  const forecast = typeof r.forecastNextCents === 'number' ? (r.forecastNextCents as number) : undefined;
  if (forecast !== undefined) {
    evidence.push({ label: 'Next-period forecast', value: formatRs(forecast) });
  }

  const question =
    ctx.classify.intent === 'spend_summary' || ctx.classify.intent === 'spend_forecast'
      ? 'What drove this number?'
      : 'Why?';

  const why = buildWhyAnswer({
    question,
    intent: ctx.classify.intent,
    evidence,
    recommendation: recommendation ?? undefined,
  });

  return {
    ...result,
    components: [...result.components, { type: 'why_card', data: why as unknown as Record<string, unknown> }],
  };
}
