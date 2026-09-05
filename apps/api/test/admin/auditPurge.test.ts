import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  purgeArgs: null as null | { olderThanMs: number },
  purgeResult: 0,
}));

vi.mock('../../src/modules/admin/audit/repository', () => ({
  purgeExpired: async (_d1: any, olderThanMs: number) => {
    state.purgeArgs = { olderThanMs };
    return state.purgeResult;
  },
}));

import { handleAuditPurge } from '../../src/cron/audit-purge';

describe('handleAuditPurge', () => {
  it('calls purgeExpired with 365-day retention', async () => {
    state.purgeArgs = null;
    state.purgeResult = 0;
    const env = { DB: {} as D1Database };
    const out = await handleAuditPurge(env);
    expect(state.purgeArgs?.olderThanMs).toBe(365 * 24 * 60 * 60 * 1000);
    expect(out.deleted).toBe(0);
  });

  it('returns the deletion count', async () => {
    state.purgeArgs = null;
    state.purgeResult = 42;
    const env = { DB: {} as D1Database };
    const out = await handleAuditPurge(env);
    expect(out.deleted).toBe(42);
  });

  it('retention matches 1 year', () => {
    // Sanity check: the spec calls for 1-year retention
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    expect(oneYearMs).toBe(31_536_000_000);
  });
});
