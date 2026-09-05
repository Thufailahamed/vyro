import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { AdminRole } from '@vyro/auth';

export async function getAdminUser(d1: D1Database, id: string) {
  const db = getDb(d1);
  return db
    .select({ id: users.id, adminRole: users.adminRole })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

export async function setAdminRole(
  d1: D1Database,
  id: string,
  expectedRole: AdminRole | null,
  newRole: AdminRole | null,
): Promise<number> {
  const db = getDb(d1);
  // optimistic concurrency: WHERE id = ? AND admin_role IS ?expected
  const result = await db
    .update(users)
    .set({ adminRole: newRole, updatedAt: Date.now() })
    .where(
      expectedRole === null
        ? and(eq(users.id, id), isNull(users.adminRole))
        : and(eq(users.id, id), eq(users.adminRole, expectedRole)),
    )
    .run();
  return (result as { rowsAffected?: number }).rowsAffected ?? 0;
}

export async function countSuperAdmins(d1: D1Database): Promise<number> {
  const db = getDb(d1);
  const row = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.adminRole, 'super_admin'))
    .all();
  return row.length;
}

export async function listAdmins(d1: D1Database) {
  const db = getDb(d1);
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      adminRole: users.adminRole,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNotNull(users.adminRole))
    .all();
}
