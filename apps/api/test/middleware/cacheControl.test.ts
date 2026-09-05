import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { cacheControl } from '../../src/middleware/cacheControl';

describe('cacheControl', () => {
  it('sets public, max-age=3600', async () => {
    const app = new Hono();
    app.use('*', cacheControl({ public: true, maxAge: 3600 }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.fetch(new Request('http://localhost/x'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('sets immutable flag', async () => {
    const app = new Hono();
    app.use('*', cacheControl({ maxAge: 31536000, immutable: true }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.fetch(new Request('http://localhost/x'));
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
  });
});
