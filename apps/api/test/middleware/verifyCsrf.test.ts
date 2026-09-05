import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { verifyCsrf } from '../../src/middleware/verifyCsrf';
import { errorEnvelope } from '../../src/lib/errors';
import type { Env } from '../../src/env';

const env: Env = {
  DB: {} as D1Database,
  PRODUCTS: {} as R2Bucket,
  CACHE: {} as KVNamespace,
  AUDIT_QUEUE: {} as Queue,
  NOTIFICATIONS_QUEUE: {} as Queue,
  ENVIRONMENT: 'test',
  WEB_ORIGIN: 'http://localhost:5173',
  ADMIN_ORIGIN: 'http://localhost:5174',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:8787',
};

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: { ctx?: { userId: string } } }>();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => {
    if (c.req.header('x-authenticated')) c.set('ctx', { userId: 'u-1' });
    await next();
  });
  app.use('*', verifyCsrf());
  app.get('/api/widgets', (c) => c.json({}));
  app.post('/api/widgets', (c) => c.json({ created: true }));
  app.post('/api/auth/login', (c) => c.json({ ok: true }));
  app.post('/api/auth/forgot-password', (c) => c.json({ ok: true }));
  app.post('/api/auth/reset-password', (c) => c.json({ ok: true }));
  app.post('/api/csp-report', (c) => c.body(null, 204));
  return app;
}

describe('verifyCsrf', () => {
  it('passes GET requests unconditionally', async () => {
    const res = await buildApp().request('/api/widgets', {}, env);
    expect(res.status).toBe(200);
  });

  it('passes unauthenticated POST (downstream handles 401)', async () => {
    const res = await buildApp().request('/api/widgets', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('rejects authenticated POST without Origin', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1' },
    }, env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('rejects authenticated POST with disallowed Origin', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1', origin: 'https://evil.example' },
    }, env);
    expect(res.status).toBe(403);
  });

  it('allows authenticated POST from WEB_ORIGIN', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1', origin: 'http://localhost:5173' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('allows authenticated POST from ADMIN_ORIGIN', async () => {
    const res = await buildApp().request('/api/widgets', {
      method: 'POST',
      headers: { 'x-authenticated': '1', origin: 'http://localhost:5174' },
    }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/login', async () => {
    const res = await buildApp().request('/api/auth/login', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/forgot-password', async () => {
    const res = await buildApp().request('/api/auth/forgot-password', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/auth/reset-password', async () => {
    const res = await buildApp().request('/api/auth/reset-password', { method: 'POST' }, env);
    expect(res.status).toBe(200);
  });

  it('exempts /api/csp-report', async () => {
    const res = await buildApp().request('/api/csp-report', { method: 'POST' }, env);
    expect(res.status).toBe(204);
  });
});