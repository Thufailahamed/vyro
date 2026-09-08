import { describe, it, expect } from 'vitest';
import { GOLDEN } from './golden';
import { runEval, formatMarkdown } from './scoring';

const perfectClassify = (prompt: string) => {
  const e = GOLDEN.find((g) => g.prompt === prompt);
  return Promise.resolve({
    intent: e?.expectedIntent ?? 'clarify',
    slots: Object.fromEntries((e?.expectedSlotKeys ?? []).map((k) => [k, 'x'])),
  } as any);
};

describe('scoring', () => {
  it('intent accuracy = 1 with a perfect classifier', async () => {
    const r = await runEval(perfectClassify, GOLDEN);
    expect(r.intentAccuracy).toBe(1);
    expect(r.hallucinationRate).toBe(0);
  });

  it('captures missing slots', async () => {
    const partial = (prompt: string) => {
      const e = GOLDEN.find((g) => g.prompt === prompt);
      return Promise.resolve({ intent: e?.expectedIntent ?? 'clarify', slots: {} } as any);
    };
    const r = await runEval(partial, GOLDEN);
    expect(r.slotAccuracy).toBeLessThan(1);
    expect(r.failures.some((f) => f.missingSlots.length > 0)).toBe(true);
  });

  it('emits a markdown table', async () => {
    const r = await runEval(perfectClassify, GOLDEN);
    const md = formatMarkdown(r);
    expect(md).toContain('# AI Eval Report');
    expect(md).toContain('| Intent | Count | Intent Acc | Slot Acc |');
  });

  it('golden set covers every allowed intent', () => {
    const covered = new Set(GOLDEN.map((g) => g.expectedIntent));
    expect(covered.size).toBeGreaterThanOrEqual(20);
  });
});
