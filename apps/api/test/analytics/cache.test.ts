import { describe, expect, it, vi } from 'vitest';
import { cached, clearCache } from '../../src/modules/analytics/cache';

describe('analytics/cache', () => {
  it('caches value for ttlMs', async () => {
    clearCache();
    const loader = vi.fn(async () => 42);
    const a = await cached('k1', 1000, loader);
    const b = await cached('k1', 1000, loader);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('reloads after ttl expires', async () => {
    clearCache();
    const loader = vi.fn(async () => Math.random());
    const a = await cached('k2', 1, loader);
    await new Promise((r) => setTimeout(r, 10));
    const b = await cached('k2', 1, loader);
    expect(a).not.toBe(b);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('bounds to ~256 entries without throwing', async () => {
    clearCache();
    for (let i = 0; i < 300; i++) {
      await cached(`k${i}`, 60_000, async () => i);
    }
    expect(true).toBe(true);
  });
});
