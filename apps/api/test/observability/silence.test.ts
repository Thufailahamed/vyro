import { describe, it, expect } from 'vitest';
import {
  isSilenced,
  silenceRule,
  unsilenceRule,
} from '../../src/observability/silence';

function makeKV() {
  const store = new Map<string, { v: string; ttl: number; at: number }>();
  return {
    async get(k: string) {
      const e = store.get(k);
      if (!e) return null;
      if (Date.now() - e.at > e.ttl * 1000) {
        store.delete(k);
        return null;
      }
      return e.v;
    },
    async put(
      k: string,
      v: string,
      opts?: { expirationTtl?: number },
    ) {
      store.set(k, { v, ttl: opts?.expirationTtl ?? 0, at: Date.now() });
    },
    async delete(k: string) {
      store.delete(k);
    },
  };
}

describe('silence', () => {
  it('isSilenced returns false when no key', async () => {
    const env = { ALERTS_KV: makeKV() } as any;
    expect(await isSilenced(env, 'api.p95')).toBe(false);
  });

  it('silenceRule then isSilenced returns entry', async () => {
    const env = { ALERTS_KV: makeKV() } as any;
    await silenceRule(env, 'api.p95', 'alice', 'maintenance', 30);
    const s = await isSilenced(env, 'api.p95');
    expect(typeof s === 'object' && s !== null).toBe(true);
    if (s) expect(s.silencedBy).toBe('alice');
  });

  it('unsilenceRule clears', async () => {
    const env = { ALERTS_KV: makeKV() } as any;
    await silenceRule(env, 'api.p95', 'alice', 'x', 30);
    await unsilenceRule(env, 'api.p95');
    expect(await isSilenced(env, 'api.p95')).toBe(false);
  });
});