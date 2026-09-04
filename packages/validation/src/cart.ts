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
  })
  .strict();

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
