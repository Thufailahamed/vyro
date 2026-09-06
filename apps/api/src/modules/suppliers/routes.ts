import { Hono } from 'hono';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, supplierProducts } from '@vyro/db/schema';
import { onboardingSupplierSchema } from '@vyro/validation/supplier';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import type { Ctx } from '../../middleware/session';
import { onboardSupplier } from './service';
import { findBusinessTypeBySlug, listBusinessTypes } from '../businesses/repository';
import { findSupplierById, listMySuppliers } from './repository';

const router = new Hono<{ Bindings: Env }>();

// Public endpoint to retrieve active supplier categories/types
router.get('/types', async (c) => {
  const types = await listBusinessTypes(c.env.DB);
  return c.json({ types });
});

// List all active verified suppliers with catalog metrics
router.get('/', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      businessTypeId: suppliers.businessTypeId,
      contactPerson: suppliers.contactPerson,
      phone: suppliers.phone,
      email: suppliers.email,
      address: suppliers.address,
      city: suppliers.city,
      district: suppliers.district,
      description: suppliers.description,
      verificationStatus: suppliers.verificationStatus,
      status: suppliers.status,
    })
    .from(suppliers)
    .where(and(eq(suppliers.status, 'active'), isNull(suppliers.deletedAt)))
    .all();

  const counts = await db
    .select({
      supplierId: supplierProducts.supplierId,
      count: sql<number>`count(*)`,
    })
    .from(supplierProducts)
    .where(and(eq(supplierProducts.active, 1), isNull(supplierProducts.deletedAt)))
    .groupBy(supplierProducts.supplierId)
    .all();

  const countMap = new Map(counts.map((x) => [x.supplierId, Number(x.count)]));

  const enriched = rows.map((s) => ({
    ...s,
    activeListingsCount: countMap.get(s.id) ?? 0,
  }));

  return c.json({ suppliers: enriched });
});

const handleSupplierOnboard = async (c: any) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = onboardingSupplierSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await onboardSupplier(c.env.DB, ctx.userId, parsed.data);
  return c.json(out, 201);
};

router.post('/', session(), handleSupplierOnboard);
router.post('/onboard', session(), handleSupplierOnboard);

router.get('/me', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  return c.json({ suppliers: await listMySuppliers(c.env.DB, ctx.userId) });
});

router.get('/:id', async (c) => {
  const row = await findSupplierById(c.env.DB, c.req.param('id'));
  if (!row) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  // Strip sensitive contact info from anonymous reads. Authenticated buyers
  // see full contact details through the search/compare endpoints, which
  // enforce membership.
  const { contactPerson: _c, phone: _p, email: _e, address: _a, ...publicView } = row;
  void _c; void _p; void _e; void _a;
  return c.json({ supplier: publicView });
});

export default router;
