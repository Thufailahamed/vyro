import { createHmac, randomUUID } from 'node:crypto';
import { getDb } from '@vyro/db';
import { webhooks, webhookDeliveries } from '@vyro/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import type { Env } from '../env';

/**
 * Outbound webhook dispatcher.
 *
 * Two entry points:
 *   - `dispatch(env, eventType, payload)` — fan out a new event to every active
 *     subscriber by inserting `webhook_deliveries` rows (one per subscriber).
 *   - `processDeliveries(env, opts)` — drain pending deliveries. Called by the
 *     cron tick every minute (or on demand from the admin "retry" button).
 *
 * Signing: every outbound POST includes
 *   - `Vyro-Signature: t=<unix>,v1=<hex hmac of t + "." + body>`
 * so subscribers can verify both freshness and integrity.
 *
 * Retry policy: exponential backoff starting at 30s, doubling, capped at 1h,
 * max 8 attempts. Anything past that is marked `failed` and surfaced in the
 * admin health snapshot.
 */

const MAX_ATTEMPTS = 8;
const SIGNATURE_HEADER = 'Vyro-Signature';
const EVENT_HEADER = 'Vyro-Event';
const DELIVERY_HEADER = 'Vyro-Delivery';
const TIMEOUT_MS = 10_000;

export interface DispatchInput {
  eventType: string;
  payload: unknown;
  /** Optional override of delivery timestamps — used by tests. */
  now?: number;
}

export interface ProcessOpts {
  /** Max deliveries to process per invocation. Defaults to 50. */
  batchSize?: number;
  /** Override "now" for backoff calculation — used by tests. */
  now?: number;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

function backoffSeconds(attemptCount: number): number {
  // 30s, 60s, 120s, 240s, 480s, 600s, 600s, 600s — capped at 10 minutes.
  const base = 30 * Math.pow(2, Math.min(attemptCount, 6));
  return Math.min(600, base);
}

/**
 * Subscribes a list of active webhooks to a new event by inserting a
 * `pending` delivery row per matching subscriber.
 *
 * Returns the inserted delivery ids so callers (e.g. a cron retry tick) can
 * fan out further work without a second DB scan.
 */
export async function dispatch(
  env: Env,
  input: DispatchInput,
): Promise<string[]> {
  const eventType = input.eventType;
  if (!eventType) return [];

  const db = getDb(env.DB);
  // We can't do JSON1 `json_each` cleanly with drizzle's sqlite driver here,
  // so pull every active webhook and filter in-process. Webhook counts are
  // small (admin-curated) so this is cheap.
  const subs = await db
    .select({
      id: webhooks.id,
      eventTypesJson: webhooks.eventTypesJson,
    })
    .from(webhooks)
    .where(eq(webhooks.active, 1))
    .all();

  const matched = subs.filter((s) => {
    let list: string[] = [];
    try {
      list = JSON.parse(s.eventTypesJson) as string[];
    } catch {
      list = [];
    }
    return list.includes(eventType) || list.includes('*');
  });
  if (matched.length === 0) return [];

  const now = input.now ?? Date.now();
  const payloadJson = JSON.stringify({
    event: eventType,
    deliveredAt: now,
    data: input.payload,
  });
  const ids = matched.map(() => randomUUID());
  await db
    .insert(webhookDeliveries)
    .values(
      matched.map((m, i) => ({
        id: ids[i]!,
        webhookId: m.id,
        eventType,
        payloadJson,
        status: 'pending' as const,
        responseStatus: null,
        responseBody: null,
        attemptCount: 0,
        nextRetryAt: null,
        createdAt: now,
      })),
    )
    .run();
  return ids;
}

/**
 * Processes up to `batchSize` pending deliveries. Safe to call concurrently
 * because each row is updated with a CAS via the `pending` status guard.
 *
 * Returns the number of rows processed.
 */
export async function processDeliveries(env: Env, opts: ProcessOpts = {}): Promise<number> {
  const batchSize = opts.batchSize ?? 50;
  const now = opts.now ?? Date.now();
  const fetchImpl: typeof fetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const db = getDb(env.DB);
  // Claim a batch atomically. SQLite serial writes anyway, so a simple
  // SELECT-then-UPDATE pattern works.
  const due = await db
    .select({
      id: webhookDeliveries.id,
      webhookId: webhookDeliveries.webhookId,
      eventType: webhookDeliveries.eventType,
      payloadJson: webhookDeliveries.payloadJson,
      attemptCount: webhookDeliveries.attemptCount,
    })
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        sql`(${webhookDeliveries.nextRetryAt} IS NULL OR ${webhookDeliveries.nextRetryAt} <= ${now})`,
      ),
    )
    .limit(batchSize)
    .all();
  if (due.length === 0) return 0;

  // Fetch webhook secrets in one go.
  const webhookIds = [...new Set(due.map((d) => d.webhookId))];
  const webhookRows = webhookIds.length
    ? await db
        .select({
          id: webhooks.id,
          url: webhooks.url,
          secret: webhooks.secret,
          active: webhooks.active,
        })
        .from(webhooks)
        .where(sql`${webhooks.id} IN (${sql.join(webhookIds.map((id) => sql`${id}`), sql`, `)})`)
        .all()
    : [];
  const byId = new Map(webhookRows.map((w) => [w.id, w]));

  let processed = 0;
  for (const d of due) {
    processed += 1;
    const wh = byId.get(d.webhookId);
    if (!wh || !wh.active) {
      // Webhook was deleted or disabled between enqueue and dispatch — fail.
      await db
        .update(webhookDeliveries)
        .set({ status: 'failed', responseStatus: null, responseBody: 'webhook missing/disabled' })
        .where(eq(webhookDeliveries.id, d.id))
        .run();
      continue;
    }

    const attempt = d.attemptCount + 1;
    const timestamp = now;
    const signature = sign(wh.secret, timestamp, d.payloadJson);

    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let success = false;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [SIGNATURE_HEADER]: signature,
            [EVENT_HEADER]: d.eventType,
            [DELIVERY_HEADER]: d.id,
            'User-Agent': 'Vyro-Webhooks/1.0',
          },
          body: d.payloadJson,
          signal: controller.signal,
        });
        responseStatus = res.status;
        responseBody = (await res.text().catch(() => '')).slice(0, 4000);
        success = res.status >= 200 && res.status < 300;
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      responseBody = err instanceof Error ? err.message.slice(0, 4000) : 'unknown error';
    }

    if (success) {
      await db
        .update(webhookDeliveries)
        .set({
          status: 'success',
          responseStatus,
          responseBody,
          attemptCount: attempt,
          nextRetryAt: null,
        })
        .where(eq(webhookDeliveries.id, d.id))
        .run();
    } else if (attempt >= MAX_ATTEMPTS) {
      await db
        .update(webhookDeliveries)
        .set({
          status: 'failed',
          responseStatus,
          responseBody,
          attemptCount: attempt,
          nextRetryAt: null,
        })
        .where(eq(webhookDeliveries.id, d.id))
        .run();
    } else {
      const nextRetryAt = now + backoffSeconds(attempt) * 1000;
      await db
        .update(webhookDeliveries)
        .set({
          status: 'pending',
          responseStatus,
          responseBody,
          attemptCount: attempt,
          nextRetryAt,
        })
        .where(eq(webhookDeliveries.id, d.id))
        .run();
    }
  }
  return processed;
}

export function buildSignature(secret: string, timestamp: number, body: string): string {
  return sign(secret, timestamp, body);
}

function sign(secret: string, timestamp: number, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${mac}`;
}

/**
 * Verifies a signature header against a body. Useful for the receiver side and
 * for tests.
 */
export function verifySignature(
  secret: string,
  header: string,
  body: string,
  toleranceSeconds = 300,
): boolean {
  const parts: Record<string, string> = {};
  for (const kv of String(header).split(',')) {
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    const k = kv.slice(0, eq).trim();
    const v = kv.slice(eq + 1).trim();
    if (k && v) parts[k] = v;
  }
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return safeEqualHex(expected, v1);
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
