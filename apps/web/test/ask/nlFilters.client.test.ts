import { describe, it, expect } from 'vitest';
import { buildSearchChips } from '../../src/ask/nlFilters.client';

describe('buildSearchChips', () => {
  it('returns no chips for plain text', () => {
    const { chips } = buildSearchChips('samba rice');
    expect(chips).toEqual([]);
  });

  it('emits a price chip when "under Rs. N" present', () => {
    const { chips } = buildSearchChips('samba rice under Rs. 1200');
    expect(chips).toHaveLength(1);
    expect(chips[0].kind).toBe('price');
    expect(chips[0].label).toContain('1,200');
  });

  it('emits lead chip for "today" / "tomorrow" / "in N days"', () => {
    expect(buildSearchChips('flour tomorrow').chips[0]?.kind).toBe('lead');
    expect(buildSearchChips('cement today').chips[0]?.kind).toBe('lead');
    expect(buildSearchChips('oil in 3 days').chips[0]?.kind).toBe('lead');
  });

  it('emits sort chip for cheap/fast', () => {
    expect(buildSearchChips('sugar cheap').chips[0]?.kind).toBe('sort');
    expect(buildSearchChips('tea fast').chips[0]?.kind).toBe('sort');
  });

  it('emits supplier chip for "from X"', () => {
    const { chips } = buildSearchChips('rice from Ceylon Mills');
    expect(chips[0]?.kind).toBe('supplier');
    expect(chips[0]?.label).toContain('Ceylon Mills');
  });

  it('rebuilt() drops the chip source phrase and returns new q', () => {
    const q = 'samba rice under Rs. 1200';
    const { chips, rebuilt } = buildSearchChips(q);
    const next = rebuilt(chips[0]!);
    expect(next.toLowerCase()).not.toContain('under');
    expect(next.toLowerCase()).toContain('samba rice');
  });
});
