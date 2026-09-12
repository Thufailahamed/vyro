import { Hono } from 'hono';
import { session, type Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { requireBusinessRole } from '@vyro/auth';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { ReconciliationRequestSchema, ReconciliationClaimRequestSchema } from '@vyro/ai';
import { runThreeWayReconciliation, submitReconciliationClaim } from './reconciliationService';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();
const B_ROLES = ['owner', 'manager', 'purchasing', 'accountant'] as const;

router.post('/:id/reconciliation', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  if (!ctx.isAdmin) {
    requireBusinessRole(ctx, po.businessId, B_ROLES);
  }

  const rawBody = await c.req.json().catch(() => ({}));
  const parsed = ReconciliationRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
  }

  const reconciliation = await runThreeWayReconciliation(c.env, po.id, parsed.data);
  return c.json({ reconciliation });
});

router.post('/:id/reconciliation/claim', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('id'))).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'Purchase order not found');

  if (!ctx.isAdmin) {
    requireBusinessRole(ctx, po.businessId, B_ROLES);
  }

  const rawBody = await c.req.json().catch(() => null);
  const parsed = ReconciliationClaimRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid claim request body', parsed.error.flatten());
  }

  const res = await submitReconciliationClaim(c.env, ctx.userId, po.id, parsed.data);
  return c.json(res, 201);
});

export default router;
