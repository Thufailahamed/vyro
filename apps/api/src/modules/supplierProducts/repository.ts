import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierProducts, auditLogs } from '@vyro/db/schema';
import { newId } from '@vyro/shared';

export async function listOffersForProduct(d1: D1Database, productId: string) {
  const db = getDb(d1);
  return db.select().from(supplierProducts)
    .where(and(eq(supplierProducts.productId, productId), isNull(supplierProducts.deletedAt)))
    .all();
}

export async function listOffersForSupplier(d1: D1Database, supplierId: string) {
  const db = getDb(d1);
  return db.select().from(supplierProducts)
    .where(and(eq(supplierProducts.supplierId, supplierId), isNull(supplierProducts.deletedAt)))
    .all();
}

export async function findOffer(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db.select().from(supplierProducts)
    .where(and(eq(supplierProducts.id, id), isNull(supplierProducts.deletedAt)))
    .get() ?? null;
}

type TierFields = {
  tier1MinQty?: number | undefined;
  tier1DiscountPct?: number | undefined;
  tier2MinQty?: number | undefined;
  tier2DiscountPct?: number | undefined;
  tier3MinQty?: number | undefined;
  tier3DiscountPct?: number | undefined;
};

export async function createOffer(
  d1: D1Database,
  input: {
    supplierId: string;
    productId: string;
    supplierSku?: string | undefined;
    priceCents: number;
    minOrderQty?: number | undefined;
    leadTimeDays?: number | undefined;
    deliveryAvailable?: boolean | undefined;
    deliveryRadiusKm?: number | null | undefined;
    availabilityStatus?: 'in_stock' | 'low' | 'out_of_stock' | undefined;
  } & TierFields,
) {
  const db = getDb(d1);
  const id = newId();
  const now = Date.now();
  await db.insert(supplierProducts).values({
    id,
    supplierId: input.supplierId,
    productId: input.productId,
    supplierSku: input.supplierSku ?? null,
    priceCents: input.priceCents,
    minOrderQty: input.minOrderQty ?? 1,
    leadTimeDays: input.leadTimeDays ?? 1,
    deliveryAvailable: input.deliveryAvailable ?? true,
    deliveryRadiusKm: input.deliveryRadiusKm ?? null,
    availabilityStatus: input.availabilityStatus ?? 'in_stock',
    active: true,
    ...(input.tier1MinQty !== undefined ? { tier1MinQty: input.tier1MinQty } : {}),
    ...(input.tier1DiscountPct !== undefined ? { tier1DiscountPct: input.tier1DiscountPct } : {}),
    ...(input.tier2MinQty !== undefined ? { tier2MinQty: input.tier2MinQty } : {}),
    ...(input.tier2DiscountPct !== undefined ? { tier2DiscountPct: input.tier2DiscountPct } : {}),
    ...(input.tier3MinQty !== undefined ? { tier3MinQty: input.tier3MinQty } : {}),
    ...(input.tier3DiscountPct !== undefined ? { tier3DiscountPct: input.tier3DiscountPct } : {}),
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateOffer(
  d1: D1Database,
  id: string,
  input: {
    supplierSku?: string | null | undefined;
    priceCents?: number | undefined;
    minOrderQty?: number | undefined;
    leadTimeDays?: number | undefined;
    deliveryAvailable?: boolean | undefined;
    deliveryRadiusKm?: number | null | undefined;
    availabilityStatus?: 'in_stock' | 'low' | 'out_of_stock' | undefined;
    active?: boolean | undefined;
  } & TierFields,
) {
  const db = getDb(d1);
  await db.update(supplierProducts).set({ ...input, updatedAt: Date.now() }).where(eq(supplierProducts.id, id));
}

export async function softDeleteOffer(d1: D1Database, id: string) {
  const db = getDb(d1);
  await db.update(supplierProducts).set({ deletedAt: Date.now(), active: false, updatedAt: Date.now() }).where(eq(supplierProducts.id, id));
}

export async function recordAudit(
  d1: D1Database,
  entry: { actorUserId: string | null; action: string; resourceType: string; resourceId: string; metadata?: unknown; ip?: string | null; userAgent?: string | null },
) {
  const db = getDb(d1);
  await db.insert(auditLogs).values({
    id: newId(),
    actorUserId: entry.actorUserId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: entry.metadata != null ? JSON.stringify(entry.metadata) : null,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    createdAt: Date.now(),
  });
}
