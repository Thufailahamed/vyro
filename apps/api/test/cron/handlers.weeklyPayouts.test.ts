import { describe, expect, it, vi, beforeEach } from 'vitest';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

const state = vi.hoisted(() => ({
  featureFlag: false as boolean,
  suppliers: [] as Array<{ supplierId: string }>,
  aggregates: new Map<string, { amountCents: number; feeCents: number; netCents: number; paymentCount: number }>(),
  createErrors: new Map<string, Error>(),
  payoutMethod: 'bank' as 'bank' | 'cash',
}));

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

vi.mock(setup.SRC + '/lib/featureFlags', () => ({
  isFeatureEnabled: vi.fn(async (_d1, flag) => {
    if (flag === 'PAYOUTS_CRON_ENABLED') return state.featureFlag;
    return false;
  }),
}));

vi.mock(setup.SRC + '/modules/payouts/repository', () => ({
  listSuppliersWithConfirmedPaymentsSince: vi.fn(async (_d1, _since) => state.suppliers),
  aggregatePayableForSupplier: vi.fn(async (_d1, input: { supplierId: string }) => {
    return (
      state.aggregates.get(input.supplierId) ?? {
        amountCents: 0,
        feeCents: 0,
        netCents: 0,
        paymentCount: 0,
      }
    );
  }),
  createPayout: vi.fn(async (_d1, input: { supplierId: string }) => {
    const err = state.createErrors.get(input.supplierId);
    if (err) throw err;
    return {
      id: 'payout-' + input.supplierId,
      supplierId: input.supplierId,
      amountCents: input.amountCents,
      feeCents: input.feeCents,
      netCents: input.netCents,
      currency: 'LKR',
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      method: input.method,
      status: 'pending',
      createdAt: 0,
      updatedAt: 0,
    };
  }),
}));

vi.mock(setup.SRC + '/modules/settings/supplierRepository', () => ({
  readSupplierSettingsForSystem: vi.fn(async (_d1, _supplierId) => ({
    id: 'settings-' + _supplierId,
    supplierId: _supplierId,
    payoutMethod: state.payoutMethod,
    bankAccountId: null,
    updatedAt: 0,
  })),
}));

import { handleWeeklyPayoutBatch } from '../../src/cron/handlers';

const env = { DB: {} as unknown as D1Database } as Parameters<typeof handleWeeklyPayoutBatch>[0];

describe('cron/handleWeeklyPayoutBatch', () => {
  beforeEach(() => {
    state.featureFlag = false;
    state.suppliers = [];
    state.aggregates.clear();
    state.createErrors.clear();
    state.payoutMethod = 'bank';
  });

  it('exists and is exported from cron/handlers', async () => {
    const mod = (await import('../../src/cron/handlers')) as unknown as {
      handleWeeklyPayoutBatch?: unknown;
    };
    expect(typeof mod.handleWeeklyPayoutBatch).toBe('function');
  });

  it('returns { skipped: true } when PAYOUTS_CRON_ENABLED is off', async () => {
    state.featureFlag = false;
    state.suppliers = [{ supplierId: 'sup-1' }];
    state.aggregates.set('sup-1', {
      amountCents: 5000,
      feeCents: 125,
      netCents: 4875,
      paymentCount: 3,
    });

    const result = await handleWeeklyPayoutBatch(env);

    expect(result).toEqual({ skipped: true });
  });

  it('iterates suppliers with confirmed payments and creates a payout each', async () => {
    state.featureFlag = true;
    state.suppliers = [{ supplierId: 'sup-1' }];
    state.aggregates.set('sup-1', {
      amountCents: 5000,
      feeCents: 125,
      netCents: 4875,
      paymentCount: 3,
    });

    const result = await handleWeeklyPayoutBatch(env);

    expect(result).toEqual(
      expect.objectContaining({
        processed: 1,
        errors: 0,
        perSupplier: expect.arrayContaining([
          { supplierId: 'sup-1', status: 'created' },
        ]),
      }),
    );
  });

  it('marks a duplicate (period uq) as duplicate, not error', async () => {
    state.featureFlag = true;
    state.suppliers = [{ supplierId: 'sup-dup' }];
    state.aggregates.set('sup-dup', {
      amountCents: 1000,
      feeCents: 25,
      netCents: 975,
      paymentCount: 1,
    });
    state.createErrors.set('sup-dup', new Error('UNIQUE constraint failed: payouts_period_uq'));

    const result = await handleWeeklyPayoutBatch(env);

    expect(result).toEqual(
      expect.objectContaining({
        processed: 0,
        errors: 0,
        perSupplier: expect.arrayContaining([
          { supplierId: 'sup-dup', status: 'duplicate' },
        ]),
      }),
    );
  });

  it('skips suppliers with zero payments without erroring', async () => {
    state.featureFlag = true;
    state.suppliers = [{ supplierId: 'sup-empty' }];
    state.aggregates.set('sup-empty', {
      amountCents: 0,
      feeCents: 0,
      netCents: 0,
      paymentCount: 0,
    });

    const result = await handleWeeklyPayoutBatch(env);

    expect(result).toEqual(
      expect.objectContaining({
        processed: 0,
        errors: 0,
        perSupplier: expect.arrayContaining([
          { supplierId: 'sup-empty', status: 'empty' },
        ]),
      }),
    );
  });
});
