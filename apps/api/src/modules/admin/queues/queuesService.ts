import type { Env } from '../../../env';
import { getDb } from '@vyro/db';
import { queueEvents } from '@vyro/db/schema';
import {
  recordQueueEvent,
  type QueueName,
  type QueueEventKind,
} from '../../../lib/queueInstrument';
import {
  listQueueEvents,
  getQueueEvent,
  type QueueEventRow,
} from './queuesRepository';
import {
  queryQueueHealth,
  queryThroughput,
  type QueueHealth,
  type ThroughputPoint,
} from './aeQueries';

export { type QueueHealth, type ThroughputPoint };

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

function bindingFor(queue: QueueName): 'AUDIT_QUEUE' | 'NOTIFICATIONS_QUEUE' | 'INVOICES_QUEUE' {
  return ({ audit: 'AUDIT_QUEUE', notifications: 'NOTIFICATIONS_QUEUE', invoices: 'INVOICES_QUEUE' } as const)[queue];
}

export async function getHealth(env: Env): Promise<QueueHealth[]> {
  return queryQueueHealth(env);
}

export async function getThroughput(env: Env): Promise<ThroughputPoint[]> {
  return queryThroughput(env);
}

export async function listEvents(
  env: Env,
  params: { queue?: QueueName; event?: QueueEventKind; limit?: number; before?: number },
): Promise<QueueEventRow[]> {
  return listQueueEvents(getDb(env.DB), params);
}

export async function manualEnqueue(
  env: Env,
  queue: QueueName,
  payload: unknown,
  actorUserId: string,
): Promise<{ msgId: string; eventId: string }> {
  const sendRes = await (env[bindingFor(queue)] as Queue).send(payload as any);
  const msgId = (sendRes as { id?: string })?.id ?? ulid();
  const eventId = ulid();
  const payloadJson = payload === undefined ? null : JSON.stringify(payload).slice(0, 8192);
  await getDb(env.DB)
    .insert(queueEvents)
    .values({
      id: eventId,
      queue,
      msgId,
      event: 'manual',
      actorUserId,
      payloadJson,
      error: null,
      createdAt: Date.now(),
    })
    .onConflictDoNothing({ target: queueEvents.id });
  return { msgId, eventId };
}

export async function retryEvent(
  env: Env,
  eventId: string,
  editedPayload: unknown,
  actorUserId: string,
): Promise<{ newMsgId: string }> {
  const row = await getQueueEvent(getDb(env.DB), eventId);
  if (!row) {
    const err = new Error('Queue event not found');
    (err as { code?: string }).code = 'NOT_FOUND';
    throw err;
  }
  const payload =
    editedPayload !== undefined
      ? editedPayload
      : row.payloadJson
        ? JSON.parse(row.payloadJson)
        : {};
  const sendRes = await (env[bindingFor(row.queue)] as Queue).send(payload as any);
  const newMsgId = (sendRes as { id?: string })?.id ?? ulid();
  await recordQueueEvent(env, row.queue, 'manual', newMsgId, payload, undefined, actorUserId);
  return { newMsgId };
}

export async function retryBulk(
  env: Env,
  eventIds: string[],
  editedPayload: unknown | undefined,
  actorUserId: string,
): Promise<{ replayed: number; failed: string[] }> {
  const failed: string[] = [];
  let replayed = 0;
  for (const id of eventIds) {
    try {
      await retryEvent(env, id, editedPayload, actorUserId);
      replayed++;
    } catch {
      failed.push(id);
    }
  }
  return { replayed, failed };
}