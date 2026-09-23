import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import { findDisputedPo, listDisputed } from './disputeRepository';
import { auditAdmin } from './lib/audit';
import { notifyOrderParties } from '../notifications/dispatcher';
import { NotificationType, formatLKR } from '@vyro/shared';
import { disputeResolveSchema } from '@vyro/validation/orderLifecycle';
import { refundAllForOrder, refundAmountForOrder } from '../refunds/executor';
import { releaseDrawdown } from '../credit/service';
import { applyTransition } from '../orders/lifecycle';

type Ctx = { userId: string };

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));

router.get('/disputes', async (c) => {
  const rows = await listDisputed(c.env.DB);
  return c.json({ disputes: rows });
});

router.post('/disputes/:poId/resolve', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  if (!poId) throw httpError(400, 'VALIDATION_ERROR', 'Missing poId');
  const parsed = disputeResolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { outcome, note } = parsed.data;

  const po = await findDisputedPo(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (po.status !== 'disputed') throw httpError(409, 'CONFLICT', 'PO not disputed');
  if (outcome === 'partial' && (parsed.data.amountCents ?? 0) >= po.totalCents) {
    throw httpError(400, 'VALIDATION_ERROR', 'Partial refund must be less than the order total; use refund_business');
  }

  // 1. Money first (idempotent keys make a retry after a crash safe).
  const reason = note ?? `Dispute resolved: ${outcome}`;
  let refunds: Array<{ refundId: string; status: string; amountCents: number }> = [];
  let creditReleasedCents = 0;
  if (outcome === 'refund_business') {
    refunds = await refundAllForOrder(c.env, { poId, source: 'dispute', reason, actorUserId: ctx.userId, keyPrefix: `dispute:${poId}` });
    const rel = await releaseDrawdown(c.env.DB, { poId, userId: ctx.userId, reason: 'dispute refund' });
    creditReleasedCents = rel?.releasedCents ?? 0;
  } else if (outcome === 'partial') {
    const out = await refundAmountForOrder(c.env, {
      poId,
      amountCents: parsed.data.amountCents!,
      source: 'dispute',
      reason,
      actorUserId: ctx.userId,
      keyPrefix: `dispute-partial:${poId}`,
    });
    refunds = out.refunds;
    if (out.unrefundedCents > 0) {
      const rel = await releaseDrawdown(c.env.DB, { poId, amountCents: out.unrefundedCents, userId: ctx.userId, reason: 'partial dispute refund' });
      creditReleasedCents = rel?.releasedCents ?? 0;
    }
  }

  // 2. Status through the single pipeline. Release / partial end in
  //    `completed` so the supplier's (remaining) funds become payable.
  const to = outcome === 'refund_business' ? 'cancelled' : 'completed';
  await applyTransition(c.env, {
    poId,
    to,
    actor: { role: 'admin', userId: ctx.userId },
    reason,
    metadata: { outcome, amountCents: parsed.data.amountCents ?? null, refunds, creditReleasedCents },
    opts: { disputeResolution: outcome, skipRefund: true, expectedFrom: 'disputed', via: 'dispute.resolve' },
  });

  // 3. Human-facing summary to both sides.
  try {
    const total = refunds.reduce((s, r) => s + r.amountCents, 0) + creditReleasedCents;
    const title =
      outcome === 'refund_business'
        ? 'Dispute resolved: order refunded'
        : outcome === 'partial'
          ? 'Dispute resolved: partial refund'
          : 'Dispute resolved: order released';
    const body =
      outcome === 'release_supplier'
        ? 'Admin ruled in favor of the supplier. Funds have been released.'
        : `Admin ruled ${outcome === 'partial' ? 'a partial refund' : 'in favor of the business'}: ${formatLKR(total)} is being returned to the buyer.`;
    await notifyOrderParties(
      c.env.DB,
      c.env.NOTIFICATIONS_QUEUE,
      { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
      {
        type: NotificationType.DISPUTE_RESOLVED,
        title,
        body: body + (note ? ` Note: ${note}` : ''),
        link: `/orders/${poId}`,
        audience: 'both',
      },
    );
  } catch (err) {
    console.error('[disputes.resolve] notify failed', err);
  }

  const now = Date.now();
  await getDb(c.env.DB).insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'dispute.resolved',
    resourceType: 'purchase_order',
    resourceId: poId,
    metadata: JSON.stringify({ outcome, note: note ?? null, amountCents: parsed.data.amountCents ?? null, refunds }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: now,
  });
  await auditAdmin({
    ctx: c,
    action: 'dispute.resolve',
    target: { type: 'purchase_order', id: poId },
    before: { status: 'disputed' },
    after: { status: to, outcome },
  });

  return c.json({ ok: true, status: to, refunds });
});

export default router;
