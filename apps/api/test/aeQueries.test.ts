import { describe, it, expect, vi } from 'vitest';
import { queryQueueHealth, queryThroughput } from '../src/modules/admin/queues/aeQueries';

function makeEnv(): any {
  return {
    CF_ACCOUNT_ID: 'acc',
    CF_API_TOKEN: 'tok',
    METRICS: { dataset: 'vyro_metrics' },
  };
}

describe('queryQueueHealth', () => {
  it('hits Cloudflare AE SQL API and parses counts + quantiles', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { queue: 'audit', event_type: 'ack', cnt: 100, p50: 12, p95: 90 },
          { queue: 'audit', event_type: 'retry', cnt: 4 },
          { queue: 'notifications', event_type: 'ack', cnt: 50, p50: 8, p95: 40 },
          { queue: 'notifications', event_type: 'retry', cnt: 1 },
        ],
      }),
    });
    const out = await queryQueueHealth(makeEnv(), fetchImpl as any);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/accounts/acc/analytics_engine/sql'),
      expect.objectContaining({ method: 'POST' }),
    );
    const audit = out.find((q) => q.queue === 'audit')!;
    expect(audit.ackLast1h).toBe(100);
    expect(audit.errLast1h).toBe(4);
    expect(audit.p50Ms).toBe(12);
    expect(audit.p95Ms).toBe(90);
    const notif = out.find((q) => q.queue === 'notifications')!;
    expect(notif.ackLast1h).toBe(50);
    expect(notif.errLast1h).toBe(1);
    const invoices = out.find((q) => q.queue === 'invoices')!;
    expect(invoices.ackLast1h).toBe(0);
  });

  it('throws when AE response not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    await expect(queryQueueHealth(makeEnv(), fetchImpl as any)).rejects.toThrow(/AE SQL 500/);
  });
});

describe('queryThroughput', () => {
  it('returns time-bucketed counts', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { bucket: 1700000000000, queue: 'audit', cnt: 12 },
          { bucket: 1700000300000, queue: 'audit', cnt: 7 },
        ],
      }),
    });
    const out = await queryThroughput(makeEnv(), fetchImpl as any);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ queue: 'audit', acks: 12 });
    expect(out[0].ts).toBe(1700000000000);
  });
});