import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierSettings, supplierMembers } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';
import { nowMs } from '@vyro/shared';
import { defaultSupplierSettings, type SupplierSettingsShape } from './defaults';
import type { SupplierSetting } from '@vyro/db/schema';

function toShape(row: SupplierSetting): SupplierSettingsShape {
  return {
    supplierId: row.supplierId,
    companyName: row.companyName,
    registrationNo: row.registrationNo,
    taxId: row.taxId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    warehouseAddress: row.warehouseAddress,
    warehouseCity: row.warehouseCity,
    warehouseDistrict: row.warehouseDistrict,
    warehouseLat: row.warehouseLat,
    warehouseLng: row.warehouseLng,
    defaultLeadTimeDays: row.defaultLeadTimeDays,
    payoutMethod: row.payoutMethod as 'bank' | 'cash' | null,
    bankName: row.bankName,
    bankAccountNo: row.bankAccountNo,
    bankBranch: row.bankBranch,
    bankAccountHolder: row.bankAccountHolder,
    bankVerified: row.bankVerified === true,
    notifyNewOrders: row.notifyNewOrders === 1 ? 1 : 0,
    notifyLowStock: row.notifyLowStock === 1 ? 1 : 0,
    notifyPaymentReceived: row.notifyPaymentReceived === 1 ? 1 : 0,
    vatRegistered: row.vatRegistered === true,
    vatRegistrationNo: row.vatRegistrationNo ?? null,
    ssclRegistered: row.ssclRegistered === true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type SupplierSettingsPatch = {
  companyName?: string | null | undefined;
  registrationNo?: string | null | undefined;
  taxId?: string | null | undefined;
  contactEmail?: string | null | undefined;
  contactPhone?: string | null | undefined;
  warehouseAddress?: string | null | undefined;
  warehouseCity?: string | null | undefined;
  warehouseDistrict?: string | null | undefined;
  warehouseLat?: number | null | undefined;
  warehouseLng?: number | null | undefined;
  defaultLeadTimeDays?: number | null | undefined;
  payoutMethod?: 'bank' | 'cash' | null | undefined;
  bankName?: string | null | undefined;
  bankAccountNo?: string | null | undefined;
  bankBranch?: string | null | undefined;
  bankAccountHolder?: string | null | undefined;
  notifyNewOrders?: boolean | undefined;
  notifyLowStock?: boolean | undefined;
  notifyPaymentReceived?: boolean | undefined;
  vatRegistered?: boolean | undefined;
  vatRegistrationNo?: string | null | undefined;
  ssclRegistered?: boolean | undefined;
};

/**
 * Facility settings are restricted to the supplier's own management roles —
 * `sales` members are excluded (the facility settings page is not part of
 * the sales job). The DB role enum is `owner | sales | operations`, so
 * `operations` is the elevated non-sales role — the same pair the payout
 * bank-details route uses.
 */
const SETTINGS_ROLES = ['owner', 'operations'] as const;

export async function getOrCreateSupplierSettings(
  d1: D1Database,
  supplierId: string,
  ctxUserId: string,
): Promise<SupplierSettingsShape> {
  const db = getDb(d1);
  const member = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, ctxUserId)))
    .get();
  if (!member || !SETTINGS_ROLES.includes(member.role as (typeof SETTINGS_ROLES)[number])) {
    throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  }
  const row = await db
    .select()
    .from(supplierSettings)
    .where(eq(supplierSettings.supplierId, supplierId))
    .get();
  if (row) return toShape(row);
  const defaults = defaultSupplierSettings(supplierId);
  await db.insert(supplierSettings).values(defaults);
  return defaults;
}

/**
 * System read (crons, invoice generation): no membership check, never creates
 * a row. Returns null when the supplier has not saved settings yet.
 */
export async function readSupplierSettingsForSystem(
  d1: D1Database,
  supplierId: string,
): Promise<SupplierSettingsShape | null> {
  const row = await getDb(d1)
    .select()
    .from(supplierSettings)
    .where(eq(supplierSettings.supplierId, supplierId))
    .get();
  return row ? toShape(row) : null;
}

export async function patchSupplierSettings(
  d1: D1Database,
  supplierId: string,
  ctxUserId: string,
  patch: SupplierSettingsPatch,
): Promise<SupplierSettingsShape> {
  const current = await getOrCreateSupplierSettings(d1, supplierId, ctxUserId);
  const updatedAt = nowMs();
  // `undefined` = "not supplied" (keep current). `null` = "clear this field".
  const pick = <T>(next: T | null | undefined, fallback: T): T =>
    next === undefined ? fallback : (next as T);
  const next: SupplierSetting = {
    supplierId,
    companyName: pick(patch.companyName, current.companyName),
    registrationNo: pick(patch.registrationNo, current.registrationNo),
    taxId: pick(patch.taxId, current.taxId),
    contactEmail: pick(patch.contactEmail, current.contactEmail),
    contactPhone: pick(patch.contactPhone, current.contactPhone),
    warehouseAddress: pick(patch.warehouseAddress, current.warehouseAddress),
    warehouseCity: pick(patch.warehouseCity, current.warehouseCity),
    warehouseDistrict: pick(patch.warehouseDistrict, current.warehouseDistrict),
    warehouseLat: pick(patch.warehouseLat, current.warehouseLat),
    warehouseLng: pick(patch.warehouseLng, current.warehouseLng),
    defaultLeadTimeDays: pick(patch.defaultLeadTimeDays, current.defaultLeadTimeDays),
    payoutMethod: pick(patch.payoutMethod, current.payoutMethod),
    bankName: pick(patch.bankName, current.bankName),
    bankAccountNo: pick(patch.bankAccountNo, current.bankAccountNo),
    bankBranch: pick(patch.bankBranch, current.bankBranch),
    bankAccountHolder: pick(patch.bankAccountHolder, current.bankAccountHolder),
    bankVerified: current.bankVerified,
    notifyNewOrders:
      patch.notifyNewOrders !== undefined ? (patch.notifyNewOrders ? 1 : 0) : current.notifyNewOrders,
    notifyLowStock:
      patch.notifyLowStock !== undefined ? (patch.notifyLowStock ? 1 : 0) : current.notifyLowStock,
    notifyPaymentReceived:
      patch.notifyPaymentReceived !== undefined
        ? (patch.notifyPaymentReceived ? 1 : 0)
        : current.notifyPaymentReceived,
    vatRegistered: patch.vatRegistered ?? current.vatRegistered,
    vatRegistrationNo:
      patch.vatRegistrationNo !== undefined ? patch.vatRegistrationNo || null : current.vatRegistrationNo,
    ssclRegistered: patch.ssclRegistered ?? current.ssclRegistered,
    createdAt: current.createdAt,
    updatedAt,
  };
  const db = getDb(d1);
  await db
    .insert(supplierSettings)
    .values(next)
    .onConflictDoUpdate({ target: supplierSettings.supplierId, set: next });
  return toShape(next);
}
