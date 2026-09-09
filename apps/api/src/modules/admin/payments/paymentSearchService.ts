import { getDb } from '@vyro/db';
import {
  searchPayments as repoSearch,
  getPaymentDetailBundle as repoDetail,
  listPaymentOptions as repoOptions,
  type PaymentSearchFilters,
  type PaymentRow,
  type PaymentMethod,
  type DetailBundle,
} from './paymentSearchRepository';

export type { PaymentRow, PaymentSearchFilters, DetailBundle } from './paymentSearchRepository';

const ALL_STATUSES = [
  'pending',
  'confirmed',
  'failed',
  'cancelled',
  'chargeback',
  'refunded',
] as const;
const ALL_METHODS = ['cash', 'bank_transfer', 'online'] as const;
const ALL_PROVIDERS = ['payhere', 'mock'] as const;

function parseCsv<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  if (typeof raw !== 'string' || !raw.length) return undefined;
  const out: T[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if ((allowed as readonly string[]).includes(v)) out.push(v as T);
  }
  return out.length ? out : undefined;
}

function parseSort(raw: unknown): NonNullable<PaymentSearchFilters['sort']> {
  switch (raw) {
    case 'createdAt-asc':
    case 'createdAt-desc':
    case 'amount-desc':
    case 'amount-asc':
      return raw;
    default:
      return 'createdAt-desc';
  }
}

function toNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string' || !raw.length) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export type ListInput = {
  q?: unknown;
  status?: unknown;
  method?: unknown;
  provider?: unknown;
  businessId?: unknown;
  supplierId?: unknown;
  minCents?: unknown;
  maxCents?: unknown;
  from?: unknown;
  to?: unknown;
  cursor?: unknown;
  limit?: unknown;
  sort?: unknown;
};

export async function listPayments(
  d1: D1Database,
  raw: ListInput,
): Promise<{ rows: PaymentRow[]; nextCursor: string | null }> {
  const base: PaymentSearchFilters = {};
  if (typeof raw.q === 'string' && raw.q.length) base.q = raw.q;
  const status = parseCsv(raw.status, ALL_STATUSES);
  if (typeof raw.businessId === 'string' && raw.businessId.length) base.businessId = raw.businessId;
  if (typeof raw.supplierId === 'string' && raw.supplierId.length) base.supplierId = raw.supplierId;
  const min = toNumber(raw.minCents);
  if (typeof min === 'number' && min >= 0) base.minCents = min;
  const max = toNumber(raw.maxCents);
  if (typeof max === 'number' && max >= 0) base.maxCents = max;
  const from = toNumber(raw.from);
  if (typeof from === 'number') base.from = from;
  const to = toNumber(raw.to);
  if (typeof to === 'number') base.to = to;
  if (typeof raw.cursor === 'string' && raw.cursor.length) base.cursor = raw.cursor;
  const lim = toNumber(raw.limit);
  if (typeof lim === 'number') base.limit = Math.min(Math.max(Math.floor(lim), 1), 200);
  base.sort = parseSort(raw.sort);

  const filters = {
    ...base,
    ...(status ? { status } : {}),
    ...(typeof raw.method === 'string' && (ALL_METHODS as readonly string[]).includes(raw.method)
      ? { method: raw.method as PaymentMethod }
      : {}),
    ...(typeof raw.provider === 'string' && (ALL_PROVIDERS as readonly string[]).includes(raw.provider)
      ? { provider: raw.provider as PaymentSearchFilters['provider'] }
      : {}),
  } as PaymentSearchFilters;

  return repoSearch(getDb(d1), filters);
}

export async function getPaymentDetail(d1: D1Database, id: string): Promise<DetailBundle | null> {
  return repoDetail(getDb(d1), id);
}

export async function getReconciliation(d1: D1Database): Promise<{
  confirmedOnline: number;
  pendingOnline: number;
  failed: number;
  cancelled: number;
  chargebacks: number;
  paymentsWithMultipleEvents: number;
}> {
  const db = getDb(d1) as any;
  const { sql } = await import('drizzle-orm');
  const count = async (where: string): Promise<number> => {
    const row = (await db
      .select({ n: sql`COUNT(*)` })
      .from(sql`payments`)
      .where(sql.raw(where))
      .get()) as any;
    return Number(row?.n ?? 0);
  };
  const multi = (await db
    .select({ n: sql`COUNT(*)` })
    .from(sql`(SELECT payment_id FROM payment_events GROUP BY payment_id HAVING COUNT(*) > 1)`)
    .get()) as any;
  const cb = (await db.select({ n: sql`COUNT(*)` }).from(sql`chargebacks`).get()) as any;
  return {
    confirmedOnline: await count(`status='confirmed' AND method='online'`),
    pendingOnline: await count(`status='pending' AND method='online'`),
    failed: await count(`status='failed'`),
    cancelled: await count(`status='cancelled'`),
    chargebacks: Number(cb?.n ?? 0),
    paymentsWithMultipleEvents: Number(multi?.n ?? 0),
  };
}

export async function getPaymentOptions(d1: D1Database) {
  return repoOptions(getDb(d1));
}
