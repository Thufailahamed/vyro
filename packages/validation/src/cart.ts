import { z } from 'zod';

export const addCartItemSchema = z
  .object({
    businessId: z.string().min(1),
    supplierProductId: z.string().min(1),
    quantity: z.number().int().min(1).max(10000),
  })
  .strict();

export const updateCartItemSchema = z
  .object({ quantity: z.number().int().min(1).max(10000) })
  .strict();

export const checkoutSchema = z
  .object({
    businessId: z.string().min(1),
    notes: z.string().max(2000).optional(),
    paymentMethod: z.enum(['paynow', 'credit']).optional().default('paynow'),
    creditTerms: z.enum(['net14', 'net30']).optional(),
    idempotencyKey: z.string().min(8).max(100).optional(),
    rfqId: z.string().min(1).optional(),
    /** Saved delivery address; defaults to the business default, then its registered address. */
    deliveryAddressId: z.string().min(1).optional(),
  })
  .strict()
  .refine((d) => d.paymentMethod !== 'credit' || !!d.creditTerms, {
    message: 'creditTerms required when paymentMethod=credit',
  });

export const reorderResponseSchema = z
  .object({
    cartId: z.string(),
    addedCount: z.number().int().min(0),
    skippedCount: z.number().int().min(0),
    addedSubtotalCents: z.number().int().min(0),
    added: z.array(
      z.object({
        supplierProductId: z.string(),
        supplierId: z.string(),
        qty: z.number().int().min(1),
        oldUnitCents: z.number().int().min(0),
        newUnitCents: z.number().int().min(0),
        newEffectiveUnitCents: z.number().int().min(0),
        tierApplied: z
          .object({ minQty: z.number().int().min(0), discountPct: z.number().int().min(0) })
          .nullable(),
        driftPct: z.number(),
      }),
    ),
    skipped: z.array(
      z.object({
        supplierProductId: z.string(),
        supplierId: z.string(),
        qty: z.number().int().min(1),
        reason: z.enum(['archived', 'out_of_stock', 'below_moq', 'multi_supplier_unsupported']),
      }),
    ),
    warnings: z.array(z.string()),
  })
  .strict();

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ReorderResponse = z.infer<typeof reorderResponseSchema>;
