import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { securityHeaders } from '../../src/middleware/securityHeaders';
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
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', securityHeaders());
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

describe('securityHeaders', () => {
  it('sets X-Content-Type-Options to nosniff', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('sets Referrer-Policy to strict-origin-when-cross-origin', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy denying all', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('permissions-policy')).toBe(
      'camera=(), microphone=(), geolocation=(), payment=()',
    );
  });

  it('does not set HSTS in non-production', async () => {
    const res = await buildApp().request('/test', {}, env);
    expect(res.headers.get('strict-transport-security')).toBeNull();
  });

  it('sets HSTS in production with preload', async () => {
    const prodEnv = { ...env, ENVIRONMENT: 'production' as const };
    const res = await buildApp().request('/test', {}, prodEnv);
    expect(res.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    );
  });

  it('sets CSP with per-request nonce', async () => {
    const a = await buildApp().request('/test', {}, env);
    const b = await buildApp().request('/test', {}, env);
    const cspA = a.headers.get('content-security-policy')!;
    const cspB = b.headers.get('content-security-policy')!;
    expect(cspA).toContain("default-src 'self'");
    expect(cspA).toContain("frame-ancestors 'none'");
    expect(cspA).toContain('report-uri /api/csp-report');
    const nonceA = cspA.match(/'nonce-([^']+)'/)![1];
    const nonceB = cspB.match(/'nonce-([^']+)'/)![1];
    expect(nonceA).not.toBe(nonceB);
  });
});