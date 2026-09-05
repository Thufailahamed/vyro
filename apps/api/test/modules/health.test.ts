import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import healthRouter from '../../src/modules/health/routes';

function app() {
  const a = new Hono();
  a.route('/api/health', healthRouter);
  return a;
}

describe('GET /api/health', () => {
  it('ok=true when DB ping returns 1', async () => {
    const env = { DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.db).toBe('ok');
    expect(typeof body.ts).toBe('string');
  });

  it('ok=false, db=down when DB throws', async () => {
    const env = { DB: { prepare: () => ({ first: async () => { throw new Error('boom'); } }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    expect(res.status).toBe(503);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.db).toBe('down');
  });

  it('includes version from env', async () => {
    const env = { VERSION: 'abc123', DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    const body = (await res.json()) as any;
    expect(body.version).toBe('abc123');
  });

  it('reports ready=true when DB ok', async () => {
    const env = { DB: { prepare: () => ({ first: async () => ({ ok: 1 }) }) } } as any;
    const res = await app().fetch(new Request('http://localhost/api/health'), env);
    const body = (await res.json()) as any;
    expect(body.ready).toBe(true);
  });
});

describe('GET /api/health/version', () => {
  it('returns version + env + deployedAt', async () => {
    const env = { VERSION: 'deadbeef', ENVIRONMENT: 'production', DEPLOYED_AT: '2026-09-05T00:00:00Z' } as any;
    const res = await app().fetch(new Request('http://localhost/api/health/version'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.version).toBe('deadbeef');
    expect(body.env).toBe('production');
    expect(body.deployedAt).toBe('2026-09-05T00:00:00Z');
  });

  it('defaults version to dev when unset', async () => {
    const env = { ENVIRONMENT: 'test' } as any;
    const res = await app().fetch(new Request('http://localhost/api/health/version'), env);
    const body = (await res.json()) as any;
    expect(body.version).toBe('dev');
    expect(body.deployedAt).toBeNull();
  });
});
