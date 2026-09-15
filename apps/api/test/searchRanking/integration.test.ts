import { describe, expect, it } from 'vitest';

describe('searchRanking integration surface', () => {
  it('exports computeRanking for PDP consumption', async () => {
    const mod = await import('../../src/modules/searchRanking/score');
    expect(typeof mod.computeRanking).toBe('function');
  });
});
