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
});
