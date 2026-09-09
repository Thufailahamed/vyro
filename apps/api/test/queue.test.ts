import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../src/env';

const writeDataPointCalls: unknown[] = [];

vi.mock('@vyro/db', () => ({
  getDb: () => ({ insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }) }),
}));

import { queueSend } from '../src/lib/queue';

function makeEnv(): Env {
  const send = vi.fn().mockResolvedValue(undefined);
  return {
    AUDIT_QUEUE: { send } as unknown as Queue,
    NOTIFICATIONS_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    INVOICES_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
    METRICS: { writeDataPoint: (dp: unknown) => writeDataPointCalls.push(dp) } as any,
    DB: {} as D1Database,
  } as unknown as Env;
}

describe('queueSend', () => {
  it('calls AUDIT_QUEUE.send and records metric', async () => {
    writeDataPointCalls.length = 0;
    const env = makeEnv();
    await queueSend(env, 'audit', { hello: 'world' });
    expect((env.AUDIT_QUEUE as any).send).toHaveBeenCalledWith({ hello: 'world' });
    expect(writeDataPointCalls).toHaveLength(1);
    expect(writeDataPointCalls[0]).toEqual({
      blobs: ['queue.enqueue', 'audit', 'enqueue'],
      doubles: [0],
      indexes: ['audit'],
    });
  });

  it('propagates send errors and does not record metric', async () => {
    writeDataPointCalls.length = 0;
    const env = makeEnv();
    (env.NOTIFICATIONS_QUEUE as any).send.mockRejectedValueOnce(new Error('queue down'));
    await expect(queueSend(env, 'notifications', {})).rejects.toThrow('queue down');
    expect(writeDataPointCalls).toHaveLength(0);
  });
});