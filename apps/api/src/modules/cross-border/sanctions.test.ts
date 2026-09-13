import { describe, it, expect, vi } from 'vitest';
import { isCountrySanctioned, refreshSanctionsList } from './sanctions';
import type { Env } from '../../env';

const env = {
  CROSS_BORDER_KV: {
    get: vi.fn().mockImplementation(async (k: string) =>
      k === 'sanctions:list' ? JSON.stringify(['RU', 'IR', 'KP']) : null,
    ),
    put: vi.fn(),
  },
} as unknown as Env;

describe('isCountrySanctioned', () => {
  it('returns true for sanctioned country', async () => {
    expect(await isCountrySanctioned('RU', env)).toBe(true);
  });
  it('returns false for clean country', async () => {
    expect(await isCountrySanctioned('US', env)).toBe(false);
  });
  it('normalizes lowercase to uppercase', async () => {
    expect(await isCountrySanctioned('ru', env)).toBe(true);
  });
  it('returns false for empty input', async () => {
    expect(await isCountrySanctioned('', env)).toBe(false);
  });
});

describe('refreshSanctionsList', () => {
  it('writes fresh list to KV', async () => {
    const fetcher = vi.fn().mockResolvedValue(['RU', 'CN']);
    const count = await refreshSanctionsList(env, fetcher);
    expect(count).toBe(2);
    expect(env.CROSS_BORDER_KV.put).toHaveBeenCalledWith(
      'sanctions:list',
      JSON.stringify(['RU', 'CN']),
      expect.objectContaining({ expirationTtl: 604800 }),
    );
  });
});