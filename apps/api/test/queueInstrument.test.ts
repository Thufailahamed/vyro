import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../src/env';

const insertCalls: Array<{ values: unknown }> = [];
const writeDataPointCalls: Array<unknown> = [];

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
  }),
}));

import { recordQueueMetric, recordQueueEvent } from '../src/lib/queueInstrument';

function makeEnv(): Env {
  return {
    METRICS: {
      writeDataPoint: (dp: unknown) => writeDataPointCalls.push(dp),
    },
    DB: {} as D1Database,
  } as unknown as Env;
}

describe('recordQueueMetric', () => {
  it('writes AE datapoint with [eventName, queue, eventType]', () => {
    insertCalls.length = 0;
    writeDataPointCalls.length = 0;
    const env = makeEnv();
    recordQueueMetric(env, 'queue.ack', 'audit', 12);
    expect(writeDataPointCalls).toHaveLength(1);
    expect(writeDataPointCalls[0]).toEqual({
      blobs: ['queue.ack', 'audit', 'ack'],
      doubles: [12],
      indexes: ['audit'],
    });
  });

  it('maps enqueue event to enqueue eventType', () => {
    insertCalls.length = 0;
    writeDataPointCalls.length = 0;
    const env = makeEnv();
    recordQueueMetric(env, 'queue.enqueue', 'notifications', 0);
    expect(writeDataPointCalls[0]).toEqual({
      blobs: ['queue.enqueue', 'notifications', 'enqueue'],
      doubles: [0],
      indexes: ['notifications'],
    });
  });

  it('no-ops when METRICS binding missing', () => {
    writeDataPointCalls.length = 0;
    const env = { METRICS: undefined } as unknown as Env;
    expect(() => recordQueueMetric(env, 'queue.ack', 'audit', 1)).not.toThrow();
    expect(writeDataPointCalls).toHaveLength(0);
  });
});

describe('recordQueueEvent', () => {
  it('inserts a queue_events row with payload + error', async () => {
    insertCalls.length = 0;
    writeDataPointCalls.length = 0;
    const env = makeEnv();
    const before = Date.now();
    await recordQueueEvent(env, 'audit', 'retry', 'msg-1', { foo: 'bar' }, 'boom', 'user-1');
    expect(insertCalls).toHaveLength(1);
    const call = insertCalls[0].values as Record<string, unknown>;
    expect(call.queue).toBe('audit');
    expect(call.event).toBe('retry');
    expect(call.msgId).toBe('msg-1');
    expect(call.error).toBe('boom');
    expect(call.actorUserId).toBe('user-1');
    expect(call.payloadJson).toContain('"foo":"bar"');
    expect(typeof call.id).toBe('string');
    expect(call.createdAt).toBeGreaterThanOrEqual(before);
  });

  it('truncates payload to 8 KB', async () => {
    insertCalls.length = 0;
    writeDataPointCalls.length = 0;
    const big = 'x'.repeat(20_000);
    await recordQueueEvent(makeEnv(), 'audit', 'manual', 'm', { big }, undefined, undefined);
    const call = insertCalls[0].values as Record<string, unknown>;
    expect((call.payloadJson as string).length).toBeLessThanOrEqual(8192);
  });

  it('swallows DB errors', async () => {
    vi.resetModules();
    vi.doMock('@vyro/db', () => ({
      getDb: () => ({
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => Promise.reject(new Error('db down')),
          }),
        }),
      }),
    }));
    const { recordQueueEvent: recordEventFresh } = await import('../src/lib/queueInstrument');
    await expect(
      recordEventFresh({} as Env, 'audit', 'manual', 'm', {}),
    ).resolves.toBeUndefined();
    vi.doUnmock('@vyro/db');
    vi.resetModules();
  });
});