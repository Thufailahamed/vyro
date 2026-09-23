import { getDb } from '@vyro/db';
import {
  businesses,
  payments,
  purchaseOrders,
  suppliers,
  type Payment,
} from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { renderInvoiceHtml } from './template';
import { extractInclusiveTax } from '@vyro/shared';
import { readSupplierSettingsForSystem } from '../settings/supplierRepository';
import {
  buildLineItemsFromPo,
  createInvoice,
  listInvoicesForPo,
  updateInvoiceSnapshot,
  type LineItemForInvoice,
} from './repository';

interface GenerateOptions {
  type: 'receipt' | 'tax_invoice';
  dueAt?: number | null;
  createdByUserId?: string | null;
}

/**
 * Idempotent: if an invoice already exists for (poId, type, paymentId), returns existing.
 * Otherwise allocates number, snapshots HTML, inserts rows.
 */
export async function generateInvoiceForPayment(
  d1: D1Database,
  paymentId: string,
  options: GenerateOptions,
): Promise<{ id: string; number: string } | null> {
  const db = getDb(d1);
  const payment = (await db.select().from(payments).where(eq(payments.id, paymentId)).get()) as any as Payment | undefined;
  if (!payment) return null;

  // Dedup: check if invoice already exists for (poId, paymentId, type)
  const existing = (await listInvoicesForPo(d1, payment.purchaseOrderId)).find(
    (inv) => inv.paymentId === payment.id && inv.type === options.type,
  );
  if (existing) return { id: existing.id, number: existing.number };

  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, payment.purchaseOrderId)).get()) as any;
  if (!po) return null;
  const biz = (await db.select().from(businesses).where(eq(businesses.id, po.businessId)).get()) as any;
  const sup = (await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).get()) as any;
  if (!biz || !sup) return null;

  const lineItems: LineItemForInvoice[] = await buildLineItemsFromPo(d1, po.id, po);
  // Prices are tax-inclusive: the gross is what the buyer paid for the lines.
  // VAT/SSCL are extracted from it for registered suppliers (see @vyro/shared tax).
  const gross = lineItems.reduce((s, it) => s + it.lineTotalCents, 0);
  const taxSettings = await readSupplierSettingsForSystem(d1, sup.id);
  const breakdown = extractInclusiveTax(gross, {
    vatRegistered: taxSettings?.vatRegistered ?? false,
    ssclRegistered: taxSettings?.ssclRegistered ?? false,
  });
  const supplierVatNo = breakdown.vatBps > 0 ? (taxSettings?.vatRegistrationNo ?? taxSettings?.taxId ?? null) : null;
  const brandName = sup.name; // supplier name in receipt header per spec

  const created = await createInvoice(d1, {
    type: options.type,
    paymentId: payment.id,
    purchaseOrderId: po.id,
    businessId: biz.id,
    supplierId: sup.id,
    subtotalCents: breakdown.netCents,
    taxCents: breakdown.taxCents,
    vatCents: breakdown.vatCents,
    ssclCents: breakdown.ssclCents,
    supplierVatNo,
    buyerTaxId: biz.taxId ?? null,
    totalCents: breakdown.grossCents,
    currency: payment.currency,
    dueAt: options.dueAt ?? null,
    htmlSnapshot: '',
    createdByUserId: options.createdByUserId ?? null,
    items: lineItems,
  });

  // Render once the number is allocated so the printed invoice carries it.
  const html = renderInvoiceHtml({
    invoice: created.invoice,
    items: created.items,
    business: biz,
    supplier: sup,
    po,
    brandName,
    tax: { vatBps: breakdown.vatBps, ssclBps: breakdown.ssclBps },
  });
  await updateInvoiceSnapshot(d1, created.invoice.id, html);
  return { id: created.invoice.id, number: created.invoice.number };
}

/**
 * Credit note for money given back on a delivered order (returns, partial
 * accept, partial dispute). Lines are passed explicitly — a credit note covers
 * only the returned/removed goods, not the whole PO. Idempotent per sourceKey
 * via the caller storing the returned id (e.g. order_returns.credit_note_invoice_id).
 */
export async function generateCreditNote(
  d1: D1Database,
  args: {
    poId: string;
    lines: Array<{ description: string; quantity: number; unitCents: number; lineTotalCents: number }>;
    createdByUserId?: string | null;
    paymentId?: string | null;
  },
): Promise<{ id: string; number: string } | null> {
  const db = getDb(d1);
  const po = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, args.poId)).get()) as any;
  if (!po || args.lines.length === 0) return null;
  const biz = (await db.select().from(businesses).where(eq(businesses.id, po.businessId)).get()) as any;
  const sup = (await db.select().from(suppliers).where(eq(suppliers.id, po.supplierId)).get()) as any;
  if (!biz || !sup) return null;
  const gross = args.lines.reduce((s, it) => s + it.lineTotalCents, 0);
  const taxSettings = await readSupplierSettingsForSystem(d1, sup.id);
  const breakdown = extractInclusiveTax(gross, {
    vatRegistered: taxSettings?.vatRegistered ?? false,
    ssclRegistered: taxSettings?.ssclRegistered ?? false,
  });
  const created = await createInvoice(d1, {
    type: 'credit_note',
    paymentId: args.paymentId ?? null,
    purchaseOrderId: po.id,
    businessId: biz.id,
    supplierId: sup.id,
    subtotalCents: breakdown.netCents,
    taxCents: breakdown.taxCents,
    vatCents: breakdown.vatCents,
    ssclCents: breakdown.ssclCents,
    supplierVatNo: breakdown.vatBps > 0 ? (taxSettings?.vatRegistrationNo ?? taxSettings?.taxId ?? null) : null,
    buyerTaxId: biz.taxId ?? null,
    totalCents: breakdown.grossCents,
    currency: po.currency ?? 'LKR',
    htmlSnapshot: '',
    createdByUserId: args.createdByUserId ?? null,
    items: args.lines,
  });
  const html = renderInvoiceHtml({
    invoice: created.invoice,
    items: created.items,
    business: biz,
    supplier: sup,
    po,
    brandName: sup.name,
    tax: { vatBps: breakdown.vatBps, ssclBps: breakdown.ssclBps },
  });
  await updateInvoiceSnapshot(d1, created.invoice.id, html);
  return { id: created.invoice.id, number: created.invoice.number };
}

export async function generateReceiptForPayment(
  d1: D1Database,
  payment: Payment,
): Promise<{ id: string; number: string } | null> {
  return generateInvoiceForPayment(d1, payment.id, {
    type: 'receipt',
    createdByUserId: payment.confirmedByUserId,
  });
}

export async function generateTaxInvoiceForPayment(
  d1: D1Database,
  payment: Payment,
  dueAt?: number | null,
): Promise<{ id: string; number: string } | null> {
  return generateInvoiceForPayment(d1, payment.id, {
    type: 'tax_invoice',
    dueAt: dueAt ?? null,
    createdByUserId: payment.confirmedByUserId,
  });
}
