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
import { businessMembers, supplierMembers, purchaseOrders } from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { ensureDelivery, findDeliveryByPo, updateDelivery } from './repository';
import { recordAudit } from '../supplierProducts/repository';
import { listDeliveriesForSupplier, requireSupplierMember } from './listRepository';

const router = new Hono<{ Bindings: Env }>();

async function roleFor(d1: D1Database, poId: string, userId: string, isAdmin: boolean): Promise<'business' | 'supplier' | 'admin' | null> {
  const db = getDb(d1);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) return null;
  if (isAdmin) return 'admin';
  const inBiz = await db.select().from(businessMembers).where(and(eq(businessMembers.businessId, po.businessId), eq(businessMembers.userId, userId))).get();
  if (inBiz) return 'business';
  const inSup = await db.select().from(supplierMembers).where(and(eq(supplierMembers.supplierId, po.supplierId), eq(supplierMembers.userId, userId))).get();
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

  return c.json({ ok: true });
});

export default router;
