import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { newId, isTrustSealed, memberSinceYear } from '@vyro/shared';
import { trustSealSubscriptions, suppliers } from '@vyro/db/schema';

export const trustSealRepository = {
  async getBySupplier(d1: D1Database, supplierId: string) {
    const db = getDb(d1);
    return db
      .select()
      .from(trustSealSubscriptions)
      .where(eq(trustSealSubscriptions.supplierId, supplierId))
      .get();
  },
  async getByPaymentId(d1: D1Database, paymentId: string) {
    const db = getDb(d1);
    return db
      .select()
      .from(trustSealSubscriptions)
      .where(eq(trustSealSubscriptions.paymentId, paymentId))
      .get();
  },
  async upsertPending(d1: D1Database, supplierId: string, paymentId: string) {
    const db = getDb(d1);
    const existing = await db
      .select({ id: trustSealSubscriptions.id })
      .from(trustSealSubscriptions)
      .where(eq(trustSealSubscriptions.supplierId, supplierId))
      .get();
    const now = Date.now();
    if (existing) {
      await db
        .update(trustSealSubscriptions)
        .set({ status: 'pending', paymentId, updatedAt: now })
        .where(eq(trustSealSubscriptions.supplierId, supplierId));
      return { id: existing.id, paymentId };
    }
    const id = newId();
    await db.insert(trustSealSubscriptions).values({
      id,
      supplierId,
      status: 'pending',
      paymentId,
      createdAt: now,
      updatedAt: now,
    });
    return { id, paymentId };
  },
  async activateFromWebhook(d1: D1Database, paymentId: string, termMs: number) {
    const db = getDb(d1);
    const row = await db
      .select()
      .from(trustSealSubscriptions)
      .where(eq(trustSealSubscriptions.paymentId, paymentId))
      .get();
    if (!row) return null;
    if (row.status === 'active') return row;
    const now = Date.now();
    const startedAt = row.startedAt ?? now;
    const base = row.expiresAt && row.expiresAt > now ? row.expiresAt : now;
    const expiresAt = base + termMs;
    await db
      .update(trustSealSubscriptions)
      .set({ status: 'active', startedAt, expiresAt, updatedAt: now })
      .where(eq(trustSealSubscriptions.id, row.id));
    return { ...row, status: 'active' as const, startedAt, expiresAt };
  },
  async expireDue(d1: D1Database, now: number) {
    const db = getDb(d1);
    const rows = await db.select().from(trustSealSubscriptions).all();
    let expired = 0;
    for (const r of rows) {
      if (r.status === 'active' && r.expiresAt != null && r.expiresAt <= now) {
        await db
          .update(trustSealSubscriptions)
          .set({ status: 'expired', updatedAt: now })
          .where(eq(trustSealSubscriptions.id, r.id));
        expired++;
      }
    }
    return { expired };
  },
  async revoke(d1: D1Database, supplierId: string) {
    const db = getDb(d1);
    await db
      .update(trustSealSubscriptions)
      .set({ status: 'cancelled', updatedAt: Date.now() })
      .where(eq(trustSealSubscriptions.supplierId, supplierId));
  },
  async batchStatus(d1: D1Database, supplierIds: string[]) {
    if (supplierIds.length === 0) return new Map<string, { trustSealed: boolean; trustSealExpiresAt: number | null; memberSinceYear: number | null }>();
    const db = getDb(d1);
    const subs = await db
      .select()
      .from(trustSealSubscriptions)
      .where(inArray(trustSealSubscriptions.supplierId, supplierIds))
      .all();
    const sups = await db
      .select()
      .from(suppliers)
      .where(inArray(suppliers.id, supplierIds))
      .all();
    const supById = new Map(sups.map((s: any) => [s.id, s]));
    const subById = new Map(subs.map((r: any) => [r.supplierId, r]));
    const now = Date.now();
    const out = new Map<string, { trustSealed: boolean; trustSealExpiresAt: number | null; memberSinceYear: number | null }>();
    for (const id of supplierIds) {
      const sub: any = subById.get(id) ?? null;
      const sup: any = supById.get(id) ?? null;
      out.set(id, {
        trustSealed: isTrustSealed(
          sup ? { verificationStatus: sup.verificationStatus, status: sup.status } : null,
          sub ? { status: sub.status, expiresAt: sub.expiresAt } : null,
          now,
        ),
        trustSealExpiresAt: sub?.expiresAt ?? null,
        memberSinceYear: memberSinceYear(sub?.startedAt ?? null),
      });
    }
    return out;
  },
};
