import { getDb } from '@vyro/db';
import { paymentIdempotencyKeys } from '@vyro/db/schema';
import { and, eq, lt } from 'drizzle-orm';
import { httpError } from './errors';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface IdempotencyHit {
  statusCode: number;
  responseJson: string;
}

/**
 * Look up a stored response for (userId, key).
 * Returns null if not found OR expired (and deletes expired row).
 */
export async function getIdempotencyResponse(
  d1: D1Database,
  userId: string,
  key: string,
): Promise<IdempotencyHit | null> {
  const db = getDb(d1);
  const now = Date.now();
  const row = (await db
    .select()
    .from(paymentIdempotencyKeys)
    .where(
      and(
        eq(paymentIdempotencyKeys.key, key),
        eq(paymentIdempotencyKeys.userId, userId),
      ),
    )
    .get()) as any;
  if (!row) return null;
  if (row.expiresAt < now) {
    db.delete(paymentIdempotencyKeys)
      .where(
        and(
          eq(paymentIdempotencyKeys.key, key),
          eq(paymentIdempotencyKeys.userId, userId),
        ),
      )
      .run();
    return null;
  }
  return { statusCode: row.statusCode, responseJson: row.responseJson };
}

/**
 * Store a successful response keyed by (userId, key).
 * Cleans up expired keys opportunistically.
 */
export function storeIdempotencyResponse(
  d1: D1Database,
  userId: string,
  key: string,
  requestHash: string,
  statusCode: number,
  responseJson: string,
): void {
  const db = getDb(d1);
  const now = Date.now();
  // Sweep expired (cheap; rarely non-empty)
  db.delete(paymentIdempotencyKeys).where(lt(paymentIdempotencyKeys.expiresAt, now)).run();
  db.insert(paymentIdempotencyKeys)
    .values({
      key,
      userId,
      requestHash,
      responseJson,
      statusCode,
      expiresAt: now + TTL_MS,
      createdAt: now,
    })
    .run();
}

/**
 * Validate request body hash matches stored hash. Throws 409 if mismatch
 * (same key reused with different payload).
 */
export async function assertIdempotencyMatch(
  d1: D1Database,
  userId: string,
  key: string,
  requestHash: string,
): Promise<void> {
  const db = getDb(d1);
  const row = (await db
    .select({ hash: paymentIdempotencyKeys.requestHash })
    .from(paymentIdempotencyKeys)
    .where(
      and(
        eq(paymentIdempotencyKeys.key, key),
        eq(paymentIdempotencyKeys.userId, userId),
      ),
    )
    .get()) as any;
  if (!row) return;
  if (row.hash !== requestHash) {
    throw httpError(409, 'CONFLICT', 'Idempotency-Key reused with different payload');
  }
}

export function hashRequestBody(body: unknown): string {
  return stableStringify(body);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') +
    '}'
  );
}
