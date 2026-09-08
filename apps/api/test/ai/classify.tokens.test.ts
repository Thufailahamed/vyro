import { describe, it, expect, vi } from 'vitest';
import { classify } from '../../src/modules/ai/classify';

describe('classify returns token counts', () => {
  const dict = { products: ['rice'], suppliers: ['A'] };

  it('returns tokensIn and tokensOut from provider', async () => {
    const provider = {
      chat: vi.fn().mockResolvedValue({
        content: '{"intent":"find_cheapest","slots":{"productName":"rice"},"confidence":0.9}',
        tokensIn: 42,
        tokensOut: 7,
      }),
    } as any;
    const out = await classify(provider, { businessName: 'T', businessId: 'b1', userId: 'u1', dict }, 'find rice');
    expect(out.tokensIn).toBe(42);
    expect(out.tokensOut).toBe(7);
    expect(out.result.intent).toBe('find_cheapest');
  });

  it('falls back to heuristic with zero tokens on provider error', async () => {
    const provider = { chat: vi.fn().mockRejectedValue(new Error('boom')) } as any;
    const out = await classify(provider, { businessName: 'T', businessId: 'b1', userId: 'u1', dict }, 'find rice');
    expect(out.tokensIn).toBe(0);
    expect(out.tokensOut).toBe(0);
  });

  it('falls back to heuristic with zero tokens when provider returns malformed JSON', async () => {
    const provider = {
      chat: vi.fn().mockResolvedValue({ content: '{not json', tokensIn: 1, tokensOut: 1 }),
    } as any;
    const out = await classify(provider, { businessName: 'T', businessId: 'b1', userId: 'u1', dict }, 'find rice');
    expect(out.tokensIn).toBe(0);
    expect(out.tokensOut).toBe(0);
  });

  it('treats undefined tokens as zero', async () => {
    const provider = {
      chat: vi.fn().mockResolvedValue({ content: '{"intent":"find_cheapest","slots":{"productName":"rice"},"confidence":0.9}' }),
    } as any;
    const out = await classify(provider, { businessName: 'T', businessId: 'b1', userId: 'u1', dict }, 'find rice');
    expect(out.tokensIn).toBe(0);
    expect(out.tokensOut).toBe(0);
  });
});