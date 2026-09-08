import { describe, expect, it } from 'vitest';
import { heuristicClassify } from './intents';

describe('heuristicClassify', () => {
  const dict = {
    products: ['samba rice', 'chicken', 'cooking oil'],
    suppliers: ['Supplier A', 'supplier b', 'fresh farm'],
  };

  it('detects find_cheapest with product slot', () => {
    const r = heuristicClassify('cheapest samba rice please', dict);
    expect(r.intent).toBe('find_cheapest');
    expect(r.slots.productName).toBe('samba rice');
  });

  it('detects reorder', () => {
    const r = heuristicClassify('what should i reorder this week', dict);
    expect(r.intent).toBe('reorder');
  });

  it('detects savings', () => {
    const r = heuristicClassify('where can I save money', dict);
    expect(r.intent).toBe('savings');
  });

  it('falls back to clarify when nothing matches', () => {
    const r = heuristicClassify('xyz abc 123', dict);
    expect(r.intent).toBe('clarify');
    expect(r.slots.options?.length).toBeGreaterThan(0);
  });

  it('multi-product prompts emit find_cheapest with the longest match (first pass)', () => {
    const r = heuristicClassify('cheapest rice and chicken', dict);
    expect(r.intent).toBe('find_cheapest');
    expect(['chicken']).toContain(r.slots.productName);
  });
});
