import { Hono } from 'hono';
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { products, supplierProducts, suppliers } from '@vyro/db/schema';
import { parseCsvRecords, toCsv } from '@vyro/shared';
import {
  createSupplierProductSchema,
  updateSupplierProductSchema,
} from '@vyro/validation/supplierProduct';
import { supplierProductImportSchema } from '@vyro/validation/wholesale';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { inventoryService } from '../inventory/service';
import { createOffer, recordAudit, updateOffer } from './repository';

/**
 * Supplier price-list round trip, mounted at /api/supplier-products:
 *   GET  /export?supplierId=  → CSV of every live offer (the import template)
 *   POST /import              → { supplierId, csv, dryRun } bulk create/update
 *
 * A row targets an existing offer by `offer_id`, else by `supplier_sku`, else
 * by `product_id` (catalog id). A `product_id` with no offer yet creates one.
 * Blank cells mean "leave unchanged". `product_name`/`unit` are informational.
 */
export const IMPORT_COLUMNS = [
  'offer_id',
  'product_id',
  'product_name',
  'unit',
  'supplier_sku',
  'price_lkr',
  'min_order_qty',
  'lead_time_days',
  'stock_qty',
  'active',
  'tier1_min_qty',
  'tier1_discount_pct',
  'tier2_min_qty',
  'tier2_discount_pct',
  'tier3_min_qty',
  'tier3_discount_pct',
] as const;

export const MAX_IMPORT_ROWS = 2000;

type Offer = typeof supplierProducts.$inferSelect;

export type ImportRowResult = {
  row: number; // 1-based spreadsheet row (header = 1)
  status: 'created' | 'updated' | 'unchanged' | 'error';
  offerId?: string;
  productName?: string;
  message?: string;
};

const INT_FIELDS = {
  min_order_qty: 'minOrderQty',
  lead_time_days: 'leadTimeDays',
  tier1_min_qty: 'tier1MinQty',
  tier1_discount_pct: 'tier1DiscountPct',
  tier2_min_qty: 'tier2MinQty',
  tier2_discount_pct: 'tier2DiscountPct',
  tier3_min_qty: 'tier3MinQty',
  tier3_discount_pct: 'tier3DiscountPct',
} as const;

/** Parses the editable cells of one row into offer fields. Throws a readable message. */
export function parseRowFields(rec: Record<string, string>): {
  fields: Record<string, unknown>;
  stockQty: number | null;
} {
  const fields: Record<string, unknown> = {};
  const num = (col: string, v: string) => {
    const cleaned = v.replace(/,/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n)) throw new Error(`${col} must be a number (got "${v}")`);
    return n;
  };
  if (rec.price_lkr) {
    const rupees = num('price_lkr', rec.price_lkr);
    if (rupees < 0) throw new Error('price_lkr cannot be negative');
    fields.priceCents = Math.round(rupees * 100);
  }
  for (const [col, key] of Object.entries(INT_FIELDS)) {
    const v = rec[col];
    if (!v) continue;
    const n = num(col, v);
    if (!Number.isInteger(n)) throw new Error(`${col} must be a whole number`);
    fields[key] = n;
  }
  if (rec.supplier_sku !== undefined && rec.supplier_sku !== '') fields.supplierSku = rec.supplier_sku;
  if (rec.active) {
    const v = rec.active.toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(v)) fields.active = true;
    else if (['no', 'n', 'false', '0'].includes(v)) fields.active = false;
    else throw new Error('active must be yes or no');
  }
  let stockQty: number | null = null;
  if (rec.stock_qty) {
    const n = num('stock_qty', rec.stock_qty);
    if (!Number.isInteger(n) || n < 0) throw new Error('stock_qty must be a whole number ≥ 0');
    stockQty = n;
  }
  return { fields, stockQty };
}

function zodMessage(err: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  return err.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
}

function changed(offer: Offer, fields: Record<string, unknown>): boolean {
  return Object.entries(fields).some(([k, v]) => (offer as Record<string, unknown>)[k] !== v);
}

const router = new Hono<{ Bindings: Env }>();

async function requireSupplierMember(d1: D1Database, supplierId: string, userId: string) {
  const supplier = await getDb(d1).select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId)).get();
  if (!supplier) throw httpError(404, 'NOT_FOUND', 'Supplier not found');
  const { supplierService } = await import('../suppliers/service');
  await supplierService.requireMember(d1, supplierId, userId);
}

router.get('/export', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  await requireSupplierMember(c.env.DB, supplierId, ctx.userId);
  const rows = await getDb(c.env.DB)
    .select({ sp: supplierProducts, product: products })
    .from(supplierProducts)
    .innerJoin(products, eq(supplierProducts.productId, products.id))
    .where(eq(supplierProducts.supplierId, supplierId))
    .all();
  const live = rows.filter((r) => !r.sp.deletedAt).sort((a, b) => a.product.name.localeCompare(b.product.name));
  const csv = toCsv(
    [...IMPORT_COLUMNS],
    live.map(({ sp, product }) => [
      sp.id,
      product.id,
      product.name,
      [product.unit, product.packSize].filter(Boolean).join(' · '),
      sp.supplierSku ?? '',
      (sp.priceCents / 100).toFixed(2),
      sp.minOrderQty,
      sp.leadTimeDays,
      sp.trackInventory ? sp.stockQty : '',
      sp.active ? 'yes' : 'no',
      sp.tier1MinQty ?? '',
      sp.tier1DiscountPct ?? '',
      sp.tier2MinQty ?? '',
      sp.tier2DiscountPct ?? '',
      sp.tier3MinQty ?? '',
      sp.tier3DiscountPct ?? '',
    ]),
  );
  const date = new Date().toISOString().slice(0, 10);
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="vyro-price-list-${date}.csv"`,
    'cache-control': 'no-store',
  });
});

router.post('/import', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = supplierProductImportSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { supplierId, csv, dryRun } = parsed.data;
  await requireSupplierMember(c.env.DB, supplierId, ctx.userId);

  const { headers, records } = parseCsvRecords(csv);
  if (!headers.includes('price_lkr') && !headers.includes('stock_qty') && !headers.includes('active')) {
    throw httpError(400, 'VALIDATION_ERROR', 'CSV needs a header row with at least price_lkr, stock_qty or active. Download the template to start.');
  }
  if (!headers.some((h) => h === 'offer_id' || h === 'supplier_sku' || h === 'product_id')) {
    throw httpError(400, 'VALIDATION_ERROR', 'CSV needs an offer_id, supplier_sku or product_id column to match rows.');
  }
  if (records.length === 0) throw httpError(400, 'VALIDATION_ERROR', 'CSV has no data rows');
  if (records.length > MAX_IMPORT_ROWS) {
    throw httpError(400, 'VALIDATION_ERROR', `Import up to ${MAX_IMPORT_ROWS} rows at a time (file has ${records.length}).`);
  }

  const db = getDb(c.env.DB);
  const offers = await db.select().from(supplierProducts).where(eq(supplierProducts.supplierId, supplierId)).all();
  const byId = new Map(offers.map((o) => [o.id, o]));
  const bySku = new Map(offers.filter((o) => o.supplierSku && !o.deletedAt).map((o) => [o.supplierSku!.toLowerCase(), o]));
  const byProduct = new Map(offers.map((o) => [o.productId, o]));
  const productIds = [...new Set(records.map((r) => r.product_id).filter(Boolean))] as string[];
  const catalog = new Map<string, { id: string; name: string; active: boolean; deletedAt: number | null }>();
  for (let i = 0; i < productIds.length; i += 90) {
    const chunk = productIds.slice(i, i + 90);
    const rows = await db
      .select({ id: products.id, name: products.name, active: products.active, deletedAt: products.deletedAt })
      .from(products)
      .where(inArray(products.id, chunk))
      .all();
    for (const p of rows) catalog.set(p.id, p);
  }

  // Creating a first-ever listing is gated on onboarding lessons, same as POST /.
  let trainingBlocked: string[] | null = null;
  if (await isFeatureEnabled(c.env.DB, 'LEARNING_CENTER_ENABLED')) {
    const { getOnboardingGate } = await import('../learning/service');
    const gate = await getOnboardingGate(c.env.DB, supplierId);
    if (gate.required) trainingBlocked = gate.missing as unknown as string[];
  }

  const results: ImportRowResult[] = [];
  const touched = new Set<string>();
  let created = 0;
  let updated = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]!;
    const row = i + 2;
    try {
      const { fields, stockQty } = parseRowFields(rec);
      let offer: Offer | undefined;
      if (rec.offer_id) {
        offer = byId.get(rec.offer_id);
        if (!offer) throw new Error(`offer_id ${rec.offer_id} is not one of your listings`);
      } else if (rec.supplier_sku && bySku.has(rec.supplier_sku.toLowerCase())) {
        offer = bySku.get(rec.supplier_sku.toLowerCase());
      } else if (rec.product_id) {
        offer = byProduct.get(rec.product_id);
      } else {
        throw new Error('Row needs offer_id, a known supplier_sku, or product_id');
      }
      if (offer?.deletedAt) throw new Error('This listing was removed. Restore it in Products before importing.');

      if (offer) {
        if (touched.has(offer.id)) throw new Error('Same listing appears more than once in this file');
        touched.add(offer.id);
        const upd = updateSupplierProductSchema.safeParse(fields);
        if (!upd.success) throw new Error(zodMessage(upd.error));
        const merged = { ...offer, ...upd.data };
        const tierCheck = createSupplierProductSchema.safeParse({
          supplierId, productId: offer.productId, priceCents: merged.priceCents,
          ...(merged.tier1MinQty != null ? { tier1MinQty: merged.tier1MinQty } : {}),
          ...(merged.tier1DiscountPct != null ? { tier1DiscountPct: merged.tier1DiscountPct } : {}),
          ...(merged.tier2MinQty != null ? { tier2MinQty: merged.tier2MinQty } : {}),
          ...(merged.tier2DiscountPct != null ? { tier2DiscountPct: merged.tier2DiscountPct } : {}),
          ...(merged.tier3MinQty != null ? { tier3MinQty: merged.tier3MinQty } : {}),
          ...(merged.tier3DiscountPct != null ? { tier3DiscountPct: merged.tier3DiscountPct } : {}),
        });
        if (!tierCheck.success) throw new Error(zodMessage(tierCheck.error));
        const stockChanges = stockQty != null && (stockQty !== offer.stockQty || !offer.trackInventory);
        const fieldChanges = changed(offer, upd.data);
        if (!fieldChanges && !stockChanges) {
          results.push({ row, status: 'unchanged', offerId: offer.id });
          continue;
        }
        if (!dryRun) {
          if (fieldChanges) await updateOffer(c.env.DB, offer.id, upd.data);
          if (stockChanges) {
            await inventoryService.adjustStock(c.env.DB, c.env.NOTIFICATIONS_QUEUE, offer.id, {
              mode: 'set', quantity: stockQty!, trackInventory: true, note: 'CSV import', actorUserId: ctx.userId,
            });
          }
        }
        updated++;
        results.push({ row, status: 'updated', offerId: offer.id });
        continue;
      }

      // New listing for a catalog product.
      const product = catalog.get(rec.product_id!);
      if (!product || product.deletedAt || !product.active) throw new Error(`product_id ${rec.product_id} is not in the catalog`);
      if (trainingBlocked) throw new Error('Finish the onboarding lessons in the Learning Centre before listing new products');
      if (touched.has(`p:${product.id}`)) throw new Error('Same product appears more than once in this file');
      touched.add(`p:${product.id}`);
      if (fields.priceCents == null) throw new Error('price_lkr is required for a new listing');
      const crt = createSupplierProductSchema.safeParse({
        supplierId,
        productId: product.id,
        ...fields,
        ...(stockQty != null ? { stockQty, trackInventory: true } : {}),
      });
      if (!crt.success) throw new Error(zodMessage(crt.error));
      let offerId: string | undefined;
      if (!dryRun) {
        const { supplierId: _s, active, ...rest } = crt.data as typeof crt.data & { active?: boolean };
        offerId = await createOffer(c.env.DB, { supplierId, ...rest });
        if (active === false) await updateOffer(c.env.DB, offerId, { active: false });
      }
      created++;
      results.push({ row, status: 'created', productName: product.name, ...(offerId ? { offerId } : {}) });
    } catch (e) {
      results.push({ row, status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  const errors = results.filter((r) => r.status === 'error').length;
  if (!dryRun && (created > 0 || updated > 0)) {
    await recordAudit(c.env.DB, {
      actorUserId: ctx.userId,
      action: 'supplier_product.import',
      resourceType: 'supplier',
      resourceId: supplierId,
      metadata: { rows: records.length, created, updated, errors },
      ip: c.req.header('cf-connecting-ip') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    });
  }
  return c.json({
    dryRun,
    summary: {
      rows: records.length,
      created,
      updated,
      unchanged: results.filter((r) => r.status === 'unchanged').length,
      errors,
    },
    results,
  });
});


export default router;
