import type { Env } from '../env';
import { getDb } from '@vyro/db';
import { queueEvents } from '@vyro/db/schema';

export type QueueName = 'audit' | 'notifications' | 'invoices';
export type QueueEventKind = 'retry' | 'dlq' | 'manual';
export type QueueMetricName =
  | 'queue.consume.start'
  | 'queue.ack'
  | 'queue.retry'
  | 'queue.dlq'
  | 'queue.enqueue';

const EVENT_TYPE_FOR: Record<QueueMetricName, string> = {
  'queue.consume.start': 'consume',
  'queue.ack': 'ack',
  'queue.retry': 'retry',
  'queue.dlq': 'dlq',
  'queue.enqueue': 'enqueue',
};

const MAX_PAYLOAD_BYTES = 8192;

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

export function recordQueueMetric(
  env: Env,
  name: QueueMetricName,
  queue: QueueName,
  latencyMs: number,
): void {
  if (!env.METRICS) return;
  try {
    env.METRICS.writeDataPoint({
      blobs: [name, queue, EVENT_TYPE_FOR[name]],
      doubles: [latencyMs],
      indexes: [queue],
    });
  } catch {
    // best-effort
  }
}

export async function recordQueueEvent(
  env: Env,
  queue: QueueName,
  event: QueueEventKind,
  msgId: string,
  payload: unknown,
  error?: string,
  actorUserId?: string,
): Promise<void> {
  try {
    const db = getDb(env.DB);
    let payloadJson: string | null = null;
    if (payload !== undefined) {
      payloadJson = JSON.stringify(payload);
      if (payloadJson.length > MAX_PAYLOAD_BYTES) {
        payloadJson = payloadJson.slice(0, MAX_PAYLOAD_BYTES);
      }
    }
    await db
      .insert(queueEvents)
      .values({
        id: ulid(),
        queue,
        msgId,
        event,
        actorUserId: actorUserId ?? null,
        payloadJson,
        error: error ?? null,
        createdAt: Date.now(),
      })
      .onConflictDoNothing({ target: queueEvents.id });
  } catch {
    // never throw from instrumentation
  }
}