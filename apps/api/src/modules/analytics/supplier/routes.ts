import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import type { Ctx } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { supplierAnalyticsQuery } from '@vyro/validation/analytics';
import { cached } from '../cache';
import {
  computeSupplierAnalytics,
  ensureSupplierMember,
  type AnalyticsRange,
} from '../repo/supplier';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function dayBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

router.get('/', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = supplierAnalyticsQuery.safeParse(c.req.query());
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const range = (parsed.data.range ?? '30d') as AnalyticsRange;
  let supplierId = parsed.data.supplierId;
  if (!supplierId) {
    const first = ctx.suppliers?.[0]?.id;
    if (!first) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
    supplierId = first;
  }
  try {
    await ensureSupplierMember(c.env.DB, supplierId, ctx.userId, ctx.isAdmin);
  } catch {
    throw httpError(403, 'FORBIDDEN', 'Supplier membership required');
  }
  const key = `supplier:${supplierId}:${range}:${dayBucket()}`;
  const data = await cached(key, 60_000, () =>
    computeSupplierAnalytics(c.env.DB, supplierId, range),
  );
  return c.json(data);
});

export default router;
