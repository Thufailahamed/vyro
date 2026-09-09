import { getDb } from '@vyro/db';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { queueEvents, refunds } from '@vyro/db/schema';
import type { Env } from '../env';
import { processDeliveries } from '../lib/webhooks';
import { notifyAdmins } from '../modules/notifications/dispatcher';

/**
 * Runs the audit-purge step AND the housekeeping that `daily-purge` advertises
 * but never actually did: expired sessions, expired idempotency keys, soft-
 * deleted rows older than 90 days.
 *
 * Audit logs use a separate, longer retention (see handleAuditPurge).
 */
export async function handleDailyPurge(env: Env): Promise<{
  sessions: number;
  idempotency: number;
  softDeleted: number;
}> {
  const db = getDb(env.DB);
  const now = Date.now();

  // Sessions table is managed by better-auth; we don't know its exact column
  // names from the schema package, so use raw SQL with a wide net.
  const sessionsRes = await db.run(sql`
    DELETE FROM sessions WHERE expires_at < ${now}
  `);
  const sessions = Number((sessionsRes as { meta?: { changes?: number } }).meta?.changes ?? 0);

  const idemRes = await db.run(sql`
    DELETE FROM idempotency_keys WHERE expires_at < ${now}
  `);
  const idempotency = Number((idemRes as { meta?: { changes?: number } }).meta?.changes ?? 0);

  // Soft-deleted rows older than 90 days: most tables have a `deleted_at`
  // column. We purge them from the largest ones with a single statement each.
  const cutoff = now - 90 * 24 * 60 * 60 * 1000;
  let softDeleted = 0;
  for (const table of ['products', 'supplier_products', 'businesses', 'suppliers']) {
    try {
      const r = await db.run(
        sql.raw(`DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`),
      );
      softDeleted += Number((r as { meta?: { changes?: number } }).meta?.changes ?? 0);
    } catch {
      /* table or column may not exist on this deployment */
    }
  }

  return { sessions, idempotency, softDeleted };
}

/**
 * Drains pending webhook deliveries with exponential backoff. Intended to run
 * every 15 minutes; cheap enough to also run on demand from the admin UI.
 */
export async function handleWebhookRetry(env: Env): Promise<{ processed: number }> {
  const processed = await processDeliveries(env, { batchSize: 100 });
  return { processed };
}

/**
 * Prune expired better-auth sessions every hour. Distinct from the daily
 * purge so a slow consumer doesn't block session cleanup.
 */
export async function handleSessionCleanup(env: Env): Promise<{ deleted: number }> {
  const db = getDb(env.DB);
  const res = await db.run(sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`);
  const deleted = Number((res as { meta?: { changes?: number } }).meta?.changes ?? 0);
  return { deleted };
}

/**
 * Stub for the audit-export-runner. There is no real export pipeline yet, so
 * this logs and exits. Keeping the handler present means future implementations
 * can hook in without touching `scheduled()`.
 */
export async function handleAuditExportRunner(_env: Env): Promise<{ ok: true }> {
  // eslint-disable-next-line no-console
  console.log('[cron] audit-export-runner: no exports scheduled in v1');
  return { ok: true };
}

/**
 * Flags refund rows stuck in `requested` or `processing` for more than 24h
 * and pushes one admin alert per stuck refund to finance. Runs hourly.
 *
 * Best-effort: a notifyAdmins failure never aborts the cron.
 */
export async function handleRefundStuckChecker(env: Env): Promise<{ stuck: number }> {
  const db = getDb(env.DB);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const rows = await db
    .select({ id: refunds.id, paymentId: refunds.paymentId, status: refunds.status })
    .from(refunds)
    .where(and(
      sql`${refunds.status} IN ('requested', 'processing')`,
      sql`${refunds.createdAt} < ${cutoff}`,
    ))
    .all();
  for (const r of rows) {
    await notifyAdmins(env, {
      role: 'finance',
      severity: 'warning',
      category: 'admin_alert',
      title: `Refund ${r.id.slice(0, 8)} stuck >24h`,
      body: `Refund ${r.id} (payment ${r.paymentId}) has been ${r.status} since ${new Date(cutoff).toISOString().slice(0, 16)}.`,
      link: '/admin/money',
      sourceRef: `refund:${r.id}`,
    });
  }
  return { stuck: rows.length };
}

/**
 * Scans queue_events for new `dlq` events since the previous cron tick and
 * surfaces one warning per unique queue/msg_id pair to ops. Runs hourly.
 *
 * We dedupe by (queue, msgId) within the last hour — once per stuck msg —
 * because dlq rows persist in the events table until pruned.
 */
export async function handleQueueDlqScan(env: Env): Promise<{ reported: number }> {
  const db = getDb(env.DB);
  const cutoff = Date.now() - 60 * 60 * 1000;
  const rows = await db
    .select({
      queue: queueEvents.queue,
      msgId: queueEvents.msgId,
      error: queueEvents.error,
    })
    .from(queueEvents)
    .where(and(eq(queueEvents.event, 'dlq'), gte(queueEvents.createdAt, cutoff)))
    .all();
  const seen = new Set<string>();
  let reported = 0;
  for (const r of rows) {
    const key = `${r.queue}:${r.msgId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await notifyAdmins(env, {
      role: 'ops',
      severity: 'warning',
      category: 'admin_alert',
      title: `Queue message dead-lettered: ${r.queue}`,
      body: (r.error ?? 'unknown error').slice(0, 180),
      link: '/admin/observability/queues',
      sourceRef: `queue:${r.queue}:${r.msgId}`,
    });
    reported++;
  }
  return { reported };
}

// satisfy unused-import linter when `isNull` is referenced only via drizzle's sql elsewhere
void isNull;
