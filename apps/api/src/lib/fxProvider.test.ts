import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRate, FX_RATE_SCALE } from './fxProvider';
import type { Env } from '../env';

const env = {} as Env;

describe('fetchRate', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns identity rate when base === quote', async () => {
    const r = await fetchRate('LKR', 'LKR', env);
    expect(r?.rateScaled).toBe(FX_RATE_SCALE.toString());
    expect(r?.provider).toBe('CBSL');
  });

  it('returns CBSL rate on success', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ rates: { USD: 0.0033 } }), { status: 200 }),
    );
    const r = await fetchRate('LKR', 'USD', env);
    expect(r?.provider).toBe('CBSL');
    expect(r?.rateScaled).toBe('330000'); // 0.0033 * 1e8
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('falls back to exchangerate.host on CBSL failure', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rates: { LKR: 302.5 } }), { status: 200 }),
      );
    const r = await fetchRate('USD', 'LKR', env);
    expect(r?.provider).toBe('EXCHANGERATE_HOST');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns null when both providers fail', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('cbsl'))
      .mockRejectedValueOnce(new Error('exchangerate'));
    expect(await fetchRate('LKR', 'USD', env)).toBeNull();
  });

  it('returns null when CBSL response is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not json', { status: 200 }),
    );
    expect(await fetchRate('LKR', 'USD', env)).toBeNull();
  });
});