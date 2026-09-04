import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Hoisted state lives in module scope but needs vi.hoisted() to be safe across vi.mock hoisting.
// Drizzle tables sometimes don't expose `.name` in the table reference passed to our mock,
// so we identify the membership lookup by call sequence instead of table identity.
const mockState = vi.hoisted(() => ({
  supplierSettingsStore: new Map<string, any>(),
  currentMember: null as { role: 'owner' | 'manager' | 'sales' | 'operations' } | null,
  whereCallCount: 0,
}));

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    select: () => ({
      from: (table: any) => ({
        where: (_cond: any) => ({
          get: async () => {
            mockState.whereCallCount += 1;
            const idx = mockState.whereCallCount;
            // Repository queries membership first, then settings. Identify by call order.
            if (idx === 1) return mockState.currentMember;
            const keys = [...mockState.supplierSettingsStore.keys()];
            if (keys.length > 0) return mockState.supplierSettingsStore.get(keys[keys.length - 1]);
            return null;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (vals: any) => ({
        onConflictDoUpdate: (_opts: any) => ({
          run: async () => {
            mockState.supplierSettingsStore.set(vals.supplierId, vals);
            return {};
          },
        }),
        run: async () => {
          mockState.supplierSettingsStore.set(vals.supplierId, vals);
          return {};
        },
      }),
    }),
  }),
}));

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    c.set('ctx', { userId: 'u-1', isAdmin: false });
    await next();
  },
}));

import supplierRouter from '../../src/modules/settings/supplier';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/suppliers', supplierRouter);
  return app;
}

function setMember(role: 'owner' | 'manager' | 'sales' | 'operations' | null) {
  mockState.currentMember = role ? { role } : null;
}

describe('settings supplier routes', () => {
  beforeEach(() => {
    mockState.supplierSettingsStore.clear();
    mockState.currentMember = null;
    mockState.whereCallCount = 0;
  });

  const env = {
    DB: {} as any,
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  } as any;

  it('non-member gets 404 (no existence leak)', async () => {
    setMember(null);
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/suppliers/sup-1/settings'), env);
    expect(res.status).toBe(404);
  });

  it('sales role gets 404 (only owner/manager allowed)', async () => {
    setMember('sales');
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/suppliers/sup-1/settings'), env);
    expect(res.status).toBe(404);
  });

  it('owner can GET and lazy-creates defaults', async () => {
    setMember('owner');
    const app = buildApp();
    const res = await app.fetch(new Request('http://localhost/api/suppliers/sup-1/settings'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.settings.supplierId).toBe('sup-1');
    expect(body.settings.payoutMethod).toBeNull();
  });

  it('manager can PATCH company fields', async () => {
    setMember('manager');
    const app = buildApp();
    const init: RequestInit = {
      method: 'PATCH',
      body: JSON.stringify({ companyName: 'Acme', defaultLeadTimeDays: 3 }),
      headers: { 'content-type': 'application/json' },
    };
    const res = await app.fetch(
      new Request('http://localhost/api/suppliers/sup-1/settings', init),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.settings.companyName).toBe('Acme');
    expect(body.settings.defaultLeadTimeDays).toBe(3);
  });

  it('rejects invalid payoutMethod (zod strict)', async () => {
    setMember('owner');
    const app = buildApp();
    const init: RequestInit = {
      method: 'PATCH',
      body: JSON.stringify({ payoutMethod: 'crypto' }),
      headers: { 'content-type': 'application/json' },
    };
    const res = await app.fetch(
      new Request('http://localhost/api/suppliers/sup-1/settings', init),
      env,
    );
    expect(res.status).toBe(400);
  });
});
