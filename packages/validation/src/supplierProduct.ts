import { z } from 'zod';

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
  })
  .strict();

export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;
