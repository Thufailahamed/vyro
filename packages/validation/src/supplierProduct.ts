import { z } from 'zod';

const tierDiscount = z.number().int().min(0).max(50);
const tierMinQty = z.number().int().min(1).max(100000);

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
  .strict();

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
  .strict();

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
