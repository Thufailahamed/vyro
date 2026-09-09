import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payouts, suppliers } from '@vyro/db/schema';
import { eq, sql } from 'drizzle-orm';
import { adminReasonBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/summary', async (c) => {
  const db = getDb(c.env.DB);
  const failed = await db
    .select({
      id: payouts.id,
      supplierId: payouts.supplierId,
      supplierName: suppliers.name,
      amountCents: payouts.amountCents,
      feeCents: payouts.feeCents,
      netCents: payouts.netCents,
      currency: payouts.currency,
      status: payouts.status,
      periodStart: payouts.periodStart,
      periodEnd: payouts.periodEnd,
      method: payouts.method,
      reference: payouts.reference,
      batchId: payouts.batchId,
      paidAt: payouts.paidAt,
      paidByUserId: payouts.paidByUserId,
      failureReason: payouts.failureReason,
      createdAt: payouts.createdAt,
      updatedAt: payouts.updatedAt,
    })
    .from(payouts)
    .leftJoin(suppliers, eq(payouts.supplierId, suppliers.id))
    .where(eq(payouts.status, 'failed'))
    .limit(50)
    .all();

  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payouts)
    .where(eq(payouts.status, 'pending'))
    .all();

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(payouts)
    .all();

  const failedAmountCents = failed.reduce((sum, p) => sum + (p.netCents ?? p.amountCents ?? 0), 0);

  return c.json({
    failedPayouts: failed,
    metrics: {
      failedCount: failed.length,
      failedAmountCents,
      pendingCount: Number(pendingRow?.count ?? 0),
      totalCount: Number(totalRow?.count ?? 0),
    },
  });
});

router.post('/payouts/:id/retry', async (c) => {
  const parsed = adminReasonBody
    .extend({ idempotencyKey: z.string().min(8).max(100) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(payouts).where(eq(payouts.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Payout not found');

  await db
    .update(payouts)
    .set({
      status: 'pending',
      failureReason: null,
      updatedAt: Date.now(),
    })
    .where(eq(payouts.id, row.id));

  await auditAdmin({
    ctx: c,
    action: 'payout.retry',
    target: { type: 'payout', id: row.id },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

const refundBody = z
  .object({
    paymentId: z.string().min(1),
    amountCents: z.number().int().positive(),
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().min(8).max(100),
  })
  .strict();

router.post('/refunds', async (c) => {
  const parsed = refundBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await auditAdmin({
    ctx: c,
    action: 'refund.issue',
    target: { type: 'payment', id: parsed.data.paymentId },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

export default router;
