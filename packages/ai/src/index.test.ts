import { describe, expect, it } from 'vitest';
import { ClassifyResultSchema, INTENT_NAMES } from './index';

describe('packages/ai', () => {
  it('accepts a valid classify result', () => {
    const r = ClassifyResultSchema.parse({
      intent: 'find_cheapest',
      slots: { productName: 'samba rice', quantity: 25, unit: 'kg' },
      confidence: 0.92,
    });
    expect(r.intent).toBe('find_cheapest');
    expect(r.slots.productName).toBe('samba rice');
  });

  it('rejects unknown intent', () => {
    expect(() =>
      ClassifyResultSchema.parse({ intent: 'explode', slots: {}, confidence: 0.5 }),
    ).toThrow();
  });

  it('exposes the closed intent set', () => {
    expect(INTENT_NAMES).toContain('savings');
    expect(INTENT_NAMES).toContain('clarify');
    expect(INTENT_NAMES).not.toContain('create_order');
  });
});
