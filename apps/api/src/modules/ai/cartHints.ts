import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { cartItems, supplierProducts, products, suppliers } from '@vyro/db/schema';
import { findOpenCartByBusiness, listCartItems } from '../cart/repository';
import { drizzleRepos } from './intents/drizzleRepos';
import type { Env } from '../../env';

export interface CartHintLine {
  productId: string;
  productName: string;
  quantity: number;
  priceCents: number;
  supplierName: string;
}

export type CartHintKind = 'switch_save' | 'delivery' | 'budget';

export interface CartHint {
  kind: CartHintKind;
  evidence: string;
  action: string;
  savingCents?: number;
  dismissKey: string;
}

/**
 * Pure builder — given a cart snapshot + an offer-fetcher, returns up to
 * 3 ranked hints. Deterministic: stable order, no timestamps, no randomness.
 *
 * Rules:
 *  - switch_save: alternative live offer (same product) cheaper than the
 *    current line. Capped at 2 such hints, ranked by absolute saving.
 *  - delivery: cart has lines from >1 distinct supplier → suggest combining
 *    delivery into one supplier where possible.
 *  - budget: cart total > 1.1 × avgSpend → flag that spend is trending high.
 */
export async function buildCartHints(
  repos: { listOffersByProduct(productId: string): Promise<Array<{ priceCents: number; leadTimeDays: number; availabilityStatus: string; supplier: { id: string; name: string } }>> },
  cart: CartHintLine[],
  avgSpend: number,
): Promise<CartHint[]> {
  if (!cart.length) return [];

  const hints: CartHint[] = [];
  const switchCandidates: Array<{ line: CartHintLine; altSupplier: string; savingCents: number }> = [];

  for (const line of cart) {
    const offers = await repos.listOffersByProduct(line.productId).catch(() => []);
    const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
    const alt = live
      .filter((o) => o.supplier.name.toLowerCase() !== line.supplierName.toLowerCase())
      .sort((a, b) => a.priceCents - b.priceCents)[0];
    if (alt && alt.priceCents < line.priceCents) {
      switchCandidates.push({
        line,
        altSupplier: alt.supplier.name,
        savingCents: (line.priceCents - alt.priceCents) * line.quantity,
      });
    }
  }

  switchCandidates.sort((a, b) => b.savingCents - a.savingCents);
  for (const c of switchCandidates.slice(0, 2)) {
    hints.push({
      kind: 'switch_save',
      evidence: `Switch ${c.line.productName} to ${c.altSupplier} and save Rs. ${(c.savingCents / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      action: `/search?q=${encodeURIComponent(c.line.productName)}`,
      savingCents: c.savingCents,
      dismissKey: `vyro-cart-hint:switch_save:${c.line.productId}`,
    });
  }

  const supplierSet = new Set(cart.map((l) => l.supplierName));
  if (supplierSet.size > 1) {
    hints.push({
      kind: 'delivery',
      evidence: `Combining these ${supplierSet.size} suppliers into one delivery could simplify receiving.`,
      action: '/analytics',
      dismissKey: 'vyro-cart-hint:delivery:all',
    });
  } else if (avgSpend > 0) {
    const cartTotal = cart.reduce((s, l) => s + l.priceCents * l.quantity, 0);
    if (cartTotal > avgSpend * 1.1) {
      const over = cartTotal - avgSpend;
      hints.push({
        kind: 'budget',
        evidence: `Cart total Rs. ${(cartTotal / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is Rs. ${(over / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} above your usual weekly spend.`,
        action: '/analytics',
        dismissKey: 'vyro-cart-hint:budget:all',
      });
    }
  }

  return hints.slice(0, 3);
}

/**
 * Loads the minimal cart snapshot needed by `buildCartHints` from D1.
 * Server-side only — never trusts client-supplied prices.
 */
export async function loadCartHintInputs(env: Env, businessId: string): Promise<CartHintLine[]> {
  const cart = await findOpenCartByBusiness(env.DB, businessId);
  if (!cart) return [];
  const items = await listCartItems(env.DB, cart.id);
  if (!items.length) return [];
  const db = getDb(env.DB);
  const spIds = items.map((i) => i.supplierProductId);
  const rows = await db
    .select({
      sp: supplierProducts,
      product: products,
      supplier: suppliers,
    })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .innerJoin(suppliers, eq(supplierProducts.supplierId, suppliers.id))
    .where(inArray(supplierProducts.id, spIds))
    .all();
  const map = new Map(rows.map((r) => [r.sp.id, r]));
  const out: CartHintLine[] = [];
  for (const it of items) {
    const r = map.get(it.supplierProductId);
    if (!r) continue;
    out.push({
      productId: r.product.id,
      productName: r.product.name,
      quantity: it.quantity,
      priceCents: r.sp.priceCents,
      supplierName: r.supplier.name,
    });
  }
  return out;
}

/**
 * Average weekly spend over the last 8 weeks, derived from completed POs.
 * Used by `buildCartHints` for the budget hint.
 */
export async function loadAvgWeeklySpendCents(env: Env, businessId: string): Promise<number> {
  const repos = drizzleRepos(env);
  const monthly = await repos.monthlySpend({ businessId, months: 2 });
  if (!monthly.length) return 0;
  const recent = monthly[monthly.length - 1] ?? 0;
  return Math.round((recent / 4) * 100) / 100;
}

/** Resolve cart lines for the audit trail. Bypassed by route validation. */
export const _internal = { findOpenCartByBusiness, listCartItems, and, eq };
