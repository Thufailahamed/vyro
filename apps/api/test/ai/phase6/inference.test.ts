import { describe, it, expect } from 'vitest';
import { inferPreferences } from '../../../src/modules/ai/inference';

describe('inferPreferences', () => {
  it('drops signals below MIN_OCCURRENCES', () => {
    const out = inferPreferences([{ kind: 'preferred_supplier', key: 'sup-1', occurrences: 2 }]);
    expect(out).toEqual([]);
  });

  it('rises confidence with occurrences', () => {
    const out = inferPreferences([{ kind: 'preferred_supplier', key: 'sup-1', occurrences: 7 }]);
    expect(out[0]?.confidence).toBeCloseTo(0.85, 2);
  });

  it('caps confidence at 1.0', () => {
    const out = inferPreferences([{ kind: 'frequently_ordered', key: 'rice', occurrences: 100 }]);
    expect(out[0]?.confidence).toBe(1);
  });
});
