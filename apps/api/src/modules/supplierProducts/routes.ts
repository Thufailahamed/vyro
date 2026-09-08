import { Hono } from 'hono';
import { createSupplierProductSchema, updateSupplierProductSchema, stockAdjustSchema } from '@vyro/validation/supplierProduct';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import {
  createOffer,
  findOffer,
  listOffersForProduct,
  listOffersForSupplier,
  recordAudit,
  softDeleteOffer,
  updateOffer,
} from './repository';
import { getDb } from '@vyro/db';
import { suppliers } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { inventoryService } from '../inventory/service';
import { availableQty, deriveAvailability } from '@vyro/shared';

const router = new Hono<{ Bindings: Env }>();

const productIdParam = z.object({ productId: z.string().min(1) }).strict();

/** Adds derived availability so every consumer agrees on stock state. */
function withInventory<T extends Parameters<typeof deriveAvailability>[0]>(offer: T) {
  return {
    ...offer,
    availabilityStatus: deriveAvailability(offer),
    availableQty: offer.trackInventory ? availableQty(offer) : null,
  };
}

router.get('/by-product/:productId', async (c) => {
  const parsed = productIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid productId');
  const offers = await listOffersForProduct(c.env.DB, parsed.data.productId);
  return c.json({ offers: offers.map(withInventory) });
});

router.get('/by-supplier/:supplierId', async (c) => {
  const offers = await listOffersForSupplier(c.env.DB, c.req.param('supplierId'));
  return c.json({ offers: offers.map(withInventory) });
});

async function ensureSupplierMember(d1: D1Database, supplierId: string, userId: string) {
  const db = getDb(d1);
  const supplier = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  // Membership check: re-import the live service to avoid breaking before cycle.
  const { supplierService } = await import('../suppliers/service');
  await supplierService.requireMember(d1, supplierId, userId);
}

router.post('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = createSupplierProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  await ensureSupplierMember(c.env.DB, parsed.data.supplierId, ctx.userId);
  const { supplierId, ...rest } = parsed.data;
  const id = await createOffer(c.env.DB, { supplierId, ...rest });
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'supplier_product.create',
    resourceType: 'supplier_product',
    resourceId: id,
    metadata: { supplierId, productId: parsed.data.productId, priceCents: parsed.data.priceCents },
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
  return c.json({ id }, 201);
});

router.patch('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = updateSupplierProductSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const existing = await findOffer(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Offer not found');

  await ensureSupplierMember(c.env.DB, existing.supplierId, ctx.userId);
  await updateOffer(c.env.DB, c.req.param('id'), parsed.data);
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'supplier_product.update',
    resourceType: 'supplier_product',
    resourceId: existing.id,
    metadata: { changes: parsed.data },
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
  return c.json({ ok: true });
});

/**
 * Stock write. Absolute (`set`) or signed (`adjust`), always ledgered and
 * always re-derives availability + fires low/out-of-stock alerts.
 */
router.post('/:id/stock', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const parsed = stockAdjustSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const existing = await findOffer(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  await ensureSupplierMember(c.env.DB, existing.supplierId, ctx.userId);

  const offer = await inventoryService.adjustStock(
    c.env.DB,
    c.env.NOTIFICATIONS_QUEUE,
    existing.id,
    {
      mode: parsed.data.mode,
      quantity: parsed.data.quantity,
      lowStockThreshold: parsed.data.lowStockThreshold,
      trackInventory: parsed.data.trackInventory,
      note: parsed.data.note,
      actorUserId: ctx.userId,
    },
  );
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'supplier_product.stock',
    resourceType: 'supplier_product',
    resourceId: existing.id,
    metadata: {
      mode: parsed.data.mode,
      quantity: parsed.data.quantity,
      stockQtyAfter: offer.stockQty,
    },
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
  return c.json({
    offer: {
      ...offer,
      availableQty: availableQty(offer),
      availabilityStatus: deriveAvailability(offer),
    },
  });
});

/** Stock movement ledger for one offer. */
router.get('/:id/movements', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const existing = await findOffer(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  await ensureSupplierMember(c.env.DB, existing.supplierId, ctx.userId);
  const limit = Number(c.req.query('limit') ?? 50);
  const movements = await inventoryService.listMovements(
    c.env.DB,
    existing.id,
    Number.isFinite(limit) ? limit : 50,
  );
  return c.json({ movements });
});

router.delete('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const existing = await findOffer(c.env.DB, c.req.param('id'));
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Offer not found');
  await ensureSupplierMember(c.env.DB, existing.supplierId, ctx.userId);
  await softDeleteOffer(c.env.DB, existing.id);
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'supplier_product.delete',
    resourceType: 'supplier_product',
    resourceId: existing.id,
    metadata: { supplierId: existing.supplierId },
    ip: c.req.header('cf-connecting-ip') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
  return c.json({ ok: true });
});

export default router;
