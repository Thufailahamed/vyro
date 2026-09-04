import { describe, it, expect } from 'vitest';
import app from '../src/index';
import type { Env } from '../src/env';

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

describe('health', () => {
  it('returns ok', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects disallowed origin with no CORS headers', async () => {
    const res = await app.request(
      '/api/health',
      { headers: { origin: 'https://evil.example' } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('handles OPTIONS preflight for allowed origin', async () => {
    const res = await app.request(
      '/api/health',
      {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'GET',
        },
      },
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('attaches a request id', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
