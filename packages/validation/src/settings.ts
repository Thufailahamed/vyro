import { z } from 'zod';

export const sessionTimeoutValues = [15, 30, 60, 240, 1440] as const;

export const userProfilePatchSchema = z
  .object({
    displayName: z.string().min(1).max(80).optional(),
    avatarUrl: z.string().url().max(2048).optional(),
    phone: z.string().min(6).max(20).optional(),
    preferredCurrency: z.literal('LKR').optional(),
  })
  .strict();

export const userNotificationsPatchSchema = z
  .object({
    notifyOrderUpdates: z.boolean().optional(),
    notifyMessages: z.boolean().optional(),
    notifyMarketing: z.boolean().optional(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

export const userSecurityPatchSchema = z
  .object({
    twoFactorEnabled: z.boolean().optional(),
    sessionTimeoutMin: z
      .union([
        z.literal(15),
        z.literal(30),
        z.literal(60),
        z.literal(240),
        z.literal(1440),
      ])
      .optional(),
  })
  .strict();

export const supplierCompanySchema = z
  .object({
    companyName: z.string().min(1).max(120).optional(),
    registrationNo: z.string().max(60).optional(),
    taxId: z.string().max(60).optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().min(6).max(20).optional(),
  })
  .strict();

export const supplierWarehouseSchema = z
  .object({
    warehouseAddress: z.string().min(1).max(200).optional(),
    warehouseCity: z.string().min(1).max(80).optional(),
    warehouseDistrict: z.string().min(1).max(80).optional(),
    warehouseLat: z.number().min(-90).max(90).optional(),
    warehouseLng: z.number().min(-180).max(180).optional(),
    defaultLeadTimeDays: z.number().int().min(0).max(365).optional(),
  })
  .strict();

export const supplierPayoutsSchema = z
  .object({
    payoutMethod: z.union([z.literal('bank'), z.literal('cash')]).optional(),
    bankName: z.string().max(120).optional(),
    bankAccountNo: z.string().max(60).optional(),
    bankBranch: z.string().max(120).optional(),
    bankAccountHolder: z.string().max(120).optional(),
  })
  .strict();

export const supplierNotificationsSchema = z
  .object({
    notifyNewOrders: z.boolean().optional(),
    notifyLowStock: z.boolean().optional(),
    notifyPaymentReceived: z.boolean().optional(),
  })
  .strict();

/** Sri Lanka VAT/SSCL registration; drives the tax breakdown on invoices. */
export const supplierTaxSchema = z
  .object({
    vatRegistered: z.boolean().optional(),
    vatRegistrationNo: z.string().trim().max(40).nullable().optional(),
    ssclRegistered: z.boolean().optional(),
  })
  .strict();

/**
 * Facility settings patch.
 *
 * Text fields are nullable: omitting a key leaves the stored value alone,
 * sending `null` clears it. Without the nullable variant a supplier could
 * never empty a field — the web sent `undefined` for an empty input, which
 * the server read as "no change".
 */
export const supplierSettingsPatchSchema = z
  .object({
    companyName: z.string().min(1).max(120).nullable().optional(),
    registrationNo: z.string().max(60).nullable().optional(),
    taxId: z.string().max(60).nullable().optional(),
    contactEmail: z.string().email().nullable().optional(),
    contactPhone: z.string().min(6).max(20).nullable().optional(),
    warehouseAddress: z.string().min(1).max(200).nullable().optional(),
    warehouseCity: z.string().min(1).max(80).nullable().optional(),
    warehouseDistrict: z.string().min(1).max(80).nullable().optional(),
    warehouseLat: z.number().min(-90).max(90).nullable().optional(),
    warehouseLng: z.number().min(-180).max(180).nullable().optional(),
    defaultLeadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
    payoutMethod: z.union([z.literal('bank'), z.literal('cash')]).nullable().optional(),
    bankName: z.string().max(120).nullable().optional(),
    bankAccountNo: z.string().max(60).nullable().optional(),
    bankBranch: z.string().max(120).nullable().optional(),
    bankAccountHolder: z.string().max(120).nullable().optional(),
    notifyNewOrders: supplierNotificationsSchema.shape.notifyNewOrders,
    notifyLowStock: supplierNotificationsSchema.shape.notifyLowStock,
    notifyPaymentReceived: supplierNotificationsSchema.shape.notifyPaymentReceived,
    vatRegistered: supplierTaxSchema.shape.vatRegistered,
    vatRegistrationNo: supplierTaxSchema.shape.vatRegistrationNo,
    ssclRegistered: supplierTaxSchema.shape.ssclRegistered,
  })
  .strict()
  .refine((v: Record<string, unknown>) => Object.keys(v).length > 0, {
    message: 'at least one field required',
  });

export const platformSettingsPatchSchema = z
  .object({
    brandName: z.string().min(1).max(80).optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().max(40).optional(),
    platformFeeBps: z.number().int().min(0).max(1000).optional(),
    rfqValueThresholdCents: z.number().int().min(0).max(100000000).optional(),
    rfqQuantityThreshold: z.number().int().min(0).max(1000000).optional(),
    enableBusinessSignup: z.boolean().optional(),
    enableSupplierSignup: z.boolean().optional(),
  })
  .strict();
