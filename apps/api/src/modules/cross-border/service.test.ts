import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preOrderCreateCheck, preOrderConfirmCheck } from './service';
import { HttpError } from '../../lib/errors';
import type { Env } from '../../env';
import type { Db } from '@vyro/db';

vi.mock('./sanctions', () => ({
  isCountrySanctioned: vi.fn(),
}));
vi.mock('./restricted', () => ({
  isProductRestricted: vi.fn(),
}));
vi.mock('./fx', () => ({
  snapshotRate: vi.fn(),
  convertCents: vi.fn(),
  getLiveRate: vi.fn(),
}));

import { isCountrySanctioned } from './sanctions';
import { isProductRestricted } from './restricted';
import { snapshotRate } from './fx';

describe('preOrderCreateCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns direction=export for SL supplier + foreign buyer', async () => {
    vi.mocked(isCountrySanctioned).mockResolvedValue(false);
    vi.mocked(isProductRestricted).mockResolvedValue({ restricted: false });
    vi.mocked(snapshotRate).mockResolvedValue({ id: 'snap-1', rateScaled: '330000' });
    const r = await preOrderCreateCheck({
      buyerCountry: 'US',
      supplierCountry: 'LK',
      hsCodes: [],
      env: {} as Env,
      db: {} as Db,
    });
    expect(r.direction).toBe('export');
    expect(r.fxSnapshotId).toBe('snap-1');
  });

  it('returns direction=import for foreign supplier + SL buyer', async () => {
    vi.mocked(isCountrySanctioned).mockResolvedValue(false);
    vi.mocked(isProductRestricted).mockResolvedValue({ restricted: false });
    vi.mocked(snapshotRate).mockResolvedValue({ id: 'snap-2', rateScaled: '330000' });
    const r = await preOrderCreateCheck({
      buyerCountry: 'LK',
      supplierCountry: 'IN',
      hsCodes: [],
      env: {} as Env,
      db: {} as Db,
    });
    expect(r.direction).toBe('import');
  });

  it('returns direction=domestic for SL supplier + SL buyer, no FX snapshot', async () => {
    vi.mocked(isCountrySanctioned).mockResolvedValue(false);
    vi.mocked(isProductRestricted).mockResolvedValue({ restricted: false });
    const r = await preOrderCreateCheck({
      buyerCountry: 'LK',
      supplierCountry: 'LK',
      hsCodes: [],
      env: {} as Env,
      db: {} as Db,
    });
    expect(r.direction).toBe('domestic');
    expect(r.fxSnapshotId).toBeNull();
    expect(snapshotRate).not.toHaveBeenCalled();
  });

  it('throws COUNTRY_SANCTIONED when buyer country is sanctioned', async () => {
    vi.mocked(isCountrySanctioned).mockImplementation(async (c) => c === 'RU');
    try {
      await preOrderCreateCheck({ buyerCountry: 'RU', supplierCountry: 'LK', hsCodes: [], env: {} as Env, db: {} as Db });
      expect.fail('expected throw');
    } catch (e) {
      expect((e as HttpError).code).toBe('COUNTRY_SANCTIONED');
    }
  });

  it('throws COUNTRY_SANCTIONED when supplier country is sanctioned', async () => {
    vi.mocked(isCountrySanctioned).mockImplementation(async (c) => c === 'IR');
    try {
      await preOrderCreateCheck({ buyerCountry: 'LK', supplierCountry: 'IR', hsCodes: [], env: {} as Env, db: {} as Db });
      expect.fail('expected throw');
    } catch (e) {
      expect((e as HttpError).code).toBe('COUNTRY_SANCTIONED');
    }
  });

  it('throws PRODUCT_RESTRICTED', async () => {
    vi.mocked(isCountrySanctioned).mockResolvedValue(false);
    vi.mocked(isProductRestricted).mockResolvedValue({ restricted: true, reason: 'arms' });
    try {
      await preOrderCreateCheck({
        buyerCountry: 'US',
        supplierCountry: 'LK',
        hsCodes: ['9301'],
        env: {} as Env,
        db: {} as Db,
      });
      expect.fail('expected throw');
    } catch (e) {
      expect((e as HttpError).code).toBe('PRODUCT_RESTRICTED');
    }
  });
});

describe('preOrderConfirmCheck', () => {
  it('passes when shipping cost present for CIF', async () => {
    await expect(preOrderConfirmCheck({ incoterms: 'CIF', declaredShippingCostCents: 5000 })).resolves.toBeUndefined();
  });

  it('throws INVALID_INCOTERMS when CIF missing shipping cost', async () => {
    try {
      await preOrderConfirmCheck({ incoterms: 'CIF', declaredShippingCostCents: null });
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).code).toBe('INVALID_INCOTERMS');
    }
  });

  it('passes EXW without shipping cost', async () => {
    await expect(preOrderConfirmCheck({ incoterms: 'EXW', declaredShippingCostCents: null })).resolves.toBeUndefined();
  });
});