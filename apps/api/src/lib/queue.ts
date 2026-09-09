import type { Env } from '../env';
import { recordQueueMetric, type QueueName } from './queueInstrument';

const BINDING = {
  audit: 'AUDIT_QUEUE',
  notifications: 'NOTIFICATIONS_QUEUE',
  invoices: 'INVOICES_QUEUE',
} as const satisfies Record<QueueName, keyof Pick<Env, 'AUDIT_QUEUE' | 'NOTIFICATIONS_QUEUE' | 'INVOICES_QUEUE'>>;

export async function queueSend(env: Env, queue: QueueName, payload: unknown): Promise<void> {
  await (env[BINDING[queue]] as Queue).send(payload as any);
  recordQueueMetric(env, 'queue.enqueue', queue, 0);
}