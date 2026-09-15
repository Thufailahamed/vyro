import { and, desc, eq, gte, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { newId } from '@vyro/shared';
import {
  supplierBuyLeadSubscriptions,
  rfqs,
  rfqItems,
  products,
  supplierMembers,
  users,
} from '@vyro/db/schema';

export interface SubscriptionRow {
  supplierId: string;
  enabled: boolean;
  categoryIds: string[];
}

export interface RfqMatch {
  rfqId: string;
  rfqNumber: string;
  title: string;
  createdAt: number;
}

export interface EnabledSubRow {
  supplierId: string;
  recipientUserId: string;
  recipientEmail: string;
}

export const buyLeadsRepository = {
  async getSubscription(d1: D1Database, supplierId: string): Promise<SubscriptionRow | null> {
    const db = getDb(d1);
    const row = await db
      .select()
      .from(supplierBuyLeadSubscriptions)
      .where(eq(supplierBuyLeadSubscriptions.supplierId, supplierId))
      .get();
    if (!row) return null;
    return {
      supplierId: row.supplierId,
      enabled: row.enabled,
      categoryIds: JSON.parse(row.categoryIdsJson) as string[],
    };
  },

  async upsertSubscription(
    d1: D1Database,
    supplierId: string,
    enabled: boolean,
    categoryIds: string[],
  ): Promise<void> {
    const db = getDb(d1);
    const existing = await db
      .select({ id: supplierBuyLeadSubscriptions.id })
      .from(supplierBuyLeadSubscriptions)
      .where(eq(supplierBuyLeadSubscriptions.supplierId, supplierId))
      .get();
    const now = Date.now();
    const json = JSON.stringify(categoryIds);
    if (existing) {
      await db
        .update(supplierBuyLeadSubscriptions)
        .set({ enabled, categoryIdsJson: json, updatedAt: now })
        .where(eq(supplierBuyLeadSubscriptions.supplierId, supplierId));
    } else {
      await db.insert(supplierBuyLeadSubscriptions).values({
        id: newId(),
        supplierId,
        enabled,
        categoryIdsJson: json,
        createdAt: now,
        updatedAt: now,
      });
    }
  },

  async enabledSubscriptions(d1: D1Database): Promise<EnabledSubRow[]> {
    const db = getDb(d1);
    const rows = await db
      .select({
        supplierId: supplierBuyLeadSubscriptions.supplierId,
        userId: users.id,
        email: users.email,
      })
      .from(supplierBuyLeadSubscriptions)
      .innerJoin(supplierMembers, eq(supplierMembers.supplierId, supplierBuyLeadSubscriptions.supplierId))
      .innerJoin(users, eq(users.id, supplierMembers.userId))
      .where(and(
        eq(supplierBuyLeadSubscriptions.enabled, true),
        eq(supplierMembers.role, 'owner'),
        eq(supplierMembers.status, 'active'),
      ));
    const out = new Map<string, EnabledSubRow>();
    for (const r of rows) {
      if (!out.has(r.supplierId)) {
        out.set(r.supplierId, {
          supplierId: r.supplierId,
          recipientUserId: r.userId,
          recipientEmail: r.email,
        });
      }
    }
    return Array.from(out.values());
  },

  async newRfqsMatchingCategories(
    d1: D1Database,
    categoryIds: string[],
    sinceMs: number,
    limit: number,
  ): Promise<RfqMatch[]> {
    if (categoryIds.length === 0) return [];
    const db = getDb(d1);
    const rows = await db
      .selectDistinct({
        rfqId: rfqs.id,
        rfqNumber: rfqs.rfqNumber,
        title: rfqs.title,
        createdAt: rfqs.createdAt,
      })
      .from(rfqs)
      .innerJoin(rfqItems, eq(rfqItems.rfqId, rfqs.id))
      .innerJoin(products, eq(products.id, rfqItems.productId))
      .where(and(
        eq(rfqs.status, 'open'),
        eq(rfqs.isOpen, true),
        gte(rfqs.createdAt, sinceMs),
        isNotNull(rfqs.publishedAt),
        isNotNull(rfqItems.productId),
        inArray(products.categoryId, categoryIds),
      ))
      .orderBy(desc(rfqs.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      rfqId: r.rfqId,
      rfqNumber: r.rfqNumber,
      title: r.title,
      createdAt: r.createdAt,
    }));
  },
};
