import { describe, expect, it } from 'vitest';
import { mockRepos, aiEnvFixture } from './aiFixture';

describe('aiFixture', () => {
  it('returns mock repos', async () => {
    const r = mockRepos({ products: [], offers: [] });
    expect(await r.listProductNames()).toEqual([]);
  });
  it('returns env shape', () => {
    expect(aiEnvFixture().VYRO_AI_ENABLED).toBe('true');
  });
});
