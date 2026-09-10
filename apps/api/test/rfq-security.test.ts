import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../src/env', () => ({
  env: { WEB_ORIGIN: 'http://localhost:5173', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:8787', ENVIRONMENT: 'test' },
}));

// Canned RFQ domain: rfq-1 belongs to biz-A; quote-qB belongs to sup-B.
const RFQ = { id: 'rfq-1', businessId: 'biz-A', status: 'under_review', title: 'Bulk rice', rfqNumber: 'RFQ-1', isOpen: 0, awardedQuoteId: null };
const QUOTE_B = { id: 'q-B', rfqId: 'rfq-1', supplierId: 'sup-B', status: 'submitted', version: 2, totalCents: 100000, quoteNumber: 'Q-B' };

vi.mock('../src/modules/rfqs/repository', () => ({
  findRfq: vi.fn(async ( _d1: unknown, id: string) => (id === 'rfq-1' ? { ...RFQ } : null)),
  findQuote: vi.fn(async (_d1: unknown, id: string) => (id === 'q-B' ? { ...QUOTE_B } : null)),
  listRfqItems: vi.fn(async () => []),
  listRfqInvites: vi.fn(async () => []),
  listRfqEvents: vi.fn(async () => []),
  listQuotesForRfq: vi.fn(async () => []),
  listQuoteItems: vi.fn(async () => []),
  listTiersForItems: vi.fn(async () => []),
  listVersions: vi.fn(async () => []),
  listCounters: vi.fn(async () => []),
  listMessages: vi.fn(async () => []),
  messagesSince: vi.fn(async () => []),
  listDocuments: vi.fn(async () => []),
  listTemplates: vi.fn(async () => []),
  listTemplateItems: vi.fn(async () => []),
  listRfqsForBusiness: vi.fn(async () => []),
  listRfqsForSupplier: vi.fn(async () => ({ rows: [], invites: [] })),
  insertRfqEvent: vi.fn(async () => undefined),
  pageFromQuery: vi.fn(() => ({})),
}));

const awardSpy = vi.fn(async () => ({ ok: true }));
vi.mock('../src/modules/rfqs/service', () => ({
  rfqService: {
    award: (...a: unknown[]) => awardSpy(...a),
    rejectQuote: vi.fn(async () => ({ ok: true })),
  },
}));

let sessionCtx: any = null;
vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
}));

vi.mock('@vyro/db', () => ({ getDb: () => { throw new Error('no db'); } }));
vi.mock('@vyro/db/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vyro/db/schema')>()),
  rfqs: { name: 'rfqs' },
}));

import router from '../src/modules/rfqs/routes';
import { Hono } from 'hono';
import { errorEnvelope } from '../src/lib/errors';

// Same error mapping as the production app (src/index.ts onError).
const app = new Hono();
app.onError((err, c) => {
  const env = errorEnvelope(err);
  return c.json(env.body, env.status as 400);
});
app.route('/', router);

function ctxFor(userId: string, opts: { businesses?: Array<{ businessId: string; role: string }>; suppliers?: Array<{ supplierId: string; role: string }>; admin?: boolean }) {
  return {
    userId, email: `${userId}@t.example`,
    isAdmin: !!opts.admin, adminRole: opts.admin ? 'super_admin' : null,
    businesses: (opts.businesses ?? []).map((b, i) => ({ id: `m-b-${i}`, role: b.role, businessId: b.businessId })),
    suppliers: (opts.suppliers ?? []).map((s, i) => ({ id: `m-s-${i}`, role: s.role, supplierId: s.supplierId })),
  };
}

async function call(path: string, init?: RequestInit) {
  const req = new Request(`http://localhost${path}`, { method: 'GET', ...(init ?? {}) });
  return app.fetch(req, { DB: {}, NOTIFICATIONS_QUEUE: undefined } as never);
}

describe('rfq IDOR / tenancy', () => {
  beforeEach(() => { awardSpy.mockClear(); sessionCtx = null; });

  it('GET /rfqs/:id blocks another business', async () => {
    sessionCtx = ctxFor('u-evil', { businesses: [{ businessId: 'biz-B', role: 'owner' }] });
    const res = await call('/rfq-1');
    expect(res.status).toBe(403);
  });

  it('GET /rfqs/:id allows owning business', async () => {
    sessionCtx = ctxFor('u-ok', { businesses: [{ businessId: 'biz-A', role: 'owner' }] });
    const res = await call('/rfq-1');
    expect(res.status).toBe(200);
  });

  it('GET /rfqs/quotes/:id blocks competitor supplier', async () => {
    sessionCtx = ctxFor('u-c', { suppliers: [{ supplierId: 'sup-C', role: 'owner' }] });
    const res = await call('/quotes/q-B');
    expect(res.status).toBe(403);
  });

  it('GET /rfqs/quotes/:id allows owning supplier', async () => {
    sessionCtx = ctxFor('u-b', { suppliers: [{ supplierId: 'sup-B', role: 'owner' }] });
    const res = await call('/quotes/q-B');
    expect(res.status).toBe(200);
  });

  it('POST award blocks cross-business user and never reaches service', async () => {
    sessionCtx = ctxFor('u-evil', { businesses: [{ businessId: 'biz-B', role: 'owner' }] });
    const res = await call('/rfq-1/award', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId: 'q-B' }) });
    expect(res.status).toBe(403);
    expect(awardSpy).not.toHaveBeenCalled();
  });

  it('POST award by owner reaches service with version pin', async () => {
    sessionCtx = ctxFor('u-ok', { businesses: [{ businessId: 'biz-A', role: 'owner' }] });
    const res = await call('/rfq-1/award', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quoteId: 'q-B', expectedVersion: 2 }) });
    expect(res.status).toBe(200);
    expect(awardSpy).toHaveBeenCalled();
    const args = awardSpy.mock.calls[0] as unknown[];
    expect(args[3]).toBe('q-B');
    expect(args[5]).toBe(2);
  });

  it('PATCH quote by another supplier is forbidden', async () => {
    sessionCtx = ctxFor('u-c', { suppliers: [{ supplierId: 'sup-C', role: 'owner' }] });
    const res = await call('/quotes/q-B', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ description: 'x', quantity: 1, unitPriceCents: 1 }] }) });
    expect(res.status).toBe(403);
  });

  it('supplier messages require own-quote scope', async () => {
    sessionCtx = ctxFor('u-c', { suppliers: [{ supplierId: 'sup-C', role: 'owner' }] });
    const res = await call('/rfq-1/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
    // sup-C is not invited to a closed (non-open) RFQ -> 400/403 either way, never 201
    expect([400, 403, 404]).toContain(res.status);
  });
});
