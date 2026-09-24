import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notifyAdmins = vi.fn();

vi.mock('../../src/modules/notifications/dispatcher', () => ({
  notifyAdmins: (...args: unknown[]) => notifyAdmins(...args),
}));

vi.mock('@vyro/db', () => ({
  getDb: () => makeFakeDb(),
}));

import { handleRefundStuckChecker } from '../../src/cron/handlers';
import { refunds } from '@vyro/db/schema';

function makeFakeDb() {
  // matches the shape handleRefundStuckChecker uses:
  // db.select({...}).from(refunds).where(and(...)).all()
  const result = [
    { id: 'r1', paymentId: 'p1', status: 'requested' },
    { id: 'r2', paymentId: 'p2', status: 'processing' },
    { id: 'r3', paymentId: 'p3', status: 'requested' },
  ];
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    all: async () => result,
  };
  return chain;
}

describe('handleRefundStuckChecker — per-row isolation', () => {
  const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    notifyAdmins.mockReset();
    consoleErr.mockReset();
  });

  afterEach(() => {
    consoleErr.mockRestore();
  });

  it('continues notifying remaining rows when one notifyAdmins throws', async () => {
    notifyAdmins
      .mockResolvedValueOnce({ recipients: 1 })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ recipients: 1 });

    const env = { DB: {} as D1Database } as Parameters<typeof handleRefundStuckChecker>[0];
    const result = await handleRefundStuckChecker(env);

    expect(result.stuck).toBe(3);
    expect(notifyAdmins).toHaveBeenCalledTimes(3);
    expect(consoleErr).toHaveBeenCalledWith(
      '[cron] refund-stuck notify failed',
      expect.objectContaining({ refundId: 'r2' }),
    );
    // sanity: refunds schema import exists (compile-time only, kept here so the
    // import isn't tree-shaken by the bundler).
    expect(refunds).toBeDefined();
  });
});
