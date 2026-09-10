import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { httpError } from '../../lib/errors';
import {
  rfqs,
  rfqItems,
  rfqSuppliers,
  supplierQuotes,
  supplierQuoteItems,
  quotePriceTiers,
  quoteVersions,
  quoteCounterOffers,
  quoteMessages,
  rfqEvents,
  rfqDocuments,
  rfqTemplates,
  rfqTemplateItems,
} from '@vyro/db/schema';

export interface PageOpts { limit?: number | undefined; offset?: number | undefined; }

export function page(o?: PageOpts): { limit: number; offset: number } {
  const limit = Math.min(Math.max(o?.limit ?? 20, 1), 100);
  const offset = Math.max(o?.offset ?? 0, 0);
  return { limit, offset };
}

export function pageFromQuery(q: (name: string) => string | undefined): PageOpts {
  const limit = q('limit') != null ? Number(q('limit')) : undefined;
  const offset = q('offset') != null ? Number(q('offset')) : undefined;
  if ((limit != null && !Number.isInteger(limit)) || (offset != null && !Number.isInteger(offset))) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid pagination');
  }
  return { limit, offset };
}

export async function nextRfqNumber(d1: D1Database): Promise<string> {
  const db = getDb(d1);
  for (let i = 0; i < 5; i++) {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cand = `RFQ-${d}-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const ex = await db.select().from(rfqs).where(eq(rfqs.rfqNumber, cand)).get();
    if (!ex) return cand;
  }
  return `RFQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function nextQuoteNumber(d1: D1Database): Promise<string> {
  const db = getDb(d1);
  for (let i = 0; i < 5; i++) {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cand = `Q-${d}-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
    const ex = await db.select().from(supplierQuotes).where(eq(supplierQuotes.quoteNumber, cand)).get();
    if (!ex) return cand;
  }
  return `Q-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function findRfq(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (await db.select().from(rfqs).where(eq(rfqs.id, id)).get()) ?? null;
}

export async function listRfqItems(d1: D1Database, rfqId: string) {
  const db = getDb(d1);
  return db.select().from(rfqItems).where(eq(rfqItems.rfqId, rfqId)).all();
}

export async function listRfqInvites(d1: D1Database, rfqId: string) {
  const db = getDb(d1);
  return db.select().from(rfqSuppliers).where(eq(rfqSuppliers.rfqId, rfqId)).all();
}

export async function listQuotesForRfq(d1: D1Database, rfqId: string, opts?: PageOpts) {
  const db = getDb(d1);
  const { limit, offset } = page(opts);
  return db
    .select()
    .from(supplierQuotes)
    .where(eq(supplierQuotes.rfqId, rfqId))
    .orderBy(desc(supplierQuotes.updatedAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function listQuoteItems(d1: D1Database, quoteId: string) {
  const db = getDb(d1);
  return db.select().from(supplierQuoteItems).where(eq(supplierQuoteItems.quoteId, quoteId)).all();
}

export async function listTiersForItems(d1: D1Database, itemIds: string[]) {
  if (!itemIds.length) return [];
  const db = getDb(d1);
  return db
    .select()
    .from(quotePriceTiers)
    .where(inArray(quotePriceTiers.quoteItemId, itemIds))
    .orderBy(asc(quotePriceTiers.minQty))
    .all();
}

export async function findQuote(d1: D1Database, id: string) {
  const db = getDb(d1);
  return (await db.select().from(supplierQuotes).where(eq(supplierQuotes.id, id)).get()) ?? null;
}

export async function insertRfqEvent(
  d1: D1Database,
  row: { rfqId: string; quoteId?: string | null; actorUserId?: string | null; action: string; fromStatus?: string | null; toStatus?: string | null; metadata?: unknown },
) {
  const db = getDb(d1);
  const { randomUUID } = await import('node:crypto').catch(() => ({ randomUUID: () => `${Date.now()}-${Math.random()}` }));
  void randomUUID;
  const { newId } = await import('@vyro/shared');
  await db.insert(rfqEvents).values({
    id: newId(),
    rfqId: row.rfqId,
    quoteId: row.quoteId ?? null,
    actorUserId: row.actorUserId ?? null,
    action: row.action,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    metadataJson: row.metadata != null ? JSON.stringify(row.metadata) : null,
    createdAt: Date.now(),
  });
}

export async function listRfqEvents(d1: D1Database, rfqId: string) {
  const db = getDb(d1);
  return db
    .select()
    .from(rfqEvents)
    .where(eq(rfqEvents.rfqId, rfqId))
    .orderBy(asc(rfqEvents.createdAt))
    .all();
}

export async function listRfqsForBusiness(d1: D1Database, businessId: string, opts?: PageOpts) {
  const db = getDb(d1);
  const { limit, offset } = page(opts);
  return db
    .select()
    .from(rfqs)
    .where(eq(rfqs.businessId, businessId))
    .orderBy(desc(rfqs.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

export async function listRfqsForSupplier(d1: D1Database, supplierId: string, includeOpen = true, opts?: PageOpts) {
  const db = getDb(d1);
  const { limit, offset } = page(opts);
  const invites = await db.select().from(rfqSuppliers).where(eq(rfqSuppliers.supplierId, supplierId)).all();
  const invitedIds = invites.map((i) => i.rfqId);
  let rows: Array<typeof rfqs.$inferSelect> = [];
  if (invitedIds.length) {
    rows = await db.select().from(rfqs).where(inArray(rfqs.id, invitedIds)).limit(limit).offset(offset).all();
  }
  if (includeOpen) {
    const openRfqs = await db
      .select()
      .from(rfqs)
      .where(and(eq(rfqs.isOpen, 1), sql`${rfqs.status} IN ('open','quoting','quotes_received','under_review')`))
      .limit(50)
      .all();
    const seen = new Set(rows.map((r) => r.id));
    for (const r of openRfqs) if (!seen.has(r.id)) rows.push(r);
  }
  return { rows, invites };
}

export async function listCounters(d1: D1Database, quoteId: string) {
  const db = getDb(d1);
  return db
    .select()
    .from(quoteCounterOffers)
    .where(eq(quoteCounterOffers.quoteId, quoteId))
    .orderBy(asc(quoteCounterOffers.createdAt))
    .all();
}

export async function listVersions(d1: D1Database, quoteId: string) {
  const db = getDb(d1);
  return db
    .select()
    .from(quoteVersions)
    .where(eq(quoteVersions.quoteId, quoteId))
    .orderBy(asc(quoteVersions.version))
    .all();
}

export async function listMessages(d1: D1Database, rfqId: string, quoteId?: string) {
  const db = getDb(d1);
  if (quoteId) {
    return db
      .select()
      .from(quoteMessages)
      .where(and(eq(quoteMessages.rfqId, rfqId), eq(quoteMessages.quoteId, quoteId)))
      .orderBy(asc(quoteMessages.createdAt))
      .all();
  }
  return db
    .select()
    .from(quoteMessages)
    .where(eq(quoteMessages.rfqId, rfqId))
    .orderBy(asc(quoteMessages.createdAt))
    .all();
}

export async function listDocuments(d1: D1Database, rfqId: string) {
  const db = getDb(d1);
  return db.select().from(rfqDocuments).where(eq(rfqDocuments.rfqId, rfqId)).all();
}

export async function listTemplates(d1: D1Database, businessId: string) {
  const db = getDb(d1);
  return db.select().from(rfqTemplates).where(eq(rfqTemplates.businessId, businessId)).all();
}

export async function listTemplateItems(d1: D1Database, templateId: string) {
  const db = getDb(d1);
  return db.select().from(rfqTemplateItems).where(eq(rfqTemplateItems.templateId, templateId)).all();
}

export async function messagesSince(d1: D1Database, rfqId: string, since: number) {
  const db = getDb(d1);
  return db
    .select()
    .from(quoteMessages)
    .where(and(eq(quoteMessages.rfqId, rfqId), gt(quoteMessages.createdAt, since)))
    .orderBy(asc(quoteMessages.createdAt))
    .all();
}

export { rfqSuppliers };
