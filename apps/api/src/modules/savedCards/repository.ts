import { and, eq } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { savedCards, type SavedCard } from '@vyro/db/schema';

export interface UpsertSavedCardInput {
  businessId: string;
  paymentsLkCardId: string;
  brand?: string | null;
  last4?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
}

export const savedCardsRepository = {
  async listForBusiness(d1: D1Database, businessId: string): Promise<SavedCard[]> {
    return (await getDb(d1).select().from(savedCards).where(eq(savedCards.businessId, businessId)).all()) as SavedCard[];
  },

  async getById(d1: D1Database, id: string): Promise<SavedCard | null> {
    return ((await getDb(d1).select().from(savedCards).where(eq(savedCards.id, id)).get()) as SavedCard | undefined) ?? null;
  },

  async upsert(d1: D1Database, input: UpsertSavedCardInput): Promise<SavedCard> {
    const db = getDb(d1);
    const existing = (await db
      .select()
      .from(savedCards)
      .where(and(eq(savedCards.businessId, input.businessId), eq(savedCards.paymentsLkCardId, input.paymentsLkCardId)))
      .get()) as SavedCard | undefined;
    const now = Date.now();
    if (existing) {
      await db
        .update(savedCards)
        .set({
          brand: input.brand ?? undefined,
          last4: input.last4 ?? undefined,
          expiryMonth: input.expiryMonth ?? undefined,
          expiryYear: input.expiryYear ?? undefined,
          updatedAt: now,
        })
        .where(eq(savedCards.id, existing.id))
        .run();
      return (await this.getById(d1, existing.id))!;
    }
    const id = `sc_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
    await db
      .insert(savedCards)
      .values({
        id,
        businessId: input.businessId,
        paymentsLkCardId: input.paymentsLkCardId,
        brand: input.brand ?? null,
        last4: input.last4 ?? null,
        expiryMonth: input.expiryMonth ?? null,
        expiryYear: input.expiryYear ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return (await this.getById(d1, id))!;
  },

  async remove(d1: D1Database, id: string, businessId: string): Promise<boolean> {
    const result = await getDb(d1)
      .delete(savedCards)
      .where(and(eq(savedCards.id, id), eq(savedCards.businessId, businessId)))
      .run();
    const r = result as unknown as { meta?: { changes?: number } };
    return Number(r?.meta?.changes ?? 0) > 0;
  },
};
