import { Hono } from 'hono';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { orderReturnAttachments } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { hasBusinessAccess, hasSupplierAccess, requireBusinessRole, requireSupplierRole } from '@vyro/auth';
import { newId } from '@vyro/shared';
import {
  returnApproveSchema,
  returnCreateSchema,
  returnReasonSchema,
  returnReceiveSchema,
} from '@vyro/validation/orderLifecycle';
import { findPo } from '../purchaseOrders/repository';
import { findReturn, getReturnWithItems, listReturns, listReturnsForPo } from './repository';
import { approveReturn, cancelReturn, createReturn, receiveReturn, rejectReturn } from './service';

const BUYER_ROLES = ['owner', 'manager', 'purchasing'] as const;
const SUPPLIER_ROLES = ['owner', 'sales', 'operations'] as const;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function ctxOf(c: { get: (k: 'ctx') => Ctx | undefined }): Ctx {
  const ctx = c.get('ctx');
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

/** Decide which side of the return the caller acts as. */
function sideFor(ctx: Ctx, ret: { businessId: string; supplierId: string }, want?: 'business' | 'supplier') {
  if (ctx.isAdmin) return 'admin' as const;
  if (want !== 'supplier' && hasBusinessAccess(ctx, ret.businessId)) {
    requireBusinessRole(ctx, ret.businessId, BUYER_ROLES);
    return 'business' as const;
  }
  if (hasSupplierAccess(ctx, ret.supplierId)) {
    requireSupplierRole(ctx, ret.supplierId, SUPPLIER_ROLES);
    return 'supplier' as const;
  }
  throw httpError(403, 'FORBIDDEN', 'No access to this return');
}

/* ----- Order-scoped (mounted under /api/purchase-orders) ----- */
export const poReturnsRouter = new Hono<{ Bindings: Env }>();

poReturnsRouter.post('/:id/returns', session(), async (c) => {
  const ctx = ctxOf(c);
  const parsed = returnCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  let role: 'business' | 'admin';
  if (ctx.isAdmin) role = 'admin';
  else {
    requireBusinessRole(ctx, po.businessId, BUYER_ROLES);
    role = 'business';
  }
  const out = await createReturn(c.env, po.id, { role, userId: ctx.userId }, parsed.data);
  return c.json({ return: out }, 201);
});

poReturnsRouter.get('/:id/returns', session(), async (c) => {
  const ctx = ctxOf(c);
  const po = await findPo(c.env.DB, c.req.param('id'));
  if (!po) throw httpError(404, 'NOT_FOUND', 'PO not found');
  if (!ctx.isAdmin && !hasBusinessAccess(ctx, po.businessId) && !hasSupplierAccess(ctx, po.supplierId)) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  return c.json({ returns: await listReturnsForPo(c.env.DB, po.id) });
});

/* ----- Return-scoped (mounted under /api/returns) ----- */
export const returnsRouter = new Hono<{ Bindings: Env }>();
returnsRouter.use('*', session());

returnsRouter.get('/', async (c) => {
  const ctx = ctxOf(c);
  const businessId = c.req.query('businessId');
  const supplierId = c.req.query('supplierId');
  const status = c.req.query('status');
  const statuses = status ? status.split(',').filter(Boolean) : undefined;
  if (businessId) {
    requireBusinessRole(ctx, businessId, BUYER_ROLES);
    return c.json({ returns: await listReturns(c.env.DB, { businessId, ...(statuses ? { statuses } : {}) }) });
  }
  if (supplierId) {
    requireSupplierRole(ctx, supplierId, SUPPLIER_ROLES);
    return c.json({ returns: await listReturns(c.env.DB, { supplierId, ...(statuses ? { statuses } : {}) }) });
  }
  throw httpError(400, 'VALIDATION_ERROR', 'businessId or supplierId required');
});

returnsRouter.get('/:id', async (c) => {
  const ctx = ctxOf(c);
  const ret = await getReturnWithItems(c.env.DB, c.req.param('id'));
  if (!ret) throw httpError(404, 'NOT_FOUND', 'Return not found');
  if (!ctx.isAdmin && !hasBusinessAccess(ctx, ret.businessId) && !hasSupplierAccess(ctx, ret.supplierId)) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  return c.json({ return: ret });
});

async function loadForAction(c: { env: Env; req: { param: (k: string) => string } }, id: string) {
  const ret = await findReturn(c.env.DB, id);
  if (!ret) throw httpError(404, 'NOT_FOUND', 'Return not found');
  return ret;
}

returnsRouter.post('/:id/approve', async (c) => {
  const ctx = ctxOf(c);
  const ret = await loadForAction(c, c.req.param('id'));
  const side = sideFor(ctx, ret, 'supplier');
  if (side === 'business') throw httpError(403, 'FORBIDDEN', 'Only the supplier can approve a return');
  const parsed = returnApproveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json({ return: await approveReturn(c.env, ret.id, { role: side, userId: ctx.userId }, parsed.data) });
});

returnsRouter.post('/:id/reject', async (c) => {
  const ctx = ctxOf(c);
  const ret = await loadForAction(c, c.req.param('id'));
  const side = sideFor(ctx, ret, 'supplier');
  if (side === 'business') throw httpError(403, 'FORBIDDEN', 'Only the supplier can reject a return');
  const parsed = returnReasonSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(422, 'REASON_REQUIRED', 'A reason is required', parsed.error.flatten());
  return c.json({ return: await rejectReturn(c.env, ret.id, { role: side, userId: ctx.userId }, parsed.data.reason) });
});

returnsRouter.post('/:id/receive', async (c) => {
  const ctx = ctxOf(c);
  const ret = await loadForAction(c, c.req.param('id'));
  const side = sideFor(ctx, ret, 'supplier');
  if (side === 'business') throw httpError(403, 'FORBIDDEN', 'Only the supplier can receive a return');
  const parsed = returnReceiveSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json({ return: await receiveReturn(c.env, ret.id, { role: side, userId: ctx.userId }, parsed.data) });
});

returnsRouter.post('/:id/cancel', async (c) => {
  const ctx = ctxOf(c);
  const ret = await loadForAction(c, c.req.param('id'));
  const side = sideFor(ctx, ret, 'business');
  if (side === 'supplier') throw httpError(403, 'FORBIDDEN', 'Only the buyer can withdraw a return');
  const parsed = returnReasonSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(422, 'REASON_REQUIRED', 'A reason is required', parsed.error.flatten());
  return c.json({ return: await cancelReturn(c.env, ret.id, { role: side, userId: ctx.userId }, parsed.data.reason) });
});

/** Buyer uploads photos/evidence; supplier/admin can read them. */
returnsRouter.post('/:id/attachments', async (c) => {
  const ctx = ctxOf(c);
  const ret = await loadForAction(c, c.req.param('id'));
  sideFor(ctx, ret);
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') throw httpError(400, 'VALIDATION_ERROR', 'file is required');
  const blob = file as File;
  if (!ALLOWED_TYPES.includes(blob.type)) throw httpError(400, 'VALIDATION_ERROR', 'Only JPEG, PNG, WebP or PDF files');
  if (blob.size > MAX_ATTACHMENT_BYTES) throw httpError(413, 'PAYLOAD_TOO_LARGE', 'File exceeds 8 MB');
  const id = newId();
  const key = `returns/${ret.id}/${id}`;
  await c.env.INVOICES.put(key, await blob.arrayBuffer(), { httpMetadata: { contentType: blob.type } });
  await getDb(c.env.DB)
    .insert(orderReturnAttachments)
    .values({ id, returnId: ret.id, r2Key: key, contentType: blob.type, uploadedByUserId: ctx.userId, createdAt: Date.now() })
    .run();
  return c.json({ attachment: { id, contentType: blob.type } }, 201);
});

returnsRouter.get('/:id/attachments/:attId', async (c) => {
  const ctx = ctxOf(c);
  const ret = await loadForAction(c, c.req.param('id'));
  if (!ctx.isAdmin && !hasBusinessAccess(ctx, ret.businessId) && !hasSupplierAccess(ctx, ret.supplierId)) {
    throw httpError(403, 'FORBIDDEN', 'No access');
  }
  const att = await getDb(c.env.DB)
    .select()
    .from(orderReturnAttachments)
    .where(eq(orderReturnAttachments.id, c.req.param('attId')))
    .get();
  if (!att || att.returnId !== ret.id) throw httpError(404, 'NOT_FOUND', 'Attachment not found');
  const obj = await c.env.INVOICES.get(att.r2Key);
  if (!obj) throw httpError(404, 'NOT_FOUND', 'Attachment missing');
  return new Response(obj.body, {
    headers: { 'content-type': att.contentType ?? 'application/octet-stream', 'cache-control': 'private, max-age=300' },
  });
});

/* ----- Admin queue (mounted under /api/admin/returns) ----- */
export const adminReturnsRouter = new Hono<{ Bindings: Env }>();
adminReturnsRouter.use('*', session(), requireRole({ admin: true }));

adminReturnsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  const statuses = status ? status.split(',').filter(Boolean) : ['requested', 'approved', 'received'];
  return c.json({ returns: await listReturns(c.env.DB, { statuses, limit: 200 }) });
});
