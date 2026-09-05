import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { supplierMembers } from '@vyro/db/schema';

export async function requireSupplierMember(
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
  if (!m || !['owner', 'manager', 'sales'].includes(m.role)) {
    throw new Error('FORBIDDEN');
  }
}
