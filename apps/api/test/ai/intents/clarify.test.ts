import { describe, expect, it } from 'vitest';
import { clarifyHandler } from '../../../src/modules/ai/intents/clarify';

describe('clarifyHandler', () => {
  it('returns clarification_card with default options', async () => {
    const r = await clarifyHandler({
      env: {} as any,
      businessId: 'b1',
      userId: 'u1',
      classify: { intent: 'clarify', slots: {}, confidence: 0.5 },
    });
    expect(r.components[0].type).toBe('clarification_card');
    const data = r.components[0].data as any;
    expect(data.options.length).toBeGreaterThan(0);
    expect(data.options.length).toBeLessThanOrEqual(4);
  });

  it('uses provided question and options', async () => {
    const r = await clarifyHandler({
      env: {} as any,
      businessId: 'b1',
      userId: 'u1',
      classify: {
        intent: 'clarify',
        slots: { question: 'Which one?', options: ['A', 'B'] },
        confidence: 0.5,
      },
    });
    expect((r.components[0].data as any).question).toBe('Which one?');
    expect((r.components[0].data as any).options).toEqual(['A', 'B']);
  });
});
