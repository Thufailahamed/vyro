import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bulkAction } from '../../../src/modules/admin/bulk/executor';

const state = vi.hoisted(() => ({
  audited: [] as any[],
}));

vi.mock('../../../src/modules/admin/lib/audit', () => ({
  auditAdminFromDb: async (opts: any) => { state.audited.push(opts); },
}));

function env() { return { DB: {} as any } as any; }
function ctx() { return { role: 'super_admin', userId: 'u-admin' }; }

describe('bulkAction executor', () => {
  beforeEach(() => { state.audited = []; });

  it('dedupes IDs and returns ok for each', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a', 'a', 'b', 'b'],
      perItem: async () => 'ok',
    });
    expect(result.total).toBe(2);
    expect(result.succeeded).toEqual(['a', 'b']);
    expect(result.failed).toEqual([]);
  });

  it('captures thrown errors per-item with code + message', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a', 'b', 'c'],
      perItem: async (id) => {
        if (id === 'b') throw Object.assign(new Error('not found'), { code: 'NOT_FOUND', status: 404 });
        return 'ok';
      },
    });
    expect(result.succeeded).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ id: 'b', code: 'NOT_FOUND', message: 'not found' }]);
  });

  it('noop counts as neither success nor failure', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a'],
      perItem: async () => 'noop',
    });
    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('audits per-item + summary rows', async () => {
    await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['a', 'b'],
      perItem: async (id) => id === 'a' ? 'ok' : (() => { throw new Error('boom'); })(),
    });
    const summary = state.audited.find(r => r.action === 'bulk.batch');
    expect(summary).toBeTruthy();
    expect(summary.metadata).toMatchObject({ entity: 'users', action: 'suspend', total: 2, succeeded: 1, failed: 1 });
    const successRow = state.audited.find(r => r.action === 'users.suspend');
    expect(successRow).toBeTruthy();
    expect(successRow.metadata).toMatchObject({ batchId: summary.target.id });
    const failRow = state.audited.find(r => r.action === 'users.suspend.failed');
    expect(failRow).toBeTruthy();
    expect(failRow.target.id).toBe('b');
  });

  it('empty after dedupe returns empty result + summary', async () => {
    const result = await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'suspend',
      ids: ['', '', ''],
      perItem: async () => 'ok',
    });
    expect(result.total).toBe(0);
    expect(state.audited.length).toBe(1);
    expect(state.audited[0].action).toBe('bulk.batch');
  });

  it('passes extras into summary metadata', async () => {
    await bulkAction({
      env: env(), ctx: ctx(), entity: 'users', action: 'role',
      ids: ['a'],
      perItem: async () => 'ok',
      extras: { role: 'ops' },
    });
    const summary = state.audited.find(r => r.action === 'bulk.batch');
    expect(summary?.metadata).toMatchObject({ role: 'ops' });
  });
});
