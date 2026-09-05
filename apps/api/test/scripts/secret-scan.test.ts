import { describe, it, expect } from 'vitest';
import { scanSecrets } from '../../src/scripts/secret-scan';

describe('scanSecrets', () => {
  it('returns hits list', async () => {
    const result = await scanSecrets();
    expect(Array.isArray(result.hits)).toBe(true);
  });

  it('passes against current codebase (wrangler.toml is exempt)', async () => {
    const result = await scanSecrets();
    if (result.hits.length > 0) {
      console.warn(`Secret hits: ${JSON.stringify(result.hits, null, 2)}`);
    }
    expect(result.hits.length).toBe(0);
  });
});