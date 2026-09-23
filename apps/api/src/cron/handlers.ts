import { getDb } from '@vyro/db';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { queueEvents, refunds } from '@vyro/db/schema';
import type { Env } from '../env';
import { processDeliveries } from '../lib/webhooks';
import { isFeatureEnabled } from '../lib/featureFlags';
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

/**
 * Weekly refresh of the KV-cached sanctions country list. Fetches OFAC +
 * UN sources, dedupes ISO codes, replaces the KV entry. Runs on the
 * scheduled cron (see worker.ts); manual trigger via admin cron endpoint.
 */
export async function handleSanctionsRefresh(env: Env): Promise<{ refreshed: boolean; count: number }> {
  try {
    const { refreshSanctionsList } = await import('../modules/cross-border/sanctions');
    const count = await refreshSanctionsList(env);
    return { refreshed: true, count };
  } catch (e) {
    console.error('[cron] sanctions-refresh failed:', e);
    return { refreshed: false, count: 0 };
  }
}

/**
 * Nightly FX rate refresh. Writes latest LKR→{USD,EUR,GBP,INR,AED,SGD,AUD}
 * rates to KV with 1h TTL. Manual trigger via admin cron endpoint.
 */
export async function handleFxRefresh(env: Env): Promise<{ refreshed: number }> {
  const { fetchRate } = await import('../lib/fxProvider');
  const QUOTE_CCY = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD'] as const;
  let count = 0;
  for (const quote of QUOTE_CCY) {
    try {
      const r = await fetchRate('LKR', quote, env);
      if (r) {
        await env.CROSS_BORDER_KV.put(`fx:LKR:${quote}`, r.rateScaled, { expirationTtl: 3600 });
        count++;
      }
    } catch (e) {
      console.warn('[cron] fx-refresh failed for', quote, e);
    }
  }
  return { refreshed: count };
}

/**
 * Sponsored listings expire sweep.
 * - approved → live when startsAt <= now
 * - live → expired when endsAt < now
 * - approved → expired when endsAt < now (paid but never displayed)
 * - cleanup sponsored_events older than 7 days
 *
 * Runs hourly.
 */
export async function handleSponsoredExpireSweep(env: Env): Promise<{
  flippedToLive: number;
  flippedToExpired: number;
  cleanedEvents: number;
}> {
  const { sponsoredExpireSweep } = await import('../modules/sponsored/cron');
  const result = await sponsoredExpireSweep(env.DB, Math.floor(Date.now() / 1000));
  return result;
}

/**
 * Trust Signals: rebuild cached supplier_trust_signals for every supplier.
 * Runs hourly at HH:13 (offset from sponsored's HH:00 to spread load).
 */
export async function handleTrustSignalsRebuild(env: Env): Promise<{ rebuilt: number; failed: number }> {
  const { trustSignalsRebuild } = await import('../modules/trust/cron');
  return trustSignalsRebuild(env);
}

export type WeeklyPayoutBatchResult =
  | { skipped: true }
  | {
      processed: number;
      errors: number;
      periodStart: number;
      periodEnd: number;
      perSupplier: Array<{
        supplierId: string;
        status: 'created' | 'duplicate' | 'empty' | 'error';
        message?: string;
      }>;
    };

/**
 * Weekly payout batch cron (Fix C — P0 revenue sweep).
 *
 * Period: windowEnd → windowEnd - 7d. Worker registration uses cron string
 * '30 21 * * 4' UTC = Friday 03:00 SL local. Iterates suppliers with at
 * least one confirmed payment in the window and creates one payout row per
 * supplier via the existing repository path. Idempotent: duplicates are
 * rejected by payouts_period_uq on (supplier_id, period_start, period_end)
 * and recorded as 'duplicate' rather than 'error'. Suppliers with zero
 * eligible payments in the window are skipped without error.
 *
 * Gated on the `PAYOUTS_CRON_ENABLED` feature flag (defaults off). When the
 * flag is off the cron is a no-op so admins can preview before flipping.
 */
export async function handleWeeklyPayoutBatch(
  env: Env,
  opts: { nowMs?: number; periodStart?: number; periodEnd?: number } = {},
): Promise<WeeklyPayoutBatchResult> {
  if (!(await isFeatureEnabled(env.DB, 'PAYOUTS_CRON_ENABLED'))) {
    return { skipped: true };
  }

  const nowMs = opts.nowMs ?? Date.now();
  const periodEnd = opts.periodEnd ?? nowMs;
  const periodStart = opts.periodStart ?? periodEnd - 7 * 24 * 60 * 60 * 1000;

  const { listSuppliersWithConfirmedPaymentsSince, aggregatePayableForSupplier, createPayout } =
    await import('../modules/payouts/repository');
  const { readSupplierSettingsForSystem } = await import('../modules/settings/supplierRepository');

  const suppliers = await listSuppliersWithConfirmedPaymentsSince(env.DB, periodStart);
  const perSupplier: Array<{
    supplierId: string;
    status: 'created' | 'duplicate' | 'empty' | 'error';
    message?: string;
  }> = [];
  let processed = 0;
  let errors = 0;

  for (const s of suppliers) {
    try {
      const aggregate = await aggregatePayableForSupplier(env.DB, {
        supplierId: s.supplierId,
        periodStart,
        periodEnd,
      });
      if (aggregate.paymentCount === 0) {
        perSupplier.push({ supplierId: s.supplierId, status: 'empty' });
        continue;
      }
      // System read: the membership-checked getter would 404 for the cron actor.
      const settings = await readSupplierSettingsForSystem(env.DB, s.supplierId);
      const method = (settings?.payoutMethod ?? 'bank') as 'bank' | 'cash';
      try {
        await createPayout(env.DB, {
          supplierId: s.supplierId,
          amountCents: aggregate.amountCents,
          feeCents: aggregate.feeCents,
          netCents: aggregate.netCents,
          currency: 'LKR',
          periodStart,
          periodEnd,
          method,
        });
        processed++;
        perSupplier.push({ supplierId: s.supplierId, status: 'created' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/UNIQUE|payouts_period_uq/.test(msg)) {
          perSupplier.push({ supplierId: s.supplierId, status: 'duplicate' });
        } else {
          errors++;
          perSupplier.push({ supplierId: s.supplierId, status: 'error', message: msg });
        }
      }
    } catch (e) {
      errors++;
      const msg = e instanceof Error ? e.message : String(e);
      perSupplier.push({ supplierId: s.supplierId, status: 'error', message: msg });
    }
  }

  return { processed, errors, periodStart, periodEnd, perSupplier };
}
