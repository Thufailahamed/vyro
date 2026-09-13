import { describe, it, expect } from 'vitest';
import {
  writeStatus,
  readStatus,
  readStatusPayload,
} from '../../src/observability/status';

function makeKV() {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async put(k: string, v: string) {
      store.set(k, v);
    },
  };
}

describe('status aggregator', () => {
  it('writes and reads component status', async () => {
    const env = { ALERTS_KV: makeKV(), VERSION: 'abc123' } as any;
    await writeStatus(env, 'api', { status: 'degraded', detail: 'slow' });
    const r = await readStatus(env, 'api');
    expect(r?.status).toBe('degraded');
    expect(r?.detail).toBe('slow');
  });

  it('readStatusPayload returns all 5 components + version', async () => {
    const env = { ALERTS_KV: makeKV(), VERSION: 'abc' } as any;
    await writeStatus(env, 'api', { status: 'operational' });
    const payload = await readStatusPayload(env, []);
    expect(Object.keys(payload.components).sort()).toEqual([
      'api',
      'cron',
      'payments',
      'queues',
      'web',
    ]);
    expect(payload.version).toBe('abc');
  });

  it('marks unknown when updatedAt older than maxAgeMs', async () => {
    const env = { ALERTS_KV: makeKV(), VERSION: 'v' } as any;
    await writeStatus(env, 'api', { status: 'operational' });
    const old = Date.now() - 60_000;
    const raw = await env.ALERTS_KV.get('status:api');
    const parsed = JSON.parse(raw!);
    parsed.updatedAt = old;
    await env.ALERTS_KV.put('status:api', JSON.stringify(parsed));
    const payload = await readStatusPayload(env, [], 30_000);
    expect(payload.components.api.status).toBe('unknown');
  });
});