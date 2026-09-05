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
import {
  buildLineItemsFromPo,
  createInvoice,
  listInvoicesForPo,
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

  const lineItems: LineItemForInvoice[] = await buildLineItemsFromPo(d1, po.id);
  // Recompute subtotal/total from line items to keep snapshot truthful
  const subtotal = lineItems.reduce((s, it) => s + it.lineTotalCents, 0);
  const tax = 0; // v1: no tax breakdown; surface in next iteration
  const total = subtotal + tax;

  // Pre-create invoice row to get id for template, then snapshot
  const brandName = sup.name; // supplier name in receipt header per spec
  const html = renderInvoiceHtml({
    invoice: {
      id: 'pending',
      number: 'pending',
      type: options.type,
      paymentId: payment.id,
      purchaseOrderId: po.id,
      businessId: biz.id,
      supplierId: sup.id,
      subtotalCents: subtotal,
      taxCents: tax,
      totalCents: total,
      currency: payment.currency,
      issuedAt: Date.now(),
      dueAt: options.dueAt ?? null,
      htmlSnapshot: '',
      pdfGeneratedAt: null,
      createdByUserId: options.createdByUserId ?? null,
      createdAt: Date.now(),
    },
    items: lineItems.map((it, idx) => ({
      id: `pending-${idx}`,
      invoiceId: 'pending',
      ...it,
    })),
    business: biz,
    supplier: sup,
    po,
    brandName,
  });

  const created = await createInvoice(d1, {
    type: options.type,
    paymentId: payment.id,
    purchaseOrderId: po.id,
    businessId: biz.id,
    supplierId: sup.id,
    subtotalCents: subtotal,
    taxCents: tax,
    totalCents: total,
    currency: payment.currency,
    dueAt: options.dueAt ?? null,
    htmlSnapshot: html,
    createdByUserId: options.createdByUserId ?? null,
    items: lineItems,
  });
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
