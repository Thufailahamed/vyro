import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import finance from '../../src/modules/admin/finance';
import { errorEnvelope } from '../../src/lib/errors';

describe('finance admin', () => {
  it('403 for non-admin on summary', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      const e = errorEnvelope(err);
      return c.json(e.body, e.status as any);
    });
    app.use('*', async (c, next) => {
      c.set('ctx', { userId: 'u1', isAdmin: false } as any);
      await next();
    });
    app.route('/', finance);
    const res = await app.request('/summary');
    expect([401, 403]).toContain(res.status);
  });
});
