import { describe, it, expect } from 'vitest';
import {
  checkCooldown,
  markFired,
} from '../../src/observability/cooldown';

function makeKV() {
  const store = new Map<string, { value: string; ttl: number; at: number }>();
  return {
    async get(key: string) {
      const e = store.get(key);
      if (!e) return null;
      if (Date.now() - e.at > e.ttl * 1000) {
        store.delete(key);
        return null;
      }
      return e.value;
    },
    async put(
      key: string,
      value: string,
      opts?: { expirationTtl?: number },
    ) {
      store.set(key, {
        value,
        ttl: opts?.expirationTtl ?? 0,
        at: Date.now(),
      });
    },
  };
}

describe('cooldown', () => {
  it('returns active=true when key exists', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    await markFired(env, 'api.p95', 'warning', 2000, 1800);
    const r = await checkCooldown(env, 'api.p95', 1800);
    expect(r.active).toBe(true);
    expect(r.severity).toBe('warning');
  });

  it('returns active=false when key absent', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    const r = await checkCooldown(env, 'missing', 1800);
    expect(r.active).toBe(false);
  });

  it('critical severity escalation overrides existing warning', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    await markFired(env, 'api.p95', 'warning', 2000, 1800);
    const r = await checkCooldown(
      env,
      'api.p95',
      1800,
      'critical',
    );
    expect(r.active).toBe(false);
  });

  it('key namespace uses rule + cooldown bucket', async () => {
    const kv = makeKV();
    const env = { ALERTS_KV: kv } as any;
    await markFired(env, 'api.p95', 'warning', 2000, 1800);
    const r1 = await checkCooldown(env, 'api.p95', 1800);
    expect(r1.active).toBe(true);
    expect(r1.windowBucket).toBeGreaterThan(0);
  });
});