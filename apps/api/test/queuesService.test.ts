import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../src/env';

const getQueueEventSpy = vi.fn();
const recordQueueEventSpy = vi.fn();
const insertCalls: Array<{ values: unknown }> = [];

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    insert: () => ({
      values: (v: unknown) => ({
        onConflictDoNothing: () => {
          insertCalls.push({ values: v });
          return Promise.resolve();
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => getQueueEventSpy(),
        }),
      }),
    }),
  }),
}));

vi.mock('../src/lib/queueInstrument', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/lib/queueInstrument')>();
  return {
    ...mod,
    recordQueueEvent: (...args: unknown[]) => recordQueueEventSpy(...args),
  };
});

import {
  listEvents,
  manualEnqueue,
  retryEvent,
  retryBulk,
} from '../src/modules/admin/queues/queuesService';
import * as repo from '../src/modules/admin/queues/queuesRepository';

function makeEnv(): any {
  return {
    AUDIT_QUEUE: { send: vi.fn().mockResolvedValue({ id: 'm-a' }) },
    NOTIFICATIONS_QUEUE: { send: vi.fn().mockResolvedValue({ id: 'm-n' }) },
    INVOICES_QUEUE: { send: vi.fn().mockResolvedValue({ id: 'm-i' }) },
    DB: {},
    CF_ACCOUNT_ID: 'a',
    CF_API_TOKEN: 't',
    METRICS: { writeDataPoint: vi.fn(), dataset: 'vyro_metrics' },
  };
}

describe('listEvents', () => {
  it('forwards params to repo', async () => {
    const spy = vi.spyOn(repo, 'listQueueEvents').mockResolvedValue([]);
    const env = makeEnv();
    await listEvents(env, { queue: 'audit', limit: 10 });
    expect(spy).toHaveBeenCalledWith(expect.anything(), { queue: 'audit', limit: 10 });
  });
});

describe('manualEnqueue', () => {
  it('sends payload and writes manual event row', async () => {
    recordQueueEventSpy.mockResolvedValue(undefined);
    insertCalls.length = 0;
    const env = makeEnv();
    const out = await manualEnqueue(env, 'audit', { hello: 'world' }, 'admin-1');
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith({ hello: 'world' });
    expect(out.msgId).toBe('m-a');
    expect(out.eventId).toEqual(expect.any(String));
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.queue).toBe('audit');
    expect(v.event).toBe('manual');
    expect(v.actorUserId).toBe('admin-1');
    expect(v.payloadJson).toContain('"hello":"world"');
  });
});

describe('retryEvent', () => {
  it('reads D1 row, sends payload with edit, writes manual row', async () => {
    vi.spyOn(repo, 'getQueueEvent').mockResolvedValue({
      id: 'e1',
      queue: 'invoices',
      msgId: 'm1',
      event: 'retry',
      actorUserId: null,
      payloadJson: JSON.stringify({ uploadId: 'u' }),
      error: 'boom',
      createdAt: 1,
    });
    recordQueueEventSpy.mockResolvedValue(undefined);
    const env = makeEnv();
    const out = await retryEvent(env, 'e1', { uploadId: 'u-fixed' }, 'admin-2');
    expect(env.INVOICES_QUEUE.send).toHaveBeenCalledWith({ uploadId: 'u-fixed' });
    expect(out.newMsgId).toBe('m-i');
    expect(recordQueueEventSpy).toHaveBeenCalled();
  });

  it('uses stored payload when no edit provided', async () => {
    vi.spyOn(repo, 'getQueueEvent').mockResolvedValue({
      id: 'e1',
      queue: 'audit',
      msgId: 'm1',
      event: 'retry',
      actorUserId: null,
      payloadJson: JSON.stringify({ from: 'old' }),
      error: null,
      createdAt: 1,
    });
    recordQueueEventSpy.mockResolvedValue(undefined);
    const env = makeEnv();
    await retryEvent(env, 'e1', undefined, 'admin-2');
    expect(env.AUDIT_QUEUE.send).toHaveBeenCalledWith({ from: 'old' });
  });

  it('throws NOT_FOUND when event missing', async () => {
    vi.spyOn(repo, 'getQueueEvent').mockResolvedValue(null);
    await expect(retryEvent(makeEnv(), 'nope', undefined, 'u')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('retryBulk', () => {
  it('sends each event and reports per-id failures', async () => {
    vi.spyOn(repo, 'getQueueEvent')
      .mockResolvedValueOnce({
        id: 'a', queue: 'audit', msgId: 'm', event: 'retry',
        actorUserId: null, payloadJson: '{"x":1}', error: null, createdAt: 1,
      })
      .mockResolvedValueOnce(null);
    recordQueueEventSpy.mockResolvedValue(undefined);
    const env = makeEnv();
    const out = await retryBulk(env, ['a', 'b'], undefined, 'admin-3');
    expect(out.replayed).toBe(1);
    expect(out.failed).toEqual(['b']);
  });
});