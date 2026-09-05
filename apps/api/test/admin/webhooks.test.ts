import { describe, expect, it, vi, beforeEach } from 'vitest';
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

vi.mock('../../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    const role = (c.get('testRole') ?? null) as AdminRole | null;
    c.set('ctx', {
      userId: 'admin-1',
      email: 'admin@x.example',
      isAdmin: role !== null,
      adminRole: role,
      businesses: [],
      suppliers: [],
    });
    await n();
  },
}));

const state = vi.hoisted(() => ({
  hooks: [] as any[],
  deliveries: [] as any[],
  audit: [] as any[],
}));

vi.mock('../../src/modules/admin/platform/webhooksRepository', () => ({
  listWebhooks: async () => state.hooks,
  getWebhook: async (_d1: any, id: string) => state.hooks.find((h) => h.id === id) ?? null,
  createWebhook: async (_d1: any, body: any) => {
    const row = { id: 'wh-1', ...body, createdAt: Date.now(), eventTypesJson: JSON.stringify(body.eventTypes) };
    state.hooks = [row, ...state.hooks];
    return row;
  },
  updateWebhook: async (_d1: any, id: string, patch: any) => {
    const before = state.hooks.find((h) => h.id === id);
    if (!before) return null;
    const after = { ...before };
    if (patch.name !== undefined) after.name = patch.name;
    if (patch.active !== undefined) after.active = patch.active ? 1 : 0;
    state.hooks = state.hooks.map((h) => (h.id === id ? after : h));
    return { before, after };
  },
  disableWebhook: async (_d1: any, id: string) => {
    const before = state.hooks.find((h) => h.id === id);
    if (!before) return null;
    const after = { ...before, active: 0 };
    state.hooks = state.hooks.map((h) => (h.id === id ? after : h));
    return after;
  },
  listDeliveries: async (_d1: any, webhookId: string) =>
    state.deliveries.filter((d) => d.webhookId === webhookId),
  getDelivery: async (_d1: any, webhookId: string, deliveryId: string) =>
    state.deliveries.find((d) => d.id === deliveryId && d.webhookId === webhookId) ?? null,
  markDelivery: async (_d1: any, deliveryId: string, status: string, responseStatus: number | null) => {
    state.deliveries = state.deliveries.map((d) =>
      d.id === deliveryId ? { ...d, status, responseStatus, attemptCount: 1 } : d,
    );
  },
}));

vi.mock('../../src/modules/admin/lib/audit', () => ({
  auditAdmin: async (opts: any) => {
    state.audit.push({ action: opts.action, target: opts.target });
  },
}));

import whRouter from '../../src/modules/admin/platform/webhooksRoutes';
import { errorEnvelope } from '../../src/lib/errors';

function buildApp(adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('testRole', adminRole);
    await next();
  });
  app.route('/api/admin/webhooks', whRouter);
  return app;
}

const env = {
  DB: {} as any,
  WEB_ORIGIN: 'x',
  ADMIN_ORIGIN: 'x',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'x',
  ENVIRONMENT: 'test',
} as any;

function reset() {
  state.hooks = [];
  state.deliveries = [
    { id: 'wd-1', webhookId: 'wh-1', eventType: 'order.created', payloadJson: '{}', status: 'failed', responseStatus: 500, responseBody: 'oops', attemptCount: 3, nextRetryAt: null, createdAt: 1000 },
  ];
  state.audit = [];
}

describe('webhooks', () => {
  beforeEach(reset);

  it('POST → super_admin 201 + audit webhook.create', async () => {
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          url: 'https://example.com/hook',
          eventTypes: ['order.created'],
          secret: 'longsecret',
        }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    expect(state.audit[0].action).toBe('webhook.create');
  });

  it('POST → ops 403', async () => {
    const res = await buildApp('ops').fetch(
      new Request('http://localhost/api/admin/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'test',
          url: 'https://example.com/hook',
          eventTypes: ['order.created'],
          secret: 'longsecret',
        }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('GET /:id/deliveries → super_admin 200', async () => {
    state.hooks = [{ id: 'wh-1', name: 't', url: 'u', eventTypesJson: '[]', secret: 's', active: 1, createdBy: 'a', createdAt: 0 }];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/webhooks/wh-1/deliveries', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.length).toBe(1);
  });

  it('POST /:id/retry/:deliveryId → super_admin 200 + audit', async () => {
    state.hooks = [{ id: 'wh-1', name: 't', url: 'u', eventTypesJson: '[]', secret: 's', active: 1, createdBy: 'a', createdAt: 0 }];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/webhooks/wh-1/retry/wd-1', { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(200);
    const retryAudit = state.audit.find((a: any) => a.action === 'webhook.retry');
    expect(retryAudit).toBeTruthy();
  });

  it('DELETE /:id → soft disable + audit', async () => {
    state.hooks = [{ id: 'wh-1', name: 't', url: 'u', eventTypesJson: '[]', secret: 's', active: 1, createdBy: 'a', createdAt: 0 }];
    const res = await buildApp('super_admin').fetch(
      new Request('http://localhost/api/admin/webhooks/wh-1', { method: 'DELETE' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(state.hooks[0].active).toBe(0);
    expect(state.audit[0].action).toBe('webhook.delete');
  });
});
