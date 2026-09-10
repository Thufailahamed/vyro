import { z } from 'zod';

const tierDiscount = z.number().int().min(0).max(50);
const tierMinQty = z.number().int().min(1).max(100000);

type TierFields = {
  tier1MinQty?: number | undefined;
  tier1DiscountPct?: number | undefined;
  tier2MinQty?: number | undefined;
  tier2DiscountPct?: number | undefined;
  tier3MinQty?: number | undefined;
  tier3DiscountPct?: number | undefined;
};

/**
 * Active tiers (discount > 0) must order by quantity: strictly increasing
 * minimums with non-shrinking discounts. Pairs with a missing side (partial
 * updates) are skipped — only provided values are checked.
 */
function tierOrderOk(v: TierFields): boolean {
  const tiers = [
    { min: v.tier1MinQty, pct: v.tier1DiscountPct },
    { min: v.tier2MinQty, pct: v.tier2DiscountPct },
    { min: v.tier3MinQty, pct: v.tier3DiscountPct },
  ].filter((t) => (t.pct ?? 0) > 0);
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1]!;
    const cur = tiers[i]!;
    if (prev.min == null || cur.min == null) continue;
    if (cur.min <= prev.min) return false;
    if ((cur.pct ?? 0) < (prev.pct ?? 0)) return false;
  }
  return true;
}

const tierOrderRefine = {
  message: 'tier minimums must increase and discounts must not shrink with quantity',
};

export const createSupplierProductSchema = z
  .object({
    supplierId: z.string().min(1),
    productId: z.string().min(1),
    supplierSku: z.string().max(60).optional(),
    priceCents: z.number().int().min(0),
    minOrderQty: z.number().int().min(1).optional(),
    leadTimeDays: z.number().int().min(0).optional(),
    deliveryAvailable: z.boolean().optional(),
    deliveryRadiusKm: z.number().int().min(0).max(500).nullable().optional(),
    availabilityStatus: z.enum(['in_stock', 'low', 'out_of_stock']).optional(),
    stockQty: z.number().int().min(0).max(1000000).optional(),
    lowStockThreshold: z.number().int().min(0).max(1000000).optional(),
    trackInventory: z.boolean().optional(),
    tier1MinQty: tierMinQty.optional(),
    tier1DiscountPct: tierDiscount.optional(),
    tier2MinQty: tierMinQty.optional(),
    tier2DiscountPct: tierDiscount.optional(),
    tier3MinQty: tierMinQty.optional(),
    tier3DiscountPct: tierDiscount.optional(),
  })
  .strict()
  .refine(tierOrderOk, tierOrderRefine);

export const updateSupplierProductSchema = z
  .object({
    supplierSku: z.string().max(60).nullable().optional(),
    priceCents: z.number().int().min(0).optional(),
    minOrderQty: z.number().int().min(1).optional(),
    leadTimeDays: z.number().int().min(0).optional(),
    deliveryAvailable: z.boolean().optional(),
    deliveryRadiusKm: z.number().int().min(0).max(500).nullable().optional(),
    availabilityStatus: z.enum(['in_stock', 'low', 'out_of_stock']).optional(),
    active: z.boolean().optional(),
    lowStockThreshold: z.number().int().min(0).max(1000000).optional(),
    trackInventory: z.boolean().optional(),
    tier1MinQty: tierMinQty.optional(),
    tier1DiscountPct: tierDiscount.optional(),
    tier2MinQty: tierMinQty.optional(),
    tier2DiscountPct: tierDiscount.optional(),
    tier3MinQty: tierMinQty.optional(),
    tier3DiscountPct: tierDiscount.optional(),
  })
  .strict()
  .refine(tierOrderOk, tierOrderRefine);

/** Stock write: absolute count (`set`) or signed delta (`adjust`). */
export const stockAdjustSchema = z
  .object({
    mode: z.enum(['set', 'adjust']).default('set'),
    quantity: z.number().int().min(-1000000).max(1000000),
    lowStockThreshold: z.number().int().min(0).max(1000000).optional(),
    trackInventory: z.boolean().optional(),
    note: z.string().max(300).optional(),
  })
  .strict()
  .refine((v) => v.mode === 'adjust' || v.quantity >= 0, {
    message: 'quantity must be >= 0 when mode is "set"',
    path: ['quantity'],
  });

export type StockAdjustInput = z.infer<typeof stockAdjustSchema>;

export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;
