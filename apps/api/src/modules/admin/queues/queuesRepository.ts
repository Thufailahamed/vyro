import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import { queueEvents } from '@vyro/db/schema';
import type { QueueName, QueueEventKind } from '../../../lib/queueInstrument';

export type QueueEventRow = {
  id: string;
  queue: QueueName;
  msgId: string;
  event: QueueEventKind;
  actorUserId: string | null;
  payloadJson: string | null;
  error: string | null;
  createdAt: number;
};

type DrizzleDb = any;

export async function listQueueEvents(
  db: DrizzleDb,
  params: { queue?: QueueName; event?: QueueEventKind; limit?: number; before?: number },
): Promise<QueueEventRow[]> {
  const conds: SQL[] = [];
  if (params.queue) conds.push(eq(queueEvents.queue, params.queue));
  if (params.event) conds.push(eq(queueEvents.event, params.event));
  if (params.before) conds.push(lt(queueEvents.createdAt, params.before));
  const base = db.select().from(queueEvents);
  const rows = conds.length
    ? await base.where(and(...conds)).orderBy(desc(queueEvents.createdAt)).limit(params.limit ?? 50).all()
    : await base.orderBy(desc(queueEvents.createdAt)).limit(params.limit ?? 50).all();
  return rows as QueueEventRow[];
}

export async function getQueueEvent(db: DrizzleDb, id: string): Promise<QueueEventRow | null> {
  const row = await db.select().from(queueEvents).where(eq(queueEvents.id, id)).get();
  return (row ?? null) as QueueEventRow | null;
}

export async function pruneQueueEvents(db: DrizzleDb, cutoffMs: number): Promise<number> {
  const result = await db.delete(queueEvents).where(lt(queueEvents.createdAt, cutoffMs)).run();
  return (result as { changes?: number }).changes ?? 0;
}