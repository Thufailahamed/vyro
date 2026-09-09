import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import type { AdminRole } from '@vyro/auth';
import type { Env } from '../../../../env';

export async function run(env: Env, id: string, role: AdminRole): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ adminRole: users.adminRole }).from(users).where(eq(users.id, id)).get();
  if (!row) throw Object.assign(new Error('user not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.adminRole === role) return 'noop';
  await db.update(users).set({ adminRole: role, updatedAt: Date.now() }).where(eq(users.id, id)).run();
  return 'ok';
}
