import { describe, expect, it, vi } from 'vitest';
import { classify } from '../../src/modules/ai/classify';

describe('classify', () => {
  const ctx = { businessName: 'Acme', dict: { products: ['samba rice'], suppliers: [] } };

  it('parses valid model JSON', async () => {
    const provider = { chat: vi.fn().mockResolvedValue({ content: '{"intent":"find_cheapest","slots":{"productName":"samba rice","quantity":25,"unit":"kg"},"confidence":0.9}', latencyMs: 10, provider: 'workersAI', model: 'm' }) };
    const r = await classify(provider as any, ctx, 'cheapest samba rice');
    expect(r.intent).toBe('find_cheapest');
    expect(r.slots.productName).toBe('samba rice');
  });

  it('falls back to heuristic when model returns invalid JSON', async () => {
    const provider = { chat: vi.fn().mockResolvedValue({ content: 'not json', latencyMs: 1, provider: 'workersAI', model: 'm' }) };
    const r = await classify(provider as any, ctx, 'cheapest samba rice');
    expect(r.intent).toBe('find_cheapest');
    expect(r.slots.productName).toBe('samba rice');
  });

  it('falls back to heuristic when provider throws', async () => {
    const provider = { chat: vi.fn().mockRejectedValue(new Error('down')) };
    const r = await classify(provider as any, ctx, 'reorder');
    expect(r.intent).toBe('reorder');
  });

  it('caps prompt length defensively', async () => {
    const provider = { chat: vi.fn() };
    await classify(provider as any, ctx, 'x'.repeat(900));
    expect(provider.chat).toHaveBeenCalled();
    const sysMsg = provider.chat.mock.calls[0][0][0].content;
    expect(sysMsg.length).toBeLessThan(2000);
  });
});
