import { describe, it, expect, vi } from 'vitest';
import { runObservabilitySweep } from '../../src/cron/observabilitySweep';

function makeKV() {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async put(
      k: string,
      v: string,
      opts?: { expirationTtl?: number },
    ) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
  };
}

describe('observabilitySweep', () => {
  it('runs all rules and writes status cache', async () => {
    const kv = makeKV();
    const writes: any[] = [];
    const env = {
      ALERTS_KV: kv,
      CF_ACCOUNT_ID: 'a',
      CF_API_TOKEN: 'b',
      DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
      METRICS: { writeDataPoint: (d: any) => writes.push(d) },
    } as any;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ v: 2000 }] }), {
        status: 200,
      }),
    );
    const result = await runObservabilitySweep(
      env,
      fetchMock as any,
    );
    expect(result.evaluated).toBeGreaterThan(0);
    const updated = await kv.get('status:updated_at');
    expect(updated).toBeTruthy();
  });

  it('skips rules under silence', async () => {
    const kv = makeKV();
    await kv.put(
      'silenced:api.p95_latency_ms',
      JSON.stringify({
        silencedBy: 'alice',
        reason: 'maint',
        expiresAt: Date.now() + 60_000,
      }),
    );
    const env = {
      ALERTS_KV: kv,
      CF_ACCOUNT_ID: 'a',
      CF_API_TOKEN: 'b',
      DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) },
      METRICS: { writeDataPoint: () => {} },
    } as any;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ v: 2000 }] }), {
        status: 200,
      }),
    );
    await runObservabilitySweep(env, fetchMock as any);
    const silencedBucket = Math.floor(
      Date.now() / 1000 / 1800,
    );
    const cd = await kv.get(
      `cooldown:api.p95_latency_ms:${silencedBucket}`,
    );
    expect(cd).toBeNull();
  });
});