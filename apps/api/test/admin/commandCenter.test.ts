import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import commandCenter from '../../src/modules/admin/commandCenter';
import { errorEnvelope } from '../../src/lib/errors';

describe('GET /command-center', () => {
  it('requires admin (403 for non-admin)', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      const e = errorEnvelope(err);
      return c.json(e.body, e.status as any);
    });
    app.use('*', async (c, next) => {
      c.set('ctx', { userId: 'u1', isAdmin: false } as any);
      await next();
    });
    app.route('/', commandCenter);
    const res = await app.request('/');
    expect([401, 403]).toContain(res.status);
  });
});
