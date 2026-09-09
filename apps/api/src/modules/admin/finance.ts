import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { payouts } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { adminReasonBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/summary', async (c) => {
  const db = getDb(c.env.DB);
  const failed = await db.select().from(payouts).where(eq(payouts.status, 'failed')).limit(50).all();
  return c.json({ failedPayouts: failed });
});

router.post('/payouts/:id/retry', async (c) => {
  const parsed = adminReasonBody
    .extend({ idempotencyKey: z.string().min(8).max(100) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(payouts).where(eq(payouts.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Payout not found');
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
