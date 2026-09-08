import type { ClassifyResult } from '../src/schemas';
import type { GoldenEntry } from './golden';

export interface ScoreReport {
  total: number;
  intentAccuracy: number;
  slotAccuracy: number;
  hallucinationRate: number;
  byIntent: Record<string, { count: number; intentHits: number; slotHits: number }>;
  failures: Array<{ prompt: string; expectedIntent: string; actualIntent: string; missingSlots: string[] }>;
}

export type ClassifyFn = (prompt: string) => Promise<ClassifyResult>;

export async function runEval(
  classify: ClassifyFn,
  entries: GoldenEntry[],
): Promise<ScoreReport> {
  let intentHits = 0;
  let slotHits = 0;
  let slotChecks = 0;
  let hallucinations = 0;
  const byIntent: ScoreReport['byIntent'] = {};
  const failures: ScoreReport['failures'] = [];

  for (const e of entries) {
    const out = await classify(e.prompt);
    const slotMap = (out.slots ?? {}) as Record<string, unknown>;
    const bi = (byIntent[e.expectedIntent] ??= { count: 0, intentHits: 0, slotHits: 0 });
    bi.count++;
    const missingSlots = e.expectedSlotKeys.length
      ? e.expectedSlotKeys.filter((k) => slotMap[k] == null)
      : [];
    const intentOk = out.intent === e.expectedIntent;
    if (intentOk) {
      intentHits++;
      bi.intentHits++;
    }
    if (!intentOk || missingSlots.length > 0) {
      failures.push({
        prompt: e.prompt,
        expectedIntent: e.expectedIntent,
        actualIntent: String(out.intent),
        missingSlots,
      });
    }
    if (e.expectedSlotKeys.length) {
      slotChecks += e.expectedSlotKeys.length;
      if (missingSlots.length === 0) {
        slotHits += e.expectedSlotKeys.length;
        bi.slotHits += e.expectedSlotKeys.length;
      }
    }
    if (e.mustNotMention && e.mustNotMention.some((s) => JSON.stringify(out).includes(s))) {
      hallucinations++;
    }
  }

  return {
    total: entries.length,
    intentAccuracy: entries.length ? intentHits / entries.length : 0,
    slotAccuracy: slotChecks ? slotHits / slotChecks : 1,
    hallucinationRate: entries.length ? hallucinations / entries.length : 0,
    byIntent,
    failures,
  };
}

export function formatMarkdown(r: ScoreReport): string {
  const pct = (n: number) => (n * 100).toFixed(1) + '%';
  const rows = Object.entries(r.byIntent)
    .sort()
    .map(([k, v]) => {
      const ia = v.count ? v.intentHits / v.count : 0;
      const sa = v.count ? v.slotHits / Math.max(v.count, 1) : 1;
      return `| ${k} | ${v.count} | ${pct(ia)} | ${pct(sa)} |`;
    })
    .join('\n');
  return `# AI Eval Report

Total prompts: ${r.total}

- Intent accuracy: ${pct(r.intentAccuracy)}
- Slot accuracy: ${pct(r.slotAccuracy)}
- Hallucination rate: ${pct(r.hallucinationRate)}

## By intent
| Intent | Count | Intent Acc | Slot Acc |
| --- | --- | --- | --- |
${rows}

## Failures
${r.failures
  .slice(0, 25)
  .map((f) => `- "${f.prompt}" → got ${f.actualIntent}${f.missingSlots.length ? ` (missing: ${f.missingSlots.join(', ')})` : ''}`)
  .join('\n') || '_none_'}
`;
}
