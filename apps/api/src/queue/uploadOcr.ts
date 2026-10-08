import type { MessageBatch } from '@cloudflare/workers-types';
import type { Env } from '../env';
import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';
import { processUploadSession } from '../modules/ai/productUpload/pipeline';

/**
 * PRODUCT_UPLOADS_QUEUE consumer. Mirrors invoiceOcr: the session row itself
 * is the retry surface (failed status + reason; re-upload from the web UI),
 * so every message is acked.
 */
export async function handleUploadsBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const t0 = Date.now();
    recordQueueMetric(env, 'queue.consume.start', 'uploads', 0);
    const body = msg.body as { sessionId?: string } | null;
    if (!body?.sessionId) {
      recordQueueMetric(env, 'queue.ack', 'uploads', Date.now() - t0);
      msg.ack();
      continue;
    }
    try {
      await processUploadSession(env, body.sessionId);
      recordQueueMetric(env, 'queue.ack', 'uploads', Date.now() - t0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'pipeline failed';
      await recordQueueEvent(env, 'uploads', 'retry', msg.id, body, message);
      recordQueueMetric(env, 'queue.retry', 'uploads', Date.now() - t0);
    }
    msg.ack();
  }
}
