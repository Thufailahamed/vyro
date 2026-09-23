import { z } from 'zod';

// ── Delivery address book ────────────────────────────────────────────────
export const businessAddressCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(60),
    contactName: z.string().trim().max(120).nullable().optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    address: z.string().trim().min(3).max(300),
    city: z.string().trim().min(1).max(80),
    district: z.string().trim().min(1).max(80),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const businessAddressPatchSchema = businessAddressCreateSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'at least one field required' });

export type BusinessAddressCreate = z.infer<typeof businessAddressCreateSchema>;
export type BusinessAddressPatch = z.infer<typeof businessAddressPatchSchema>;

// ── Saved order lists ────────────────────────────────────────────────────
export const orderListCreateSchema = z
  .object({
    businessId: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    /** Optionally seed the list from a past purchase order. */
    fromPurchaseOrderId: z.string().min(1).optional(),
  })
  .strict();

export const orderListRenameSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();

export const orderListItemUpsertSchema = z
  .object({
    supplierProductId: z.string().min(1),
    quantity: z.number().int().min(1).max(100000),
  })
  .strict();

// ── Supplier price-list import ───────────────────────────────────────────
export const supplierProductImportSchema = z
  .object({
    supplierId: z.string().min(1),
    /** Raw CSV text (header row required). ~1 MB cap keeps a Worker request cheap. */
    csv: z.string().min(1).max(1_000_000),
    /** Validate and report without writing anything. */
    dryRun: z.boolean().optional().default(false),
  })
  .strict();

export type SupplierProductImportInput = z.infer<typeof supplierProductImportSchema>;
