import { describe, expect, it } from 'vitest';
import { renderTrustStats } from '../src/lib/trustStats';

describe('renderTrustStats', () => {
  it('floors sparse local GMV and district counts to marketing copy', () => {
    const cards = renderTrustStats({
      districtsCovered: 3,
      lifetimeGmvCents: 250000,
      activeSuppliers: 2,
    });
    expect(cards[0]?.metric).toBe('25');
    expect(cards[1]?.metric).toBe('Rs. 100M+');
    expect(cards[2]?.metric).toBe('100%');
  });

  it('shows live GMV once throughput crosses one million LKR', () => {
    const cards = renderTrustStats({
      districtsCovered: 25,
      lifetimeGmvCents: 150_000_000_00,
      activeSuppliers: 12,
    });
    expect(cards[1]?.metric).toBe('Rs. 150M+');
  });
});
