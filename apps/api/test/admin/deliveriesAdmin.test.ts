import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import deliveriesAdmin from '../../src/modules/admin/deliveriesAdmin';
import { errorEnvelope } from '../../src/lib/errors';

describe('deliveries admin', () => {
  it('403 for non-admin', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      const e = errorEnvelope(err);
      return c.json(e.body, e.status as any);
    });
    app.use('*', async (c, next) => {
      c.set('ctx', { userId: 'u1', isAdmin: false } as any);
      await next();
    });
    app.route('/', deliveriesAdmin);
    const res = await app.request('/');
    expect([401, 403]).toContain(res.status);
  });
});
