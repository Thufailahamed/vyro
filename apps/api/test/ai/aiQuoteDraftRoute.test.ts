import { describe, it, expect } from 'vitest';
import { AiQuoteDraftRequestSchema } from '@vyro/ai';

describe('ai quote draft route schema validation', () => {
  it('accepts valid strategy and options', () => {
    const res = AiQuoteDraftRequestSchema.safeParse({
      strategy: 'win_deal',
      includeAlternatives: false,
    });
    expect(res.success).toBe(true);
  });

  it('rejects invalid strategy', () => {
    const res = AiQuoteDraftRequestSchema.safeParse({
      strategy: 'unknown_strategy',
    });
    expect(res.success).toBe(false);
  });
});
