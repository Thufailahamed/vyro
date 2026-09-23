import { Hono } from 'hono';
import {
  canTransitionDelivery,
  deliveryTransitionSchema,
  hasProofOfDelivery,
  type DeliveryActor,
} from '@vyro/validation/delivery';
import { deliveryTrackingSchema } from '@vyro/validation/orderLifecycle';
import { applyTransition } from '../orders/lifecycle';
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
import { NotificationType, newId } from '@vyro/shared';

const POD_MAX_BYTES = 8 * 1024 * 1024;
const POD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  return c.json({ delivery: d ? { ...d, podPhotoKey: undefined, hasPodPhoto: !!d.podPhotoKey } : null });
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
  if (parsed.data.carrier != null) patch.carrier = parsed.data.carrier;
  if (parsed.data.trackingNumber != null) patch.trackingNumber = parsed.data.trackingNumber;
  if (parsed.data.trackingUrl != null) patch.trackingUrl = parsed.data.trackingUrl;
  if (parsed.data.recipientName != null) patch.recipientName = parsed.data.recipientName;
  if (parsed.data.podNote != null) patch.podNote = parsed.data.podNote;
  if (parsed.data.status === 'picked_up' || parsed.data.status === 'in_transit') patch.pickedUpAt = existing.pickedUpAt ?? now;
  if (parsed.data.status === 'assigned') patch.assignedByUserId = ctx.userId;
  if (parsed.data.status === 'failed') patch.failedReason = parsed.data.reason ?? 'delivery failed';
  if (parsed.data.status === 'delivered') {
    patch.deliveredAt = now;
    // Proof of delivery: recipient + (photo or note), from this request or already on file.
    if (!hasProofOfDelivery({ ...existing, ...patch })) {
      throw httpError(422, 'POD_REQUIRED', 'Record the recipient name and a photo or note before marking delivered');
    }
    if (patch.recipientName || patch.podNote) {
      patch.podCapturedByUserId = ctx.userId;
      patch.podCapturedAt = now;
    }
  }

  // Keep PO and delivery machines in lockstep. The order moves FIRST so a
  // guard failure (payment gate, illegal state) blocks the delivery change
  // instead of letting the two drift apart.
  const db = getDb(c.env.DB);
  // Persist tracking/POD details first — the order pipeline's POD guard reads them.
  const { status: _nextStatus, ...details } = patch;
  if (Object.keys(details).some((k) => ['carrier', 'trackingNumber', 'trackingUrl', 'recipientName', 'podNote'].includes(k))) {
    await updateDelivery(c.env.DB, c.req.param('poId'), details);
  }
  const poForTimeline = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('poId'))).get();
  const poStatus = (poForTimeline as any)?.status as string | undefined;
  const actorRole = role as 'supplier' | 'admin';
  if (poForTimeline && (parsed.data.status === 'picked_up' || parsed.data.status === 'in_transit') && poStatus === 'ready_for_pickup') {
    await applyTransition(c.env, {
      poId: (poForTimeline as any).id,
      to: 'out_for_delivery',
      actor: { role: actorRole, userId: ctx.userId },
      reason: null,
      opts: { via: 'delivery.sync', expectedFrom: 'ready_for_pickup' },
    });
  }
  if (poForTimeline && parsed.data.status === 'delivered') {
    if (poStatus === 'ready_for_pickup' || poStatus === 'out_for_delivery') {
      if (poStatus === 'ready_for_pickup') {
        await applyTransition(c.env, {
          poId: (poForTimeline as any).id,
          to: 'out_for_delivery',
          actor: { role: actorRole, userId: ctx.userId },
          opts: { via: 'delivery.sync', expectedFrom: 'ready_for_pickup' },
        });
      }
      await applyTransition(c.env, {
        poId: (poForTimeline as any).id,
        to: 'delivered',
        actor: { role: actorRole, userId: ctx.userId },
        reason: parsed.data.recipientName ? `received by ${parsed.data.recipientName}` : 'delivery completed',
        opts: { via: 'delivery.sync', expectedFrom: 'out_for_delivery' },
      });
    } else if (poStatus !== 'delivered' && poStatus !== 'completed') {
      throw httpError(409, 'CONFLICT', `Order is ${poStatus}; it must be dispatched before it can be delivered`);
    }
  }

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

  // Delivery progress on the order timeline (kind=delivery; not a status move).
  const poNow = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('poId'))).get();
  await db.insert(orderEvents).values({
    id: newId(),
    purchaseOrderId: c.req.param('poId'),
    actorUserId: ctx.userId,
    fromStatus: (poNow as any)?.status ?? existing.status,
    toStatus: (poNow as any)?.status ?? 'pending',
    reason: `delivery ${existing.status} -> ${parsed.data.status}${parsed.data.reason ? `: ${parsed.data.reason}` : ''}`,
    metadata: JSON.stringify({ kind: 'delivery', from: existing.status, to: parsed.data.status }),
    createdAt: now,
  });

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

/** Tracking details (carrier, tracking no., recipient) without a status change. */
router.patch('/:poId', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const role = await roleFor(c.env.DB, c.req.param('poId'), ctx.userId, ctx.isAdmin);
  if (role !== 'supplier' && role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Only supplier/admin update deliveries');
  const parsed = deliveryTrackingSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await ensureDelivery(c.env.DB, c.req.param('poId'));
  const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
  await updateDelivery(c.env.DB, c.req.param('poId'), patch as never);
  if (parsed.data.trackingNumber) {
    try {
      const po = await getDb(c.env.DB).select().from(purchaseOrders).where(eq(purchaseOrders.id, c.req.param('poId'))).get();
      if (po) {
        await notifyOrderParties(
          c.env.DB,
          c.env.NOTIFICATIONS_QUEUE,
          { id: po.id, poNumber: po.poNumber, businessId: po.businessId, supplierId: po.supplierId },
          {
            type: NotificationType.DELIVERY_UPDATED,
            title: `Tracking added for ${po.poNumber}`,
            body: `${parsed.data.carrier ? `${parsed.data.carrier} ` : ''}tracking number ${parsed.data.trackingNumber}`,
            link: `/orders/${po.id}`,
            audience: 'buyer',
            excludeUserId: ctx.userId,
          },
        );
      }
    } catch {
      /* best-effort */
    }
  }
  const d = await findDeliveryByPo(c.env.DB, c.req.param('poId'));
  return c.json({ delivery: d ? { ...d, podPhotoKey: undefined, hasPodPhoto: !!d.podPhotoKey } : null });
});

/** Proof-of-delivery photo (multipart `file`, optional `recipientName`, `note`). */
router.post('/:poId/pod', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  const role = await roleFor(c.env.DB, poId, ctx.userId, ctx.isAdmin);
  if (role !== 'supplier' && role !== 'admin') throw httpError(403, 'FORBIDDEN', 'Only supplier/admin capture proof of delivery');
  const form = await c.req.formData().catch(() => null);
  if (!form) throw httpError(400, 'VALIDATION_ERROR', 'multipart form required');
  const file = form.get('file');
  const recipientName = (form.get('recipientName') as string | null)?.trim() || null;
  const note = (form.get('note') as string | null)?.trim() || null;
  await ensureDelivery(c.env.DB, poId);
  const patch: Record<string, unknown> = { podCapturedByUserId: ctx.userId, podCapturedAt: Date.now() };
  if (recipientName) patch.recipientName = recipientName.slice(0, 120);
  if (note) patch.podNote = note.slice(0, 500);
  if (file && typeof file !== 'string') {
    const blob = file as File;
    if (!POD_TYPES.includes(blob.type)) throw httpError(400, 'VALIDATION_ERROR', 'Photo must be JPEG, PNG or WebP');
    if (blob.size > POD_MAX_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', 'Photo exceeds 8 MB');
    const key = `pod/${poId}/${newId()}`;
    await c.env.INVOICES.put(key, await blob.arrayBuffer(), { httpMetadata: { contentType: blob.type } });
    patch.podPhotoKey = key;
  }
  if (!patch.podPhotoKey && !patch.podNote && !patch.recipientName) {
    throw httpError(400, 'VALIDATION_ERROR', 'Provide a photo, a note or the recipient name');
  }
  await updateDelivery(c.env.DB, poId, patch as never);
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'delivery.pod_captured',
    resourceType: 'purchase_order',
    resourceId: poId,
    metadata: { photo: !!patch.podPhotoKey, recipientName },
  });
  const d = await findDeliveryByPo(c.env.DB, poId);
  return c.json({ delivery: d ? { ...d, podPhotoKey: undefined, hasPodPhoto: !!d.podPhotoKey } : null }, 201);
});

/** Streams the POD photo to either party (or an admin). */
router.get('/:poId/pod', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.param('poId');
  const role = await roleFor(c.env.DB, poId, ctx.userId, ctx.isAdmin);
  if (!role) throw httpError(403, 'FORBIDDEN', 'No access');
  const d = await findDeliveryByPo(c.env.DB, poId);
  if (!d?.podPhotoKey) throw httpError(404, 'NOT_FOUND', 'No proof-of-delivery photo');
  const obj = await c.env.INVOICES.get(d.podPhotoKey);
  if (!obj) throw httpError(404, 'NOT_FOUND', 'Photo missing');
  return new Response(obj.body, {
    headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'private, max-age=300' },
  });
});

export default router;
