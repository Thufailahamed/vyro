import { describe, expect, it, beforeEach } from 'vitest';
import { assertAiEnabled, assertPromptSafe, costCap, __resetCostCapForTests } from '../../src/modules/ai/guard';
import { HttpError } from '../../src/lib/errors';

describe('guard', () => {
  beforeEach(() => __resetCostCapForTests());

  it('assertAiEnabled throws 503 when disabled', () => {
    expect(() => assertAiEnabled({ VYRO_AI_ENABLED: 'false' } as any)).toThrow(HttpError);
  });

  it('assertAiEnabled passes when enabled', () => {
    expect(() => assertAiEnabled({ VYRO_AI_ENABLED: 'true' } as any)).not.toThrow();
  });

  it('assertPromptSafe rejects non-string', () => {
    expect(() => assertPromptSafe(123 as any)).toThrow();
  });

  it('assertPromptSafe rejects emails', () => {
    expect(() => assertPromptSafe('contact me at a@b.co')).toThrow();
  });

  it('assertPromptSafe rejects oversize', () => {
    expect(() => assertPromptSafe('x'.repeat(900))).toThrow();
  });

  it('assertPromptSafe accepts and trims normal text', () => {
    expect(assertPromptSafe('  hello  ')).toBe('hello');
  });

  it('costCap rejects after per-minute budget exhausted', () => {
    const env = { VYRO_AI_DAILY_TOKEN_CAP: '1440' } as any; // ~1 token/min
    expect(costCap(env, 'b1', 1).ok).toBe(true);
    expect(costCap(env, 'b1', 1).ok).toBe(false);
  });

  it('costCap tracks per-business independently', () => {
    const env = { VYRO_AI_DAILY_TOKEN_CAP: '1440' } as any;
    expect(costCap(env, 'b1', 1).ok).toBe(true);
    expect(costCap(env, 'b2', 1).ok).toBe(true);
  });

  it('costCap charges actual tokens accurately', () => {
    // Default budget ~8333/min (200000/24/60=138, capped to 10000). Use lower cap.
    const env = { VYRO_AI_DAILY_TOKEN_CAP: '6000' } as any; // ~4 tokens/min
    // user u1: 3 tokens consumed
    expect(costCap(env, 'b1', 3, 'u1').ok).toBe(true);
    // user u1: another 2 tokens, total 5 > 4 budget
    expect(costCap(env, 'b1', 2, 'u1').ok).toBe(false);
    // user u2 still has budget
    expect(costCap(env, 'b1', 3, 'u2').ok).toBe(true);
  });
});
