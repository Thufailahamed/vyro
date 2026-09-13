import { describe, expect, it } from 'vitest';
import { dedupeSuppliers } from '../src/lib/dedupeSuppliers';

describe('dedupeSuppliers', () => {
  it('collapses identical trading names in the same city', () => {
    const out = dedupeSuppliers([
      { id: 'a', name: 'Final Supply Co', city: 'Colombo', verificationStatus: 'pending', activeListingsCount: 1 },
      { id: 'b', name: 'Final Supply Co', city: 'Colombo', verificationStatus: 'verified', activeListingsCount: 4 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('b');
  });

  it('keeps same-name facilities in different cities', () => {
    const out = dedupeSuppliers([
      { id: 'a', name: 'Island Mills', city: 'Colombo' },
      { id: 'b', name: 'Island Mills', city: 'Kandy' },
    ]);
    expect(out.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });
});
