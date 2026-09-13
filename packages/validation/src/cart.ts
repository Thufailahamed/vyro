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
  })
  .strict()
  .refine((d) => d.paymentMethod !== 'credit' || !!d.creditTerms, {
    message: 'creditTerms required when paymentMethod=credit',
  });

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
