import { describe, it, expect, vi } from 'vitest';
import { snapshotRate, convertCents } from './fx';
import { HttpError } from '../../lib/errors';

vi.mock('../../lib/fxProvider', () => ({
  fetchRate: vi.fn(),
  FX_RATE_SCALE: 100_000_000,
}));

import { fetchRate } from '../../lib/fxProvider';

const env = {
  CROSS_BORDER_KV: {
    get: vi.fn(),
    put: vi.fn(),
  },
} as unknown as Env;

const mockDb = () => {
  const returning = vi.fn().mockResolvedValue([{ id: 'snap-1', rateScaled: '330000' }]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });
  return { db: { insert } as unknown as Db, mocks: { insert, values, returning } };
};

describe('snapshotRate', () => {
  it('writes fx_snapshots row with provider', async () => {
    vi.mocked(fetchRate).mockResolvedValue({ rateScaled: '330000', provider: 'CBSL' });
    const { db, mocks } = mockDb();
    const r = await snapshotRate('LKR', 'USD', db, env);
    expect(r.id).toBe('snap-1');
    expect(r.rateScaled).toBe('330000');
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('throws FX_UNAVAILABLE when fetchRate returns null', async () => {
    vi.mocked(fetchRate).mockResolvedValue(null);
    const { db } = mockDb();
    try {
      await snapshotRate('LKR', 'USD', db, env);
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).status).toBe(503);
      expect((e as HttpError).code).toBe('FX_UNAVAILABLE');
    }
  });
});

describe('convertCents', () => {
  it('returns same amount when same currency', async () => {
    expect(await convertCents(100000, 'LKR', 'LKR', '100000000')).toBe(100000);
  });
  it('multiplies by rate', async () => {
    // rateScaled 330000 = 0.0033, 100000 cents * 0.0033 = 330 cents
    expect(await convertCents(100000, 'LKR', 'USD', '330000')).toBe(330);
  });
  it('rounds to nearest cent', async () => {
    expect(await convertCents(333, 'LKR', 'USD', '330000')).toBe(1);
  });
});