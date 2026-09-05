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
  })
  .strict();

export const supplierNotificationsSchema = z
  .object({
    notifyNewOrders: z.boolean().optional(),
    notifyLowStock: z.boolean().optional(),
    notifyPaymentReceived: z.boolean().optional(),
  })
  .strict();

export const supplierSettingsPatchSchema = z
  .object({
    companyName: supplierCompanySchema.shape.companyName,
    registrationNo: supplierCompanySchema.shape.registrationNo,
    taxId: supplierCompanySchema.shape.taxId,
    contactEmail: supplierCompanySchema.shape.contactEmail,
    contactPhone: supplierCompanySchema.shape.contactPhone,
    warehouseAddress: supplierWarehouseSchema.shape.warehouseAddress,
    warehouseCity: supplierWarehouseSchema.shape.warehouseCity,
    warehouseDistrict: supplierWarehouseSchema.shape.warehouseDistrict,
    warehouseLat: supplierWarehouseSchema.shape.warehouseLat,
    warehouseLng: supplierWarehouseSchema.shape.warehouseLng,
    defaultLeadTimeDays: supplierWarehouseSchema.shape.defaultLeadTimeDays,
    payoutMethod: supplierPayoutsSchema.shape.payoutMethod,
    bankName: supplierPayoutsSchema.shape.bankName,
    bankAccountNo: supplierPayoutsSchema.shape.bankAccountNo,
    bankBranch: supplierPayoutsSchema.shape.bankBranch,
    notifyNewOrders: supplierNotificationsSchema.shape.notifyNewOrders,
    notifyLowStock: supplierNotificationsSchema.shape.notifyLowStock,
    notifyPaymentReceived: supplierNotificationsSchema.shape.notifyPaymentReceived,
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
    enableBusinessSignup: z.boolean().optional(),
    enableSupplierSignup: z.boolean().optional(),
  })
  .strict();
