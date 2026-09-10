import { z } from 'zod';

export const rfqItemSchema = z
  .object({
    productId: z.string().min(1).optional(),
    supplierProductId: z.string().min(1).optional(),
    description: z.string().min(1).max(500),
    quantity: z.number().int().positive().max(10000000),
    unit: z.string().min(1).max(20).default('kg'),
    targetPriceCents: z.number().int().nonnegative().optional(),
    specifications: z.string().max(2000).optional(),
    requiredDate: z.number().int().positive().optional(),
  })
  .strict();

export const createRfqSchema = z
  .object({
    businessId: z.string().min(1),
    title: z.string().min(3).max(200),
    description: z.string().max(5000).optional(),
    currency: z.string().length(3).default('LKR'),
    deadline: z.number().int().positive().optional(),
    deliveryLocation: z.string().max(500).optional(),
    deliveryCity: z.string().max(100).optional(),
    deliveryDistrict: z.string().max(100).optional(),
    requiredDeliveryDate: z.number().int().positive().optional(),
    deliveryRequirements: z.string().max(2000).optional(),
    paymentMethod: z.string().max(100).optional(),
    paymentTerms: z.string().max(2000).optional(),
    specifications: z.string().max(5000).optional(),
    packagingRequirements: z.string().max(2000).optional(),
    qualityRequirements: z.string().max(2000).optional(),
    brandPreferences: z.string().max(1000).optional(),
    notes: z.string().max(5000).optional(),
    isOpen: z.boolean().default(false),
    recurrenceRule: z.string().max(200).optional(),
    templateId: z.string().optional(),
    items: z.array(rfqItemSchema).min(1).max(100),
    supplierIds: z.array(z.string().min(1)).max(50).default([]),
    fromCart: z.boolean().default(false),
  })
  .strict();

export const updateRfqSchema = z
  .object({
    title: z.string().min(3).max(200).optional(),
    description: z.string().max(5000).optional(),
    deadline: z.number().int().positive().optional(),
    deliveryLocation: z.string().max(500).optional(),
    deliveryCity: z.string().max(100).optional(),
    deliveryDistrict: z.string().max(100).optional(),
    requiredDeliveryDate: z.number().int().positive().optional(),
    deliveryRequirements: z.string().max(2000).optional(),
    paymentMethod: z.string().max(100).optional(),
    paymentTerms: z.string().max(2000).optional(),
    specifications: z.string().max(5000).optional(),
    packagingRequirements: z.string().max(2000).optional(),
    qualityRequirements: z.string().max(2000).optional(),
    brandPreferences: z.string().max(1000).optional(),
    notes: z.string().max(5000).optional(),
    isOpen: z.boolean().optional(),
  })
  .strict();

export const quoteItemSchema = z
  .object({
    rfqItemId: z.string().min(1).optional(),
    productId: z.string().min(1).optional(),
    supplierProductId: z.string().min(1).optional(),
    description: z.string().min(1).max(500),
    quantity: z.number().int().positive(),
    unit: z.string().min(1).max(20).default('kg'),
    unitPriceCents: z.number().int().nonnegative(),
    discountCents: z.number().int().nonnegative().default(0),
    availableQuantity: z.number().int().nonnegative().optional(),
    estimatedDeliveryDate: z.number().int().positive().optional(),
    isAlternative: z.boolean().default(false),
    alternativeForRfqItemId: z.string().min(1).optional(),
    specification: z.string().max(2000).optional(),
    notes: z.string().max(1000).optional(),
    tiers: z
      .array(
        z
          .object({
            minQty: z.number().int().positive(),
            unitPriceCents: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();

export const submitQuoteSchema = z
  .object({
    currency: z.string().length(3).default('LKR'),
    deliveryFeeCents: z.number().int().nonnegative().default(0),
    taxCents: z.number().int().nonnegative().default(0),
    discountCents: z.number().int().nonnegative().default(0),
    validUntil: z.number().int().positive().optional(),
    estimatedDeliveryDate: z.number().int().positive().optional(),
    paymentTerms: z.string().max(2000).optional(),
    minimumQuantity: z.string().max(200).optional(),
    availability: z.string().max(500).optional(),
    notes: z.string().max(5000).optional(),
    items: z.array(quoteItemSchema).min(1).max(100),
  })
  .strict();

export const counterOfferSchema = z
  .object({
    proposedTotalCents: z.number().int().positive(),
    proposedUnitPrices: z.record(z.string(), z.number().int().nonnegative()).optional(),
    message: z.string().min(1).max(2000),
  })
  .strict();

export const rfqMessageSchema = z
  .object({
    quoteId: z.string().min(1).optional(),
    message: z.string().min(1).max(5000),
    attachmentR2Key: z.string().max(500).optional(),
  })
  .strict();

export const awardQuoteSchema = z
  .object({
    quoteId: z.string().min(1),
    acceptedAlternativeItemIds: z.array(z.string().min(1)).max(100).default([]),
  })
  .strict();

export const rfqThresholdsSchema = z
  .object({
    cartTotalCents: z.number().int().nonnegative(),
    cartQuantity: z.number().int().nonnegative(),
  })
  .strict();

export const createTemplateSchema = z
  .object({
    businessId: z.string().min(1),
    name: z.string().min(2).max(150),
    description: z.string().max(2000).optional(),
    deliveryLocation: z.string().max(500).optional(),
    paymentTerms: z.string().max(2000).optional(),
    items: z.array(rfqItemSchema).min(1).max(100),
  })
  .strict();

export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type SubmitQuoteInput = z.infer<typeof submitQuoteSchema>;
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
