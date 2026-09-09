import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import orders from '../../src/modules/admin/orders';
import { errorEnvelope } from '../../src/lib/errors';
import { adminOrderOverrideBody } from '@vyro/validation';

describe('adminOrderOverrideBody', () => {
  it('rejects missing reason', () => {
    expect(adminOrderOverrideBody.safeParse({ status: 'cancelled' }).success).toBe(false);
  });

  it('accepts valid override', () => {
    expect(
      adminOrderOverrideBody.safeParse({ status: 'cancelled', reason: 'fraud confirmed by support' }).success,
    ).toBe(true);
  });
});

describe('orders admin routes', () => {
  it('403 for non-admin on list', async () => {
    const app = new Hono();
    app.onError((err, c) => {
      const e = errorEnvelope(err);
      return c.json(e.body, e.status as any);
    });
    app.use('*', async (c, next) => {
      c.set('ctx', { userId: 'u1', isAdmin: false } as any);
      await next();
    });
    app.route('/', orders);
    const res = await app.request('/');
    expect([401, 403]).toContain(res.status);
  });
});
