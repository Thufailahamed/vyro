import type { Env } from '../env';
import { recordQueueMetric, type QueueName } from './queueInstrument';

const BINDING = {
  audit: 'AUDIT_QUEUE',
  notifications: 'NOTIFICATIONS_QUEUE',
  invoices: 'INVOICES_QUEUE',
} as const satisfies Record<QueueName, keyof Pick<Env, 'AUDIT_QUEUE' | 'NOTIFICATIONS_QUEUE' | 'INVOICES_QUEUE'>>;

export async function queueSend(env: Env, queue: QueueName, payload: unknown): Promise<void> {
  const binding = env[BINDING[queue]] as Queue | undefined;
  if (!binding) {
    // Queues are optional in dev/preview. Callers that require delivery
    // (e.g. document OCR) handle the missing-queue case explicitly;
    // fire-and-forget notifications must never crash the request.
    if (queue === 'invoices') {
      throw new Error(`Queue binding ${BINDING[queue]} is not configured`);
    }
    console.warn(`[queue] ${BINDING[queue]} unbound — dropping ${queue} message`);
    return;
  }
  await binding.send(payload as any);
  recordQueueMetric(env, 'queue.enqueue', queue, 0);
}