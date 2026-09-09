import type { MessageBatch } from '@cloudflare/workers-types';
import { getDb } from '@vyro/db';
import { invoiceUploads, suppliers } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { runOcr } from '../modules/documents/ocrWorker';
import type { Env } from '../env';
import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';

/**
 * INVOICES_QUEUE consumer. Marks row 'processing', reads from R2, calls the
 * OCR worker, writes back confidence + extracted JSON. Acks always (the row
 * itself is the retry surface: re-enqueue from `/documents/:id/requeue` if
 * needed later). Never loops forever on bad input.
 */
export async function handleInvoicesBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const t0 = Date.now();
    recordQueueMetric(env, 'queue.consume.start', 'invoices', 0);
    const body = msg.body as { uploadId?: string } | null;
    if (!body?.uploadId) {
      recordQueueMetric(env, 'queue.ack', 'invoices', Date.now() - t0);
      msg.ack();
      continue;
    }
    try {
      await processUpload(env, body.uploadId);
      recordQueueMetric(env, 'queue.ack', 'invoices', Date.now() - t0);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ocr failed';
      await recordQueueEvent(env, 'invoices', 'retry', msg.id, body, message);
      recordQueueMetric(env, 'queue.retry', 'invoices', Date.now() - t0);
      await markFailed(env, body.uploadId, message);
    }
    msg.ack();
  }
}

async function processUpload(env: Env, uploadId: string): Promise<void> {
  const db = getDb(env.DB);
  const row = await db.select().from(invoiceUploads).where(eq(invoiceUploads.id, uploadId)).get();
  if (!row) return;
  await db.update(invoiceUploads).set({ status: 'processing' }).where(eq(invoiceUploads.id, uploadId));

  const obj = await env.INVOICES.get(row.r2Key);
  if (!obj) throw new Error('R2 object missing');
  const bytes = new Uint8Array(await obj.arrayBuffer());

  const result = await runOcr({ env, bytes, mimeType: row.mimeType });
  const newStatus = result.confidence < 60 ? 'manual_required' : 'ready';

  let supplierId: string | null = row.supplierId ?? null;
  if (!supplierId && result.supplierName) {
    const all = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).all();
    const lower = result.supplierName.toLowerCase();
    const hit = all.find((s) => s.name.toLowerCase() === lower);
    if (hit) supplierId = hit.id;
  }

  await db
    .update(invoiceUploads)
    .set({
      status: newStatus,
      ocrProvider: result.rawProvider,
      ocrConfidence: result.confidence,
      rawExtractionJson: JSON.stringify(result),
      supplierId,
      totalCents: result.totalCents ?? null,
    })
    .where(eq(invoiceUploads.id, uploadId));
}

async function markFailed(env: Env, uploadId: string, message: string): Promise<void> {
  await getDb(env.DB)
    .update(invoiceUploads)
    .set({ status: 'failed', errorMessage: message.slice(0, 500) })
    .where(eq(invoiceUploads.id, uploadId));
}
