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
  companyName?: string | undefined;
  registrationNo?: string | undefined;
  taxId?: string | undefined;
  contactEmail?: string | undefined;
  contactPhone?: string | undefined;
  warehouseAddress?: string | undefined;
  warehouseCity?: string | undefined;
  warehouseDistrict?: string | undefined;
  warehouseLat?: number | undefined;
  warehouseLng?: number | undefined;
  defaultLeadTimeDays?: number | undefined;
  payoutMethod?: 'bank' | 'cash' | undefined;
  bankName?: string | undefined;
  bankAccountNo?: string | undefined;
  bankBranch?: string | undefined;
  bankAccountHolder?: string | undefined;
  notifyNewOrders?: boolean | undefined;
  notifyLowStock?: boolean | undefined;
  notifyPaymentReceived?: boolean | undefined;
  vatRegistered?: boolean | undefined;
  vatRegistrationNo?: string | null | undefined;
  ssclRegistered?: boolean | undefined;
};

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
  if (!member || !['owner', 'manager'].includes(member.role)) {
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
  const next: SupplierSetting = {
    supplierId,
    companyName: patch.companyName ?? current.companyName,
    registrationNo: patch.registrationNo ?? current.registrationNo,
    taxId: patch.taxId ?? current.taxId,
    contactEmail: patch.contactEmail ?? current.contactEmail,
    contactPhone: patch.contactPhone ?? current.contactPhone,
    warehouseAddress: patch.warehouseAddress ?? current.warehouseAddress,
    warehouseCity: patch.warehouseCity ?? current.warehouseCity,
    warehouseDistrict: patch.warehouseDistrict ?? current.warehouseDistrict,
    warehouseLat: patch.warehouseLat ?? current.warehouseLat,
    warehouseLng: patch.warehouseLng ?? current.warehouseLng,
    defaultLeadTimeDays: patch.defaultLeadTimeDays ?? current.defaultLeadTimeDays,
    payoutMethod: patch.payoutMethod ?? current.payoutMethod,
    bankName: patch.bankName ?? current.bankName,
    bankAccountNo: patch.bankAccountNo ?? current.bankAccountNo,
    bankBranch: patch.bankBranch ?? current.bankBranch,
    bankAccountHolder: patch.bankAccountHolder ?? current.bankAccountHolder,
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
