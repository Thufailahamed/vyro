import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierMembers } from '@vyro/db/schema';
import { SUPPLIER_ROLES } from '@vyro/auth';

export async function requireSupplierMember(
  d1: D1Database,
  supplierId: string,
  userId: string,
): Promise<void> {
  const db = getDb(d1);
  const m = await db
    .select({ role: supplierMembers.role })
    .from(supplierMembers)
    .where(
      and(
        eq(supplierMembers.supplierId, supplierId),
        eq(supplierMembers.userId, userId),
        eq(supplierMembers.status, 'active'),
      ),
    )
    .get();
  if (!m || !SUPPLIER_ROLES.includes(m.role as (typeof SUPPLIER_ROLES)[number])) {
    throw new Error('FORBIDDEN');
  }
}
