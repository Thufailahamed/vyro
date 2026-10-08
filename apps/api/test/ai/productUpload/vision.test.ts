import { describe, expect, it } from 'vitest';
import { runVisionProductPhoto, runVisionPriceList } from '../../../src/modules/ai/productUpload/vision';

const fakeEnv = (response: string) =>
  ({ AI: { run: async () => ({ response }) }, VYRO_AI_UPLOAD_VISION_MODEL: '@cf/test/vision' }) as any;

describe('runVisionPriceList', () => {
  it('parses rows json out of the model response', async () => {
    const env = fakeEnv('noise {"rows": [{"productName": "Rice 5kg", "priceLkr": 420}]} noise');
    const out = await runVisionPriceList(env, new Uint8Array([1, 2, 3]));
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]!.productName).toBe('Rice 5kg');
    expect(out.rows[0]!.priceLkr).toBe(420);
    expect(out.confidence).toBeGreaterThan(0);
  });
  it('returns zero rows on garbage', async () => {
    const env = fakeEnv('no json here');
    const out = await runVisionPriceList(env, new Uint8Array([1, 2, 3]));
    expect(out.rows).toEqual([]);
  });
});

describe('runVisionProductPhoto', () => {
  it('builds a priceless candidate row', async () => {
    const env = fakeEnv('{"productName": "Coconut oil 750ml", "unit": "bottle"}');
    const row = await runVisionProductPhoto(env, new Uint8Array([1, 2, 3]));
    expect(row.productName).toBe('Coconut oil 750ml');
    expect(row.priceLkr).toBeUndefined();
    expect(row.confidence).toBeGreaterThan(0);
  });
  it('surfaces a low-confidence empty row on failure', async () => {
    const env = { AI: { run: async () => { throw new Error('boom'); } } } as any;
    const row = await runVisionProductPhoto(env, new Uint8Array([9]));
    expect(row.productName).toBe('');
    expect(row.confidence).toBe(0);
  });
});
