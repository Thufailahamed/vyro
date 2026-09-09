import type { MessageBatch } from '@cloudflare/workers-types';
import { getDb } from '@vyro/db';
import { auditLogs } from '@vyro/db/schema';
import type { Env } from '../env';
import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';

/**
 * AUDIT_QUEUE consumer.
 *
 * Producers (see apps/api/src/modules/cspReport/repository.ts) send
 * `{ id, action, resourceType, resourceId, actorUserId, metadata, ip, userAgent, createdAt }`.
 * We persist each message as an `audit_logs` row. Idempotent on `id`
 * (collisions silently skipped via INSERT OR IGNORE on D1).
 */
export async function handleAuditBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  const db = getDb(env.DB);
  for (const msg of batch.messages) {
    const t0 = Date.now();
    recordQueueMetric(env, 'queue.consume.start', 'audit', 0);
    const body = msg.body as Partial<{
      id: string;
      action: string;
      resourceType: string;
      resourceId: string;
      actorUserId: string | null;
      metadata: string | null;
      ip: string | null;
      userAgent: string | null;
      createdAt: number;
    }> | null;
    if (!body || typeof body !== 'object') {
      msg.ack();
      continue;
    }
    const id = body.id ?? msg.id;
    const action = body.action;
    const resourceType = body.resourceType;
    const resourceId = body.resourceId;
    if (typeof action !== 'string' || typeof resourceType !== 'string' || typeof resourceId !== 'string') {
      // Malformed — ack to drop, never retry malformed.
      msg.ack();
      continue;
    }
    try {
      await db
        .insert(auditLogs)
        .values({
          id,
          actorUserId: body.actorUserId ?? null,
          action,
          resourceType,
          resourceId,
          metadata: body.metadata ?? null,
          ip: body.ip ?? null,
          userAgent: body.userAgent ?? null,
          createdAt: body.createdAt ?? Date.now(),
        })
        .onConflictDoNothing({ target: auditLogs.id });
      recordQueueMetric(env, 'queue.ack', 'audit', Date.now() - t0);
      msg.ack();
    } catch (err) {
      // Retry by leaving un-acked; Cloudflare will re-deliver.
      await recordQueueEvent(env, 'audit', 'retry', msg.id, body, err instanceof Error ? err.message : String(err));
      recordQueueMetric(env, 'queue.retry', 'audit', Date.now() - t0);
      msg.retry({ delaySeconds: 30 });
      // eslint-disable-next-line no-console
      console.error('[queue:audit] persist failed', { id, err });
    }
  }
}
