import { getDb } from '@vyro/db';
import { lt } from 'drizzle-orm';
import { queueEvents } from '@vyro/db/schema';
import type { Env } from '../env';

export async function handleQueueEventsPrune(env: Env): Promise<{ deleted: number }> {
  const days = Number(env.QUEUE_EVENTS_RETENTION_DAYS ?? '7');
  const cutoff = Date.now() - days * 86_400_000;
  const db = getDb(env.DB);
  const result = await db.delete(queueEvents).where(lt(queueEvents.createdAt, cutoff)).run();
  const deleted = Number((result as { meta?: { changes?: number } }).meta?.changes ?? (result as { changes?: number }).changes ?? 0);
  // eslint-disable-next-line no-console
  console.log('[queue-events-prune] deleted', deleted);
  return { deleted };
}