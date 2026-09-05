import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { getDb } from '@vyro/db';
import { auditLogs, notifications } from '@vyro/db/schema';
import { findDisputedPo, listDisputed, setPoStatus } from './disputeRepository';

type Ctx = { userId: string };

const router = new Hono<{ Bindings: Env }>();
router.use('*', session(), requireRole({ admin: true }));

router.get('/disputes', async (c) => {
  const rows = await listDisputed(c.env.DB);
  return c.json({ disputes: rows });
});

const resolveSchema = z
  .object({
    outcome: z.enum(['refund_business', 'release_supplier']),
    note: z.string().max(500).optional(),
  })
  .strict();

router.post('/disputes/:poId/resolve', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  if (!poId) throw httpError(400, 'VALIDATION_ERROR', 'Missing poId');
  const parsed = resolveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const po = await findDisputedPo(c.env.DB, poId);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (po.status !== 'disputed') throw httpError(409, 'CONFLICT', 'PO not disputed');

  const next = parsed.data.outcome === 'refund_business' ? 'cancelled' : 'delivered';
  await setPoStatus(c.env.DB, poId, next);

  const db = getDb(c.env.DB);
  const now = Date.now();
  const counterpartyId = parsed.data.outcome === 'refund_business' ? po.supplierId : po.businessId;
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    userId: counterpartyId,
    type: 'dispute.resolved',
    title: parsed.data.outcome === 'refund_business' ? 'Order refunded' : 'Order released',
    link: `/orders/${poId}`,
    createdAt: now,
  });
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorUserId: ctx.userId,
    action: 'dispute.resolved',
    resourceType: 'purchase_order',
    resourceId: poId,
    metadata: JSON.stringify({ outcome: parsed.data.outcome, note: parsed.data.note ?? null }),
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
    createdAt: now,
  });

  return c.json({ ok: true, status: next });
});

export default router;
