import { describe, expect, it, beforeAll, vi } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { makeD1, applyMigrations } from '../../helpers/d1';

let app: Hono;
let sessionCtx: any = null;

vi.mock('../../../src/middleware/session', () => ({
  session: () => async (c: any, next: any) => {
    if (sessionCtx) c.set('ctx', sessionCtx);
    await next();
  },
  Ctx: {},
}));

const env: any = {
  DB: null,
  NOTIFICATIONS_QUEUE: undefined,
  AUDIT_QUEUE: undefined,
  INVOICES_QUEUE: undefined,
  UPLOADS_QUEUE: undefined,
  ENVIRONMENT: 'test',
  PRODUCTS: null,
};
// Track R2 puts.
const r2Puts: Array<{ key: string; bytes: Uint8Array }> = [];

const ids: Record<string, any> = {};
const b64 = (s: string) => Buffer.from(s).toString('base64');

async function post(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

async function get(path: string) {
  return app.fetch(new Request(`http://localhost${path}`), env);
}

async function patch(path: string, body: unknown) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env,
  );
}

beforeAll(async () => {
  const d1 = makeD1();
  await applyMigrations(d1);
  env.DB = d1;
  env.PRODUCTS = {
    put: async (key: string, bytes: Uint8Array) => {
      r2Puts.push({ key, bytes });
      return null;
    },
    get: async () => null,
  };

  const { errorEnvelope } = await import('../../../src/lib/errors');
  app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  const router = (await import('../../../src/modules/ai/productUpload/routes')).default;
  app.route('/api/ai/product-uploads', router);

  const { getDb } = await import('@vyro/db');
  const schema = await import('@vyro/db/schema');
  const { newId } = await import('@vyro/shared');
  const db = getDb(d1);
  const now = Date.now();
  await db.insert(schema.users).values([
    { id: 'u-sup', email: 'sup@t', passwordHash: 'x', name: 'S', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
    { id: 'u-other', email: 'other@t', passwordHash: 'x', name: 'O', phone: null, avatarUrl: null, adminRole: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null, emailVerifiedAt: null },
  ]);
  const bt = newId();
  await db.insert(schema.businessTypes).values({ id: bt, slug: 'restaurant', name: 'Restaurant', active: true });
  const biz = newId();
  await db.insert(schema.businesses).values({ id: biz, businessId: biz, name: 'B', businessTypeId: bt, contactPerson: 'B', phone: '077', email: 'b@t', address: '1', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null } as any);
  const sup = newId();
  await db.insert(schema.suppliers).values({ id: sup, name: 'S', businessTypeId: bt, contactPerson: 'S', phone: '077', email: 'su@t', address: '2', city: 'C', district: 'C', description: null, status: 'active', createdAt: now, updatedAt: now, deletedAt: null });
  await db.insert(schema.supplierMembers).values({ id: newId(), supplierId: sup, userId: 'u-sup', role: 'owner', status: 'active', createdAt: now, updatedAt: now });
  ids.biz = biz;
  ids.sup = sup;

  const cat = newId();
  await db.insert(schema.categories).values({ id: cat, name: 'Groceries', slug: `groceries-${cat}`, parentId: null, active: true });
}, 60000);

const supplierCtx = () => ({ userId: 'u-sup', isAdmin: false, adminRole: null, businesses: [], suppliers: [{ supplierId: ids.sup, role: 'owner' }] });
const otherCtx = () => ({ userId: 'u-other', isAdmin: false, adminRole: null, businesses: [], suppliers: [] });

describe('POST /api/ai/product-uploads', () => {
  it('creates a pending session and puts the file in R2', async () => {
    sessionCtx = supplierCtx();
    const res = await post('/api/ai/product-uploads', {
      supplierId: ids.sup,
      businessId: ids.biz,
      filename: 'my prices.csv',
      contentType: 'text/csv',
      base64: b64('Product Name,Price\nRice 5kg,420'),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('pending');
    expect(r2Puts).toHaveLength(1);
    expect(r2Puts[0]!.key.startsWith(`product-uploads/${ids.biz}/`)).toBe(true);
    expect(r2Puts[0]!.key.endsWith('.csv')).toBe(true);

    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const row = (await db.select().from(schema.productUploadSessions).where(eq(schema.productUploadSessions.id, body.sessionId)).get()) as any;
    expect(row.status).toBe('pending');
    expect(row.sourceKind).toBe('csv');
    ids.session = body.sessionId;
  });

  it('rejects xlsx with a re-export hint', async () => {
    sessionCtx = supplierCtx();
    const res = await post('/api/ai/product-uploads', {
      supplierId: ids.sup,
      businessId: ids.biz,
      filename: 'list.xlsx',
      contentType: 'text/csv',
      base64: b64('x,y\n1,2'),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('re-exported as CSV');
  });

  it('rejects oversized uploads', async () => {
    sessionCtx = supplierCtx();
    const res = await post('/api/ai/product-uploads', {
      supplierId: ids.sup,
      businessId: ids.biz,
      filename: 'large.csv',
      contentType: 'text/csv',
      base64: b64('x'.repeat(11_000_000)),
    });
    expect(res.status).toBe(400);
  });

  it('rejects non-members with 403', async () => {
    sessionCtx = otherCtx();
    const res = await post('/api/ai/product-uploads', {
      supplierId: ids.sup,
      businessId: ids.biz,
      filename: 'a.csv',
      contentType: 'text/csv',
      base64: b64('x,y\n1,2'),
    });
    expect(res.status).toBe(403);
  });

  it('requires a session', async () => {
    sessionCtx = null;
    const res = await post('/api/ai/product-uploads', {
      supplierId: ids.sup,
      businessId: ids.biz,
      filename: 'a.csv',
      contentType: 'text/csv',
      base64: b64('x,y\n1,2'),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/ai/product-uploads/:id', () => {
  it('returns session + staged rows for members', async () => {
    sessionCtx = supplierCtx();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const { newId } = await import('@vyro/shared');
    const db = getDb(env.DB);
    const now = Date.now();
    await db.insert(schema.productUploadRows).values([
      {
        id: newId(), sessionId: ids.session, rowIndex: 0, rawJson: '{}',
        productName: 'Rice 5kg', priceLkr: 420, confidence: 78,
        matchType: 'product', matchScore: 100, decision: 'accepted', createdAt: now, updatedAt: now,
      },
      {
        id: newId(), sessionId: ids.session, rowIndex: 1, rawJson: '{}',
        productName: 'Dhal', confidence: 30,
        matchType: 'proposal', matchScore: 10, decision: 'edited', createdAt: now, updatedAt: now,
      },
    ]);
    const res = await get(`/api/ai/product-uploads/${ids.session}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].confidence).toBe(78);
    // low-confidence row starts unconfirmed ('edited')
    expect(body.rows.find((r: any) => r.confidence === 30).decision).toBe('edited');
  });

  it('is member-gated', async () => {
    sessionCtx = otherCtx();
    const res = await get(`/api/ai/product-uploads/${ids.session}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/ai/product-uploads/:id/rows/:rowId', () => {
  it('applies decision + edited fields', async () => {
    sessionCtx = supplierCtx();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    // PATCH only works on extracted sessions — flip this one.
    await db.update(schema.productUploadSessions)
      .set({ status: 'extracted' })
      .where(eq(schema.productUploadSessions.id, ids.session));
    const rows = await db.select().from(schema.productUploadRows).all();
    const target = rows.find((r) => r.rowIndex === 1)!;
    const res = await patch(`/api/ai/product-uploads/${ids.session}/rows/${target.id}`, {
      decision: 'edited',
      edited: { priceLkr: 555, minOrderQty: 10 },
    });
    expect(res.status).toBe(200);
    const after = (await db.select().from(schema.productUploadRows).where(eq(schema.productUploadRows.id, target.id)).get()) as any;
    expect(after.priceLkr).toBe(555);
    expect(after.minOrderQty).toBe(10);
    expect(after.decision).toBe('edited');
  });

  it('validates the patch body', async () => {
    sessionCtx = supplierCtx();
    const { getDb } = await import('@vyro/db');
    const schema = await import('@vyro/db/schema');
    const db = getDb(env.DB);
    const rows = await db.select().from(schema.productUploadRows).all();
    const res = await patch(`/api/ai/product-uploads/${ids.session}/rows/${rows[0]!.id}`, {
      decision: 'accepted',
      edited: { priceLkr: -5 },
    });
    expect(res.status).toBe(400);
  });
});
