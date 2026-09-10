import { getDb } from '@vyro/db';
import {
  commissionRules,
  platformSettings,
  products,
  purchaseOrderItems,
  supplierProducts,
} from '@vyro/db/schema';
import { and, eq } from 'drizzle-orm';
import { mulBps } from '@vyro/shared';

export interface CommissionContext {
  supplierId?: string | undefined;
  categoryId?: string | undefined;
  productId?: string | undefined;
}

/**
 * Resolve the applicable commission rate in bps (spec §15).
 * Precedence: product > supplier > category > promotional > global rule >
 * platform_settings.platformFeeBps > 250 default.
 *
 * The RETURNED bps must be snapshotted onto the allocation/earning row so
 * historical transactions never change when rules change later.
 */
export async function resolveCommissionBps(
  d1: D1Database,
  ctx: CommissionContext,
  at = Date.now(),
): Promise<{ bps: number; ruleId: string | null }> {
  const db = getDb(d1);
  const scopes: Array<{ scope: string; scopeId: string | undefined }> = [
    { scope: 'product', scopeId: ctx.productId },
    { scope: 'supplier', scopeId: ctx.supplierId },
    { scope: 'category', scopeId: ctx.categoryId },
  ];
  for (const s of scopes) {
    if (!s.scopeId) continue;
    const rule = (await db
      .select()
      .from(commissionRules)
      .where(
        and(
          eq(commissionRules.scope, s.scope as 'product'),
          eq(commissionRules.scopeId, s.scopeId),
          eq(commissionRules.active, true),
        ),
      )
      .get()) as typeof commissionRules.$inferSelect | undefined;
    if (rule && isLive(rule, at)) return { bps: rule.bps, ruleId: rule.id };
  }
  // Promotional or global fallback (most recent active global wins).
  const global = (await db
    .select()
    .from(commissionRules)
    .where(and(eq(commissionRules.scope, 'global'), eq(commissionRules.active, true)))
    .get()) as typeof commissionRules.$inferSelect | undefined;
  if (global && isLive(global, at)) return { bps: global.bps, ruleId: global.id };

  const platform = (await db
    .select({ bps: platformSettings.platformFeeBps })
    .from(platformSettings)
    .where(eq(platformSettings.id, 1))
    .get()) as { bps: number } | undefined;
  return { bps: platform?.bps ?? 250, ruleId: null };
}

function isLive(
  rule: Pick<typeof commissionRules.$inferSelect, 'startsAt' | 'endsAt'>,
  at: number,
): boolean {
  if (rule.startsAt != null && at < rule.startsAt) return false;
  if (rule.endsAt != null && at > rule.endsAt) return false;
  return true;
}

/** Commission for a gross amount with the resolved rate. Integer math only. */
export function commissionFor(grossCents: number, bps: number): number {
  return mulBps(grossCents, bps);
}

/**
 * Resolve category context for a purchase order (first line's product
 * category) so category-scoped rules can apply.
 */
export async function categoryForPo(d1: D1Database, poId: string): Promise<string | undefined> {
  const db = getDb(d1);
  const line = (await db
    .select({ supplierProductId: purchaseOrderItems.supplierProductId })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId))
    .get()) as { supplierProductId: string } | undefined;
  if (!line) return undefined;
  const sp = (await db
    .select({ productId: supplierProducts.productId })
    .from(supplierProducts)
    .where(eq(supplierProducts.id, line.supplierProductId))
    .get()) as { productId: string } | undefined;
  if (!sp) return undefined;
  const product = (await db
    .select({ categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, sp.productId))
    .get()) as { categoryId: string | null } | undefined;
  return product?.categoryId ?? undefined;
}
