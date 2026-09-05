import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rateLimit } from '../../src/middleware/rateLimit';
import { errorEnvelope } from '../../src/lib/errors';
import type { Env } from '../../src/env';

const store = new Map<string, string>();
const kv: KVNamespace = {
  get: vi.fn(async (k: string) => store.get(k) ?? null),
  put: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
  delete: vi.fn(async (k: string) => { store.delete(k); }),
} as unknown as KVNamespace;

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: kv,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: { ctx?: { userId?: string } } }>();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('ctx', { userId: c.req.header('x-user-id') ?? undefined });
    await next();
  });
  app.use('*', rateLimit({ key: 'test', limit: 3, window: 60 }));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

beforeEach(() => { store.clear(); vi.clearAllMocks(); });

describe('rateLimit', () => {
  it('allows requests under the limit', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
      expect(res.status).toBe(200);
    }
  });

  it('returns 429 when limit exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
    }
    const res = await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details.retryAfter).toBe(60);
  });

  it('exposes X-RateLimit-* headers', async () => {
    const res = await buildApp().request('/test', { headers: { 'cf-connecting-ip': '1.2.3.4' } }, env);
    expect(res.headers.get('x-ratelimit-limit')).toBe('3');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('2');
  });

  it('keys on userId when authenticated', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await buildApp().request('/test', { headers: { 'x-user-id': 'u-a' } }, env);
      expect(res.status).toBe(200);
    }
    const blocked = await buildApp().request('/test', { headers: { 'x-user-id': 'u-a' } }, env);
    expect(blocked.status).toBe(429);
    const other = await buildApp().request('/test', { headers: { 'x-user-id': 'u-b' } }, env);
    expect(other.status).toBe(200);
  });

  it('separates limits by key label', async () => {
    const app = new Hono<{ Bindings: Env }>();
    app.onError((err, c) => {
      const env = errorEnvelope(err);
      return c.json(env.body, env.status as any);
    });
    app.use('/a', rateLimit({ key: 'a', limit: 2, window: 60 }));
    app.use('/b', rateLimit({ key: 'b', limit: 2, window: 60 }));
    app.get('/a', (c) => c.json({}));
    app.get('/b', (c) => c.json({}));
    for (let i = 0; i < 2; i++) await app.request('/a', { headers: { 'cf-connecting-ip': '1.1.1.1' } }, env);
    const aBlocked = await app.request('/a', { headers: { 'cf-connecting-ip': '1.1.1.1' } }, env);
    expect(aBlocked.status).toBe(429);
    const bOk = await app.request('/b', { headers: { 'cf-connecting-ip': '1.1.1.1' } }, env);
    expect(bOk.status).toBe(200);
  });
});