import { Hono } from 'hono';
import { z } from 'zod';
import { uploadCustomsDoc } from './docs';
import { httpError } from '../../lib/errors';
import { session } from '../../middleware/session';
import { hasSupplierAccess, hasBusinessAccess } from '@vyro/auth';
import { getDb } from '@vyro/db';
import { purchaseOrders } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import type { Env } from '../../env';

const uploadSchema = z.object({
  kind: z.enum(['invoice', 'packing-list', 'coo', 'awb', 'bl']),
});

const router = new Hono<{ Bindings: Env }>();

router.post('/orders/:id/customs-docs', session(), async (c) => {
  const ctx = c.get('ctx') as { userId: string; businessId?: string; supplierId?: string; role?: string };
  const orderId = c.req.param('id');
  const kindParsed = uploadSchema.safeParse(await c.req.json().catch(() => null));
  if (!kindParsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');

  const db = getDb(c.env.DB);
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, orderId)).limit(1);
  if (!po) throw httpError(404, 'NOT_FOUND', 'Order not found');
  if (po.direction || po.direction === 'export' || po.direction === 'import') {
    // continue
  }

  // Auth: supplier on the PO, or admin
  const supplierOk = ctx.supplierId && po.supplierId === ctx.supplierId && hasSupplierAccess(ctx as never, po.supplierId);
  const adminOk = ctx.role === 'admin';
  if (!supplierOk && !adminOk) throw httpError(403, 'FORBIDDEN', 'Supplier role required');

  const bytes = await c.req.arrayBuffer();
  const r = await uploadCustomsDoc({
    db,
    env: c.env,
    orderId,
    kind: kindParsed.data.kind,
    bytes,
    uploadedBy: ctx.userId,
  });
  return c.json(r);
});

export default router;