import { eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses } from '@vyro/db/schema';
import type { Env } from '../../../../env';

export async function run(env: Env, id: string): Promise<'ok' | 'noop'> {
  const db = getDb(env.DB);
  const row = await db.select({ status: businesses.status }).from(businesses).where(eq(businesses.id, id)).get();
  if (!row) throw Object.assign(new Error('business not found'), { code: 'NOT_FOUND', status: 404 });
  if (row.status !== 'suspended') return 'noop';
  await db.update(businesses).set({ status: 'active', updatedAt: Date.now() }).where(eq(businesses.id, id)).run();
  return 'ok';
}
