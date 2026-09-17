import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  purchaseOrders,
  purchaseOrderItems,
  supplierProducts,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type SupplierProduct,
} from '@vyro/db/schema';
import { checkPurchasable } from '@vyro/shared';
import { httpError } from '../../lib/errors';
import { ensureOpenCart, upsertCartItem } from './repository';
import { applyTier, resolveTier, type TierSet } from './pricing';

export type ReorderSkipReason = 'archived' | 'out_of_stock' | 'below_moq' | 'multi_supplier_unsupported';

export interface ReorderAddedLine {
  supplierProductId: string;
  supplierId: string;
  qty: number;
  oldUnitCents: number;
  newUnitCents: number;
  newEffectiveUnitCents: number;
  tierApplied: { minQty: number; discountPct: number } | null;
  driftPct: number;
}

export interface ReorderSkippedLine {
  supplierProductId: string;
  supplierId: string;
  qty: number;
  reason: ReorderSkipReason;
}

export interface ReorderResult {
  cartId: string;
  addedCount: number;
  skippedCount: number;
  addedSubtotalCents: number;
  added: ReorderAddedLine[];
  skipped: ReorderSkippedLine[];
  warnings: string[];
}

const REORDER_ELIGIBLE_STATUSES = new Set(['completed', 'delivered', 'ready_for_pickup']);

function driftPct(oldCents: number, newCents: number): number {
  if (oldCents <= 0) return 0;
  return Math.round(((newCents - oldCents) / oldCents) * 1000) / 10;
}

/**
 * Re-add every line from a terminal-status PO into the buyer's open cart at
 * today's price + supplier tier. Single-supplier only: lines referencing any
 * other supplier product are reported as skipped (`multi_supplier_unsupported`).
 * Caller is responsible for RBAC; `businessId` scopes the cart write.
 */
export async function reorderFromOrder(
  d1: D1Database,
  orderId: string,
  businessId: string,
): Promise<ReorderResult> {
  const db = getDb(d1);

  const po = (await db
    .select()
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.id, orderId), eq(purchaseOrders.businessId, businessId)))
    .get()) as PurchaseOrder | null;

  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!REORDER_ELIGIBLE_STATUSES.has(po.status)) {
    throw httpError(409, 'PO_NOT_REORDERABLE', `PO status ${po.status} cannot be reordered`);
  }

  const items = (await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, orderId))
    .all()) as PurchaseOrderItem[];

  if (items.length === 0) {
    return {
      cartId: '',
      addedCount: 0,
      skippedCount: 0,
      addedSubtotalCents: 0,
      added: [],
      skipped: [],
      warnings: ['PO has no line items'],
    };
  }

  // Sort by item id for deterministic ordering, then lock to the first
  // supplier-product encountered. Lines referencing a different supplier
  // product get skipped as `multi_supplier_unsupported` (single-supplier floor).
  items.sort((a, b) => a.id.localeCompare(b.id));
  const primarySupplierProductId = items[0]!.supplierProductId;

  const offers = (await db
    .select()
    .from(supplierProducts)
    .where(eq(supplierProducts.id, primarySupplierProductId))
    .all()) as SupplierProduct[];
  const offer = offers.find((o) => o.id === primarySupplierProductId) ?? null;

  const cart = await ensureOpenCart(d1, businessId);
  const result: ReorderResult = {
    cartId: cart.id,
    addedCount: 0,
    skippedCount: 0,
    addedSubtotalCents: 0,
    added: [],
    skipped: [],
    warnings: [],
  };

  for (const item of items) {
    if (item.supplierProductId !== primarySupplierProductId) {
      result.skipped.push({
        supplierProductId: item.supplierProductId,
        supplierId: offer?.supplierId ?? '',
        qty: item.quantity,
        reason: 'multi_supplier_unsupported',
      });
      result.skippedCount++;
      continue;
    }
    if (!offer || offer.deletedAt) {
      result.skipped.push({
        supplierProductId: item.supplierProductId,
        supplierId: offer?.supplierId ?? '',
        qty: item.quantity,
        reason: 'archived',
      });
      result.skippedCount++;
      continue;
    }

    const purchasable = {
      minOrderQty: offer.minOrderQty,
      stockQty: offer.stockQty,
      reservedQty: offer.reservedQty,
      lowStockThreshold: offer.lowStockThreshold ?? 0,
      trackInventory: offer.trackInventory,
      availabilityStatus: offer.availabilityStatus as 'in_stock' | 'low' | 'out_of_stock',
    };

    const verdict = checkPurchasable(purchasable, item.quantity);
    if (!verdict.ok) {
      const reason: ReorderSkipReason =
        verdict.code === 'INSUFFICIENT_STOCK'
          ? 'out_of_stock'
          : verdict.code === 'BELOW_MOQ'
            ? 'below_moq'
            : 'out_of_stock';
      result.skipped.push({
        supplierProductId: item.supplierProductId,
        supplierId: offer.supplierId,
        qty: item.quantity,
        reason,
      });
      result.skippedCount++;
      continue;
    }

    const tierSet: TierSet = {
      tier1MinQty: offer.tier1MinQty,
      tier1DiscountPct: offer.tier1DiscountPct,
      tier2MinQty: offer.tier2MinQty,
      tier2DiscountPct: offer.tier2DiscountPct,
      tier3MinQty: offer.tier3MinQty,
      tier3DiscountPct: offer.tier3DiscountPct,
    };
    const tier = resolveTier(tierSet, item.quantity);
    const effective = applyTier(offer.priceCents, item.quantity, tier);
    const newEffectiveUnitCents = Math.round(effective / item.quantity);

    await upsertCartItem(d1, cart.id, item.supplierProductId, item.quantity);

    const dPct = driftPct(item.unitPriceCentsSnapshot, offer.priceCents);
    result.added.push({
      supplierProductId: item.supplierProductId,
      supplierId: offer.supplierId,
      qty: item.quantity,
      oldUnitCents: item.unitPriceCentsSnapshot,
      newUnitCents: offer.priceCents,
      newEffectiveUnitCents,
      tierApplied: tier ? { minQty: tier.minQty, discountPct: tier.discountPct } : null,
      driftPct: dPct,
    });
    result.addedCount++;
    result.addedSubtotalCents += effective;
  }

  return result;
}