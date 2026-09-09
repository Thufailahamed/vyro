// apps/api/test/admin/kycDocuments.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { AdminRole } from '@vyro/auth';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

import kycRouter from '../../src/modules/admin/trustSafety/kycRoutes';
import documentsAdmin from '../../src/modules/admin/trustSafety/documentsAdmin';
import { errorEnvelope } from '../../src/lib/errors';

function appWith(router: any, adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('ctx', {
      userId: 'u1',
      email: 'a@x.example',
      isAdmin: adminRole !== null,
      adminRole,
      businesses: [],
      suppliers: [],
    } as any);
    await next();
  });
  app.route('/', router);
  return app;
}

describe('kyc case documents', () => {
  it('403 without kyc:read on documents list', async () => {
    const res = await appWith(kycRouter, null).request('/some-id/documents');
    expect([401, 403]).toContain(res.status);
  });

  it('403 without kyc:read on preview', async () => {
    const res = await appWith(documentsAdmin, null).request('/some-id/preview');
    expect([401, 403]).toContain(res.status);
  });
});
