import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import { httpError } from '../../lib/errors';

export async function ensureEmailAvailable(d1: D1Database, email: string): Promise<void> {
  const db = getDb(d1);
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .get();
  if (existing) throw httpError(409, 'CONFLICT', 'Email already in use');
}
