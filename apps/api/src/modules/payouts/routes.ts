import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import {
  payoutMarkPaidSchema,
  payoutMarkFailedSchema,
} from '@vyro/validation/payment';
import { recordAudit } from '../supplierProducts/repository';
import { writeLedgerEntry } from '../ledger';
import { isSupplierMember } from '../payments/membership';
import { getOrCreateSupplierSettings } from '../settings/supplierRepository';
import {
  aggregatePayableForSupplier,
  createPayout,
  findPayout,
  listAllPayouts,
  listPayoutsForSupplier,
  updatePayoutStatus,
} from './repository';

const router = new Hono<{ Bindings: Env }>();

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  if (!(await isSupplierMember(c.env.DB, supplierId, ctx.userId)) && !ctx.isAdmin) {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const cursorRaw = c.req.query('cursor');
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  const status = c.req.query('status');
  const items = await listPayoutsForSupplier(c.env.DB, supplierId, cursor, status);
  return c.json({ items });
});

router.get('/all', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only');
  const cursorRaw = c.req.query('cursor');
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  const status = c.req.query('status');
  const items = await listAllPayouts(c.env.DB, cursor, status);
  return c.json({ items });
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const payout = await findPayout(c.env.DB, c.req.param('id'));
  if (!payout) throw httpError(404, 'NOT_FOUND', 'Payout not found');
  if (!ctx.isAdmin && !(await isSupplierMember(c.env.DB, payout.supplierId, ctx.userId))) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  return c.json({ payout });
});

export default router;
