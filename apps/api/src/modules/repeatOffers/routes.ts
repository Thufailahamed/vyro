import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers } from '@vyro/db/schema';
import type { Ctx } from '../../middleware/session';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { repeatOffers } from './service';
import { REPEAT_OFFER_FLAG } from './constants';

const router = new Hono<{ Bindings: Env }>();

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

async function ensureEnabled(d1: D1Database): Promise<void> {
  if (!(await isFeatureEnabled(d1, REPEAT_OFFER_FLAG))) {
    throw httpError(404, 'NOT_FOUND', 'feature not enabled');
  }
}

router.use('*', session());
router.use('*', async (c, next) => {
  await ensureEnabled(c.env.DB);
  await next();
});

router.get('/', async (c) => {
  const businessId = c.req.query('businessId');
  if (!businessId) throw httpError(400, 'VALIDATION_ERROR', 'businessId required');
  ctxOf(c);
  const preview = await repeatOffers.previewForBuyer(c.env.DB, businessId);
  if (preview.offers.length === 0) return c.json(preview);
  const db = getDb(c.env.DB);
  const supplierIds = preview.offers.map((o) => o.supplierId);
  const supplierRows = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.id, supplierIds[0]!));
  const nameById = new Map(supplierRows.map((r) => [r.id, r.name]));
  for (const sid of supplierIds.slice(1)) {
    const row = await db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(eq(suppliers.id, sid));
    if (row[0]) nameById.set(row[0].id, row[0].name);
  }
  preview.offers = preview.offers.map((o) => ({
    ...o,
    supplierName: nameById.get(o.supplierId) ?? '',
  }));
  return c.json(preview);
});

export default router;
