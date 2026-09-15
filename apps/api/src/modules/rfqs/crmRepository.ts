import { and, eq, desc, lt, gte, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { businesses, rfqs, rfqSuppliers, rfqSupplierNotes } from '@vyro/db/schema';
import type { LeadsListQuery, Tag, ConversionStatus } from '@vyro/validation';

export interface LeadRow {
  id: string;
  rfqId: string;
  supplierId: string;
  status: string;
  invitedAt: number;
  tag: Tag | null;
  conversionStatus: ConversionStatus | null;
  quotedAt: number | null;
  orderId: string | null;
  orderValueCents: number | null;
  buyerBusinessId: string;
  buyerName: string;
  buyerKycLevel: 'none' | 'basic' | 'enhanced';
  buyerVerifiedAt: number | null;
  buyerVerified: boolean;
}

export interface NoteRow {
  id: string;
  rfqSupplierId: string;
  body: string;
  createdBy: string;
  createdAt: number;
}

export interface SummaryRow {
  byTag: { hot: number; warm: number; cold: number; untagged: number };
  byStatus: {
    new: number;
    contacted: number;
    quoted: number;
    won: number;
    lost: number;
  };
  totals: { leads: number; conversionRate: number };
}

const TERMINAL_STATUSES = new Set<ConversionStatus>(['won', 'lost']);

type RawLead = Omit<LeadRow, 'buyerBusinessId' | 'buyerName' | 'buyerKycLevel' | 'buyerVerifiedAt' | 'buyerVerified'>;

// Attach buyer verification state (derived from businesses.kycLevel +
// kycVerifiedAt via rfqs.businessId). Missing rfq/business degrades to
// unverified rather than throwing — the badge is a signal, not a gate.
async function enrichLeads(
  d1: D1Database,
  raw: RawLead[],
): Promise<LeadRow[]> {
  if (raw.length === 0) return [];
  const db = getDb(d1);
  const rfqIds = [...new Set(raw.map((l) => l.rfqId))];
  const rfqRows = await db
    .select({ id: rfqs.id, businessId: rfqs.businessId })
    .from(rfqs)
    .where(inArray(rfqs.id, rfqIds));
  const rfqById = new Map(rfqRows.map((r) => [r.id, r.businessId] as const));
  const bizIds = [...new Set([...rfqById.values()])];
  const bizRows =
    bizIds.length === 0
      ? []
      : await db
          .select({
            id: businesses.id,
            name: businesses.name,
            kycLevel: businesses.kycLevel,
            kycVerifiedAt: businesses.kycVerifiedAt,
          })
          .from(businesses)
          .where(inArray(businesses.id, bizIds));
  const bizById = new Map(bizRows.map((b) => [b.id, b] as const));
  return raw.map((lead) => {
    const businessId = rfqById.get(lead.rfqId);
    const biz = businessId ? bizById.get(businessId) : undefined;
    const level =
      biz?.kycLevel === 'basic' || biz?.kycLevel === 'enhanced' ? biz.kycLevel : ('none' as const);
    const verifiedAt = biz?.kycVerifiedAt ?? null;
    return {
      ...lead,
      buyerBusinessId: businessId ?? '',
      buyerName: biz?.name ?? 'Unknown buyer',
      buyerKycLevel: level,
      buyerVerifiedAt: verifiedAt,
      buyerVerified: level !== 'none' && verifiedAt != null,
    };
  });
}

export const crmRepository = {
  async listLeadsForSupplier(
    d1: D1Database,
    supplierId: string,
    filter: LeadsListQuery,
  ): Promise<{ leads: LeadRow[]; nextCursor: string | null }> {
    const db = getDb(d1);
    const limit = filter.limit ?? 25;
    const where = [eq(rfqSuppliers.supplierId, supplierId)];
    if (filter.tag) where.push(eq(rfqSuppliers.tag, filter.tag));
    if (filter.status) where.push(eq(rfqSuppliers.conversionStatus, filter.status));
    if (filter.rfqId) where.push(eq(rfqSuppliers.rfqId, filter.rfqId));
    if (filter.from !== undefined) where.push(gte(rfqSuppliers.invitedAt, filter.from));
    if (filter.to !== undefined) where.push(lt(rfqSuppliers.invitedAt, filter.to));
    if (filter.cursor !== undefined) where.push(lt(rfqSuppliers.invitedAt, Number(filter.cursor)));

    const rows = await db
      .select()
      .from(rfqSuppliers)
      .where(and(...where))
      .orderBy(desc(rfqSuppliers.invitedAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit) as unknown as RawLead[];
    const leads = await enrichLeads(d1, slice);
    const nextCursor = hasMore ? String(rows[limit - 1]!.invitedAt) : null;
    return { leads, nextCursor };
  },

  async getLeadForSupplier(
    d1: D1Database,
    supplierId: string,
    leadId: string,
  ): Promise<LeadRow | null> {
    const db = getDb(d1);
    const [row] = await db
      .select()
      .from(rfqSuppliers)
      .where(and(eq(rfqSuppliers.id, leadId), eq(rfqSuppliers.supplierId, supplierId)))
      .limit(1);
    if (!row) return null;
    const [enriched] = await enrichLeads(d1, [row as unknown as RawLead]);
    return enriched ?? null;
  },

  async findLeadByRfqAndSupplier(
    d1: D1Database,
    rfqId: string,
    supplierId: string,
  ): Promise<LeadRow | null> {
    const db = getDb(d1);
    const [row] = await db
      .select()
      .from(rfqSuppliers)
      .where(and(eq(rfqSuppliers.rfqId, rfqId), eq(rfqSuppliers.supplierId, supplierId)))
      .limit(1);
    if (!row) return null;
    const [enriched] = await enrichLeads(d1, [row as unknown as RawLead]);
    return enriched ?? null;
  },

  async updateLeadTag(
    d1: D1Database,
    supplierId: string,
    leadId: string,
    tag: Tag | null,
  ): Promise<void> {
    const db = getDb(d1);
    await db
      .update(rfqSuppliers)
      .set({ tag })
      .where(and(eq(rfqSuppliers.id, leadId), eq(rfqSuppliers.supplierId, supplierId)));
  },

  async updateLeadStatus(
    d1: D1Database,
    supplierId: string,
    leadId: string,
    status: ConversionStatus,
  ): Promise<void> {
    const db = getDb(d1);
    const existing = await this.getLeadForSupplier(d1, supplierId, leadId);
    if (!existing) throw new Error('lead not found');
    if (existing.conversionStatus && TERMINAL_STATUSES.has(existing.conversionStatus)) {
      throw new Error(
        `lead is in terminal state (${existing.conversionStatus}) and cannot transition`,
      );
    }
    await db
      .update(rfqSuppliers)
      .set({ conversionStatus: status })
      .where(and(eq(rfqSuppliers.id, leadId), eq(rfqSuppliers.supplierId, supplierId)));
  },

  async insertNote(
    d1: D1Database,
    rfqSupplierId: string,
    createdBy: string,
    body: string,
  ): Promise<NoteRow> {
    const db = getDb(d1);
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await db.insert(rfqSupplierNotes).values({ id, rfqSupplierId, createdBy, body, createdAt });
    return { id, rfqSupplierId, createdBy, body, createdAt };
  },

  async listNotes(
    d1: D1Database,
    rfqSupplierId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<{ notes: NoteRow[]; nextCursor: string | null }> {
    const db = getDb(d1);
    const where = [eq(rfqSupplierNotes.rfqSupplierId, rfqSupplierId)];
    if (cursor !== undefined) where.push(lt(rfqSupplierNotes.createdAt, Number(cursor)));
    const rows = await db
      .select()
      .from(rfqSupplierNotes)
      .where(and(...where))
      .orderBy(desc(rfqSupplierNotes.createdAt))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const slice = rows.slice(0, limit) as unknown as NoteRow[];
    const nextCursor = hasMore ? String(rows[limit - 1]!.createdAt) : null;
    return { notes: slice, nextCursor };
  },

  async summaryForSupplier(d1: D1Database, supplierId: string): Promise<SummaryRow> {
    const db = getDb(d1);
    const rows = await db
      .select({
        tag: rfqSuppliers.tag,
        status: rfqSuppliers.conversionStatus,
      })
      .from(rfqSuppliers)
      .where(eq(rfqSuppliers.supplierId, supplierId));

    const byTag = { hot: 0, warm: 0, cold: 0, untagged: 0 };
    const byStatus = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
    for (const r of rows) {
      if (r.tag === 'hot') byTag.hot++;
      else if (r.tag === 'warm') byTag.warm++;
      else if (r.tag === 'cold') byTag.cold++;
      else byTag.untagged++;
      if (r.status && r.status in byStatus) {
        byStatus[r.status as keyof typeof byStatus]++;
      }
    }
    const total = rows.length;
    const conversionRate = total === 0 ? 0 : byStatus.won / total;
    return { byTag, byStatus, totals: { leads: total, conversionRate } };
  },

  // Internal hook targets -----------------------------------------------

  async setQuoted(d1: D1Database, rfqSupplierId: string): Promise<void> {
    const db = getDb(d1);
    await db
      .update(rfqSuppliers)
      .set({ conversionStatus: 'quoted', quotedAt: Date.now() })
      .where(eq(rfqSuppliers.id, rfqSupplierId));
  },

  async setOrdered(
    d1: D1Database,
    rfqSupplierId: string,
    orderId: string,
    orderValueCents: number,
  ): Promise<void> {
    const db = getDb(d1);
    await db
      .update(rfqSuppliers)
      .set({
        conversionStatus: 'won',
        orderId,
        orderValueCents,
      })
      .where(eq(rfqSuppliers.id, rfqSupplierId));
  },
};