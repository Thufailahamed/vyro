import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businessMembers, supplierMembers } from '@vyro/db/schema';

export const BUSINESS_PAYMENT_ROLES = ['owner', 'purchasing'] as const;
export const SUPPLIER_CONFIRM_ROLES = ['owner', 'sales'] as const;

export async function requireBusinessPaymentRole(
  d1: D1Database,
  businessId: string,
  userId: string,
): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: businessMembers.role })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.userId, userId)))
    .get();
  if (!m || !BUSINESS_PAYMENT_ROLES.includes(m.role as (typeof BUSINESS_PAYMENT_ROLES)[number])) {
    throw new Error('FORBIDDEN');
  }
}

export async function requireSupplierConfirmRole(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  if (!m || !SUPPLIER_CONFIRM_ROLES.includes(m.role as (typeof SUPPLIER_CONFIRM_ROLES)[number])) {
    throw new Error('FORBIDDEN');
  }
}

export async function isSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<boolean> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(and(eq(supplierMembers.supplierId, supplierId), eq(supplierMembers.userId, userId)))
    .get();
  return !!m;
}
