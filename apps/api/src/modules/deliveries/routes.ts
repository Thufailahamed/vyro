import { Hono } from 'hono';
import {
  canTransitionDelivery,
  deliveryTransitionSchema,
  type DeliveryActor,
} from '@vyro/validation/delivery';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { businessMembers, supplierMembers, purchaseOrders, orderEvents } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { ensureDelivery, findDeliveryByPo, updateDelivery } from './repository';
import { recordAudit } from '../supplierProducts/repository';
import { listDeliveriesForSupplier, requireSupplierMember } from './listRepository';
import { notifyOrderParties } from '../notifications/dispatcher';
import { NotificationType, newId, canTransition } from '@vyro/shared';
import { updatePoStatus, insertOrderEvent } from '../purchaseOrders/repository';
import { inventoryService } from '../inventory/service';

const router = new Hono<{ Bindings: Env }>();

async function roleFor(d1: D1Database, poId: string, userId: string, isAdmin: boolean): Promise<'business' | 'supplier' | 'admin' | null> {
  const db = getDb(d1);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) return null;
  if (isAdmin) return 'admin';
  const inBiz = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, po.businessId), eq(businessMembers.userId, userId), eq(businessMembers.status, 'active'))).get();
  if (inBiz) return 'business';
  const inSup = await db.select().from(supplierMembers).where(and(eq(supplierMembers.supplierId, po.supplierId), eq(supplierMembers.userId, userId), eq(supplierMembers.status, 'active'))).get();
  if (inSup) return 'supplier';
  return null;
}

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  try {
    await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
  } catch {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const cursorRaw = c.req.query('cursor');
  const cursor = cursorRaw ? Number(cursorRaw) : undefined;
  const status = c.req.query('status');
  const items = await listDeliveriesForSupplier(c.env.DB, supplierId, cursor, status);
  return c.json({ items });
});

router.get('/:poId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const role = await roleFor(c.env.DB, c.req.param('poId'), ctx.userId, ctx.isAdmin);
  if (!role) throw httpError(403, 'FORBIDDEN', 'No access');
  await ensureDelivery(c.env.DB, c.req.param('poId'));
  const d = await findDeliveryByPo(c.env.DB, c.req.param('poId'));
  return c.json({ delivery: d });
});

router.post('/:poId/transitions', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const role = await roleFor(c.env.DB, c.req.param('poId'), ctx.userId, ctx.isAdmin);
  if (!role) throw httpError(403, 'FORBIDDEN', 'No access');

  const parsed = deliveryTransitionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  if (role !== 'supplier' && role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Only supplier/admin update deliveries');
  }

  await ensureDelivery(c.env.DB, c.req.param('poId'));
  const existing = await findDeliveryByPo(c.env.DB, c.req.param('poId'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Delivery not found');

  // State machine guard: block illegal transitions.
  if (!canTransitionDelivery(existing.status, parsed.data.status, role as DeliveryActor)) {
    throw httpError(
      409,
      'CONFLICT',
      `Illegal delivery transition ${existing.status} -> ${parsed.data.status} for ${role}`,
    );
  }

  const now = Date.now();
  const patch: any = { status: parsed.data.status };
  if (parsed.data.driverName != null) patch.driverName = parsed.data.driverName;
  if (parsed.data.driverPhone != null) patch.driverPhone = parsed.data.driverPhone;
  if (parsed.data.estimatedAt !== undefined) patch.estimatedAt = parsed.data.estimatedAt;
  if (parsed.data.status === 'picked_up' || parsed.data.status === 'in_transit') patch.pickedUpAt = now;
  if (parsed.data.status === 'delivered') patch.deliveredAt = now;
  if (parsed.data.status === 'assigned') patch.assignedByUserId = ctx.userId;

  // Optimistic concurrency: update is guarded on the current status.
  const updated = await updateDelivery(c.env.DB, c.req.param('poId'), patch, existing.status);
  if (!updated) {
    throw httpError(409, 'CONFLICT', 'Delivery state changed concurrently — retry');
  }

  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: `delivery.${parsed.data.status}`,
    resourceType: 'purchase_order',
    resourceId: c.req.param('poId'),
    metadata: { from: existing.status, to: parsed.data.status, reason: parsed.data.reason ?? null },
  });

  // Mirror delivery state into the order timeline without polluting the
  // PO state machine: order_events.toStatus stays a valid OrderStatus.
  // Delivery detail lives in metadata/reason.
  const db = getDb(c.env.DB);
  const poForTimeline = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('poId'))).get();
  await db.insert(orderEvents).values({
    id: newId(),
    purchaseOrderId: c.req.param('poId'),
    actorUserId: ctx.userId,
    fromStatus: poForTimeline?.status ?? existing.status,
    toStatus: poForTimeline?.status ?? 'pending',
    reason: `delivery ${existing.status} -> ${parsed.data.status}${parsed.data.reason ? `: ${parsed.data.reason}` : ''}`,
    metadata: JSON.stringify({ kind: 'delivery', from: existing.status, to: parsed.data.status }),
    createdAt: now,
  });

  // Keep PO and delivery machines in sync: a completed drop-off advances
  // out_for_delivery -> delivered (stock commit + timeline event included).
  if (parsed.data.status === 'delivered' && poForTimeline && (poForTimeline as any).status === 'out_for_delivery') {
    try {
      if (canTransition('out_for_delivery', 'delivered', role as 'business' | 'supplier' | 'admin')) {
        await updatePoStatus(c.env.DB, (poForTimeline as any).id, 'delivered', { deliveredAt: now });
        await insertOrderEvent(c.env.DB, {
          purchaseOrderId: (poForTimeline as any).id,
          actorUserId: ctx.userId,
          fromStatus: 'out_for_delivery',
          toStatus: 'delivered',
          reason: 'delivery completed by carrier',
          metadata: { via: 'delivery.sync' },
        });
        try {
          await inventoryService.commitForOrder(c.env.DB, c.env.NOTIFICATIONS_QUEUE, (poForTimeline as any).id, ctx.userId);
        } catch (err) {
          console.error('[delivery.sync] stock commit failed', err);
        }
      }
    } catch (err) {
      console.error('[delivery.sync] po advance failed', err);
    }
  }

  // Best-effort buyer notification — supplier is the actor and is excluded.
  try {
    const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('poId'))).get();
    if (po) {
      const titles: Record<string, string> = {
        assigned: 'Delivery assigned',
        picked_up: 'Driver picked up your order',
        in_transit: 'Your order is on the way',
        delivered: 'Order delivered',
        failed: 'Delivery failed',
      };
      const bodies: Record<string, string> = {
        assigned: `Delivery for PO ${po.poNumber} has been assigned.`,
        picked_up: `Driver picked up PO ${po.poNumber}.`,
        in_transit: `PO ${po.poNumber} is on the way.`,
        delivered: `PO ${po.poNumber} has been delivered.`,
        failed: `Delivery of PO ${po.poNumber} failed.${parsed.data.reason ? ` Reason: ${parsed.data.reason}` : ''}`,
      };
      await notifyOrderParties(
        c.env.DB,
        c.env.NOTIFICATIONS_QUEUE,
        { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
        {
          type: NotificationType.DELIVERY_UPDATED,
          title: titles[parsed.data.status] ?? `Delivery updated: ${parsed.data.status}`,
          body: bodies[parsed.data.status] ?? null,
          link: `/orders/${po.id}`,
          excludeUserId: ctx.userId,
          audience: 'buyer',
        },
      );
    }
  } catch (err) {
    console.error('[delivery.transition] notify failed', err);
  }

  return c.json({ ok: true });
});

export default router;
