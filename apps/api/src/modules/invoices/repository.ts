import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import {
  invoices as invoicesTable,
  invoiceItems as invoiceItemsTable,
  invoiceSequences,
  payments as paymentsTable,
  purchaseOrders,
  purchaseOrderItems,
  type Invoice,
  type InvoiceItem,
  type NewInvoice,
  type NewInvoiceItem,
} from '@vyro/db/schema';
import { newId } from '@vyro/shared';

const PREFIX: Record<Invoice['type'], string> = {
  receipt: 'RC',
  tax_invoice: 'INV',
};

/**
 * Atomically allocate the next invoice number for (supplierId, year, type).
 * SQLite supports INSERT ON CONFLICT DO UPDATE ... RETURNING (drizzle `.returning()`).
 */
export async function allocateInvoiceNumber(
  d1: D1Database,
  supplierId: string,
  type: Invoice['type'],
): Promise<{ number: string; year: number; seq: number }> {
  const db = getDb(d1);
  const year = new Date().getUTCFullYear();
  // Ensure sequence row exists
  db.insert(invoiceSequences)
    .values({ supplierId, year, type, lastNumber: 0 })
    .onConflictDoNothing({ target: [invoiceSequences.supplierId, invoiceSequences.year, invoiceSequences.type] })
    .run();
  const updated = (await db
    .update(invoiceSequences)
    .set({ lastNumber: sql`${invoiceSequences.lastNumber} + 1` })
    .where(
      and(
        eq(invoiceSequences.supplierId, supplierId),
        eq(invoiceSequences.year, year),
        eq(invoiceSequences.type, type),
      ),
    )
    .returning({ seq: invoiceSequences.lastNumber })
    .get()) as any;
  if (!updated) throw new Error('invoice sequence increment failed');
  const seq = updated.seq;
  const padded = String(seq).padStart(6, '0');
  const shortSupplier = supplierId.replace(/-/g, '').toUpperCase().slice(0, 8);
  const number = `${PREFIX[type]}-${shortSupplier}-${year}-${padded}`;
  return { number, year, seq };
}

export async function createInvoice(
  d1: D1Database,
  input: {
    type: Invoice['type'];
    paymentId?: string | null;
    purchaseOrderId: string;
    businessId: string;
    supplierId: string;
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    currency: string;
    dueAt?: number | null;
    htmlSnapshot: string;
    createdByUserId?: string | null;
    items: Array<{ description: string; quantity: number; unitCents: number; lineTotalCents: number }>;
  },
): Promise<{ invoice: Invoice; items: InvoiceItem[] }> {
  const db = getDb(d1);
  const { number } = await allocateInvoiceNumber(d1, input.supplierId, input.type);
  const now = Date.now();
  const id = newId();
  const invoiceRow: NewInvoice = {
    id,
    number,
    type: input.type,
    paymentId: input.paymentId ?? null,
    purchaseOrderId: input.purchaseOrderId,
    businessId: input.businessId,
    supplierId: input.supplierId,
    subtotalCents: input.subtotalCents,
    taxCents: input.taxCents,
    totalCents: input.totalCents,
    currency: input.currency,
    issuedAt: now,
    dueAt: input.dueAt ?? null,
    htmlSnapshot: input.htmlSnapshot,
    pdfGeneratedAt: null,
    createdByUserId: input.createdByUserId ?? null,
    createdAt: now,
  };
  const itemRows: NewInvoiceItem[] = input.items.map((it) => ({
    id: newId(),
    invoiceId: id,
    description: it.description,
    quantity: it.quantity,
    unitCents: it.unitCents,
    lineTotalCents: it.lineTotalCents,
  }));
  db.insert(invoicesTable).values(invoiceRow).run();
  if (itemRows.length > 0) db.insert(invoiceItemsTable).values(itemRows).run();
  return { invoice: invoiceRow as Invoice, items: itemRows as InvoiceItem[] };
}

export async function findInvoice(d1: D1Database, id: string): Promise<Invoice | null> {
  const db = getDb(d1);
  return ((await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)).get()) as Invoice | undefined) ?? null;
}

export async function findInvoiceByNumber(d1: D1Database, number: string): Promise<Invoice | null> {
  const db = getDb(d1);
  return ((await db.select().from(invoicesTable).where(eq(invoicesTable.number, number)).get()) as Invoice | undefined) ?? null;
}

export async function listInvoiceItems(d1: D1Database, invoiceId: string): Promise<InvoiceItem[]> {
  const db = getDb(d1);
  return ((await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId)).all()) as any) as InvoiceItem[];
}

export async function listInvoicesForPo(d1: D1Database, poId: string): Promise<Invoice[]> {
  const db = getDb(d1);
  return ((await db.select().from(invoicesTable).where(eq(invoicesTable.purchaseOrderId, poId)).orderBy(desc(invoicesTable.issuedAt)).all()) as any) as Invoice[];
}

export type LineItemForInvoice = {
  description: string;
  quantity: number;
  unitCents: number;
  lineTotalCents: number;
};

export async function buildLineItemsFromPo(d1: D1Database, poId: string): Promise<LineItemForInvoice[]> {
  const db = getDb(d1);
  const rows = ((await db
    .select({
      productName: sql<string>`(SELECT name FROM products WHERE id = ${(purchaseOrderItems as any).productId})`,
      quantity: purchaseOrderItems.quantity,
      unitPriceCents: purchaseOrderItems.unitPriceCents,
      lineTotalCents: purchaseOrderItems.lineTotalCents,
    })
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.purchaseOrderId, poId))
    .all()) as any) as Array<{ productName: string | null; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
  return rows.map((r) => ({
    description: r.productName ?? 'Line item',
    quantity: r.quantity,
    unitCents: r.unitPriceCents,
    lineTotalCents: r.lineTotalCents,
  }));
}

export { invoicesTable, invoiceItemsTable, paymentsTable, purchaseOrders };
