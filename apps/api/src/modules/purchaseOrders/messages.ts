import { Hono } from 'hono';
import { z } from 'zod';
import { and, eq, asc, gt, isNull, ne } from 'drizzle-orm';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { getDb } from '@vyro/db';
import {
  poMessages,
  purchaseOrders,
  businesses,
  suppliers,
  businessMembers,
  supplierMembers,
} from '@vyro/db/schema';
import { newId, NotificationType } from '@vyro/shared';
import { notifyOrderParties } from '../notifications/dispatcher';

const sendSchema = z.object({ body: z.string().min(1).max(2000) });

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

async function assertParticipant(d1: D1Database, userId: string, isAdmin: boolean, poId: string) {
  const db = getDb(d1);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (isAdmin) return po;

  const bizRow = await db
    .select({ id: businesses.id })
    .from(businesses)
    .innerJoin(businessMembers, eq(businessMembers.businessId, businesses.id))
    .where(and(eq(businesses.id, po.businessId), eq(businessMembers.userId, userId)))
    .get();
  if (bizRow) return po;

  const supRow = await db
    .select({ id: suppliers.id })
    .from(suppliers)
    .innerJoin(supplierMembers, eq(supplierMembers.supplierId, suppliers.id))
    .where(and(eq(suppliers.id, po.supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (supRow) return po;

  throw httpError(403, 'FORBIDDEN', 'Not a participant');
}

async function notifyRecipient(
  d1: D1Database,
  queue: { send: (body: unknown) => Promise<unknown> } | undefined,
  senderUserId: string,
  poId: string,
  body: string,
) {
  const db = getDb(d1);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) return;
  await notifyOrderParties(
    d1,
    queue,
    { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
    {
      type: NotificationType.PO_MESSAGE,
      title: `New message on PO ${po.poNumber}`,
      body: body.slice(0, 120),
      excludeUserId: senderUserId,
    },
  );
}

router.post('/:id/messages', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const poId = c.req.param('id');
  await assertParticipant(c.env.DB, ctx.userId, ctx.isAdmin, poId);
  const parsed = sendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
  const id = newId();
  const createdAt = Date.now();
  const db = getDb(c.env.DB);
  await db
    .insert(poMessages)
    .values({
      id,
      purchaseOrderId: poId,
      senderUserId: ctx.userId,
      body: parsed.data.body,
      createdAt,
    })
    .run();
  await notifyRecipient(c.env.DB, c.env.NOTIFICATIONS_QUEUE, ctx.userId, poId, parsed.data.body);
  return c.json({ id, createdAt }, 201);
});

router.get('/:id/messages', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const poId = c.req.param('id');
  await assertParticipant(c.env.DB, ctx.userId, ctx.isAdmin, poId);
  const since = Number(c.req.query('since') ?? 0);
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(poMessages)
    .where(and(eq(poMessages.purchaseOrderId, poId), gt(poMessages.createdAt, since)))
    .orderBy(asc(poMessages.createdAt))
    .all();
  return c.json({ messages: rows });
});

router.post('/:id/messages/read', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const poId = c.req.param('id');
  await assertParticipant(c.env.DB, ctx.userId, ctx.isAdmin, poId);
  const now = Date.now();
  const db = getDb(c.env.DB);
  await db
    .update(poMessages)
    .set({ readAt: now })
    .where(
      and(
        eq(poMessages.purchaseOrderId, poId),
        isNull(poMessages.readAt),
        // Only the counterparty's messages are marked read by the reader.
        ne(poMessages.senderUserId, ctx.userId),
      ),
    )
    .run();
  return c.json({ ok: true, readAt: now });
});

export default router;
