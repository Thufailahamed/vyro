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
});
