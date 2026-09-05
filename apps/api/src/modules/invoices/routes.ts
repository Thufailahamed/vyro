import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { and, eq } from 'drizzle-orm';
import {
  businessMembers,
  purchaseOrders,
  type Invoice,
} from '@vyro/db/schema';
import { isSupplierMember } from '../payments/membership';
import {
  findInvoice,
  findInvoiceByNumber,
  listInvoiceItems,
  listInvoicesForPo,
} from './repository';

const router = new Hono<{ Bindings: Env }>();

async function loadPoForInvoice(d1: D1Database, invoice: Invoice) {
  const db = getDb(d1);
  return db.select().from(purchaseOrders).where(eq(purchaseOrders.id, invoice.purchaseOrderId)).get() ?? null;
}

async function assertInvoiceAccess(d1: D1Database, ctx: Ctx, po: { businessId: string; supplierId: string }): Promise<void> {
  if (ctx.isAdmin) return;
  const db = getDb(d1);
  const biz = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(and(eq(businessMembers.businessId, po.businessId), eq(businessMembers.userId, ctx.userId)))
    .get();
  const sup = await isSupplierMember(d1, po.supplierId, ctx.userId);
  if (!biz && !sup) throw httpError(403, 'FORBIDDEN', 'No access');
}

async function loadInvoiceByIdOrNumber(d1: D1Database, idOrNumber: string): Promise<Invoice | null> {
  return (await findInvoice(d1, idOrNumber)) ?? (await findInvoiceByNumber(d1, idOrNumber));
}

router.get('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const poId = c.req.query('poId');
  if (!poId) throw httpError(400, 'VALIDATION_ERROR', 'poId required');

  const db = getDb(c.env.DB);
  const po = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId)).get();
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  await assertInvoiceAccess(c.env.DB, ctx, po);

  const items = await listInvoicesForPo(c.env.DB, poId);
  return c.json({ invoices: items });
});

router.get('/:id', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const invoice = await loadInvoiceByIdOrNumber(c.env.DB, c.req.param('id'));
  if (!invoice) throw httpError(404, 'NOT_FOUND', 'Invoice not found');
  const po = await loadPoForInvoice(c.env.DB, invoice);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO missing');
  await assertInvoiceAccess(c.env.DB, ctx, po);
  const items = await listInvoiceItems(c.env.DB, invoice.id);
  const { htmlSnapshot: _omit, ...safe } = invoice;
  return c.json({ invoice: safe, items });
});

router.get('/:id/html', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const invoice = await loadInvoiceByIdOrNumber(c.env.DB, c.req.param('id'));
  if (!invoice) throw httpError(404, 'NOT_FOUND', 'Invoice not found');
  const po = await loadPoForInvoice(c.env.DB, invoice);
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO missing');
  await assertInvoiceAccess(c.env.DB, ctx, po);
  c.header('Content-Type', 'text/html; charset=utf-8');
  c.header('Content-Disposition', `inline; filename="${invoice.number}.html"`);
  return c.body(invoice.htmlSnapshot);
});

export default router;
