import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', {
      userId: 'u-seller',
      email: 's@x.example',
      isAdmin: false,
      adminRole: null,
      businesses: [],
      suppliers: [],
    });
    await n();
  },
}));

const state = vi.hoisted(() => ({
  kyc: [] as any[],
  settings: {} as Record<string, any>,
  members: [{ supplierId: 's-1', userId: 'u-seller' }],
}));

vi.mock('../src/modules/kyc/repository', () => ({
  findMemberSupplier: async (_d1: any, supplierId: string, userId: string) =>
    state.members.find((m) => m.supplierId === supplierId && m.userId === userId) ?? null,
  findMyKyc: async (_d1: any, _userId: string) => state.kyc[state.kyc.length - 1] ?? null,
}));

vi.mock('@vyro/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vyro/db')>();
  const { kycReviews, supplierSettings } = actual.schema as typeof import('@vyro/db/schema');
  const latestKyc = () => state.kyc[state.kyc.length - 1] ?? null;
  return {
    getDb: (_d1: any) => ({
      select: () => ({
        from: (table: any) => ({
          where: () => ({
            orderBy: () => ({ limit: () => ({ get: async () => latestKyc() }) }),
            get: async () => {
              if (table === supplierSettings) return state.settings['s-1'] ?? null;
              return latestKyc();
            },
          }),
        }),
      }),
      update: (table: any) => ({
        set: (patch: any) => ({
          where: () => ({
            run: async () => {
              if (table === supplierSettings) {
                state.settings['s-1'] = { ...(state.settings['s-1'] ?? {}), ...patch };
                return;
              }
              const row = latestKyc();
              if (row) Object.assign(row, patch);
            },
          }),
        }),
      }),
      insert: (table: any) => ({
        values: (vals: any) => ({
          run: async () => {
            if (table === supplierSettings) {
              state.settings[vals.supplierId] = { ...vals };
              return;
            }
            if (table === kycReviews) state.kyc.push({ ...vals });
          },
        }),
      }),
    }),
  };
});

import kycSellerRouter from '../src/modules/kyc/routes';
import { errorEnvelope } from '../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => {
    const env = errorEnvelope(err);
    return c.json(env.body, env.status as any);
  });
  app.route('/api/kyc', kycSellerRouter);
  return app;
}

const env = { DB: {} as any } as any;

function reset() {
  state.kyc = [];
  state.settings = {};
  state.members = [{ supplierId: 's-1', userId: 'u-seller' }];
}

describe('seller kyc', () => {
  beforeEach(reset);

  it('POST /submit 201 creates pending', async () => {
    const res = await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 's-1', registrationNo: 'BR-123' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.status).toBe('pending');
  });

  it('GET /my 200 returns kyc', async () => {
    await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 's-1' }),
      }),
      env,
    );
    const res = await buildApp().fetch(new Request('http://localhost/api/kyc/my'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.kyc.status).toBe('pending');
  });

  it('POST /submit twice while pending 409', async () => {
    await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 's-1' }),
      }),
      env,
    );
    const res = await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 's-1' }),
      }),
      env,
    );
    expect(res.status).toBe(409);
  });

  it('POST /submit unknown supplier 403', async () => {
    const res = await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 'nope' }),
      }),
      env,
    );
    expect(res.status).toBe(403);
  });

  it('POST /submit after rejection reopens to pending', async () => {
    await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 's-1' }),
      }),
      env,
    );
    state.kyc[state.kyc.length - 1].status = 'rejected';
    const res = await buildApp().fetch(
      new Request('http://localhost/api/kyc/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ supplierId: 's-1', registrationNo: 'BR-999' }),
      }),
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.status).toBe('pending');
  });
});
