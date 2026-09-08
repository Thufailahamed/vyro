import { describe, expect, it, vi } from 'vitest';
import { narrate } from '../../src/modules/ai/narrate';

const ctx = { businessName: 'Acme' };

describe('narrate', () => {
  it('returns model output trimmed to 600 chars', async () => {
    const provider = { chat: vi.fn().mockResolvedValue({ content: 'A'.repeat(800), latencyMs: 1, provider: 'workersAI', model: 'm' }) };
    const s = await narrate(provider as any, ctx, { name: 'savings', ok: true, summary: '{}' });
    expect(s.length).toBeLessThanOrEqual(600);
  });

  it('falls back to deterministic summary when model throws', async () => {
    const provider = { chat: vi.fn().mockRejectedValue(new Error('down')) };
    const s = await narrate(provider as any, ctx, { name: 'find_cheapest', ok: true, summary: '3 suppliers' });
    expect(s).toMatch(/find_cheapest|suppliers/i);
  });

  it('uses NARRATE_SYSTEM as first message', async () => {
    const provider = { chat: vi.fn().mockResolvedValue({ content: 'ok', latencyMs: 1, provider: 'workersAI', model: 'm' }) };
    await narrate(provider as any, ctx, { name: 'savings', ok: true, summary: '{}' });
    const messages = provider.chat.mock.calls[0][0];
    expect(messages[0].content).toMatch(/VYRO AI/);
  });
});
