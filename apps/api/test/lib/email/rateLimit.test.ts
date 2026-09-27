import { describe, it, expect, beforeEach } from 'vitest';
import { checkRecipient, MAX_PER_HOUR } from '../../../src/lib/email/rateLimit';

function makeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(k: string) {
      const v = store.get(k);
      return v ?? null;
    },
    async put(k: string, v: string, _opts?: { expirationTtl?: number }) {
      store.set(k, v);
    },
    async delete(k: string) {
      store.delete(k);
    },
    _store: store,
  } as any;
}

const env = { CACHE: makeKV() } as any;

describe('email rate limit', () => {
  beforeEach(() => {
    env.CACHE._store.clear();
  });

  it('first send allowed', async () => {
    const r = await checkRecipient(env, 'user@vyro.lk');
    expect(r.allowed).toBe(true);
    expect(r.retryAfter).toBe(0);
  });

  it('blocks after MAX_PER_HOUR sends', async () => {
    for (let i = 0; i < MAX_PER_HOUR; i++) {
      await checkRecipient(env, 'user@vyro.lk');
    }
    const r = await checkRecipient(env, 'user@vyro.lk');
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it('different recipients counted separately', async () => {
    for (let i = 0; i < MAX_PER_HOUR; i++) {
      await checkRecipient(env, 'a@vyro.lk');
    }
    const r = await checkRecipient(env, 'b@vyro.lk');
    expect(r.allowed).toBe(true);
  });

  it('increments counter on each allowed send', async () => {
    await checkRecipient(env, 'c@vyro.lk');
    await checkRecipient(env, 'c@vyro.lk');
    const raw = await env.CACHE.get('rl:email:c@vyro.lk');
    expect(raw).toBe('2');
  });
});
