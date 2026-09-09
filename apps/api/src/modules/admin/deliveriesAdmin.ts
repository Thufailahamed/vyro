import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { deliveries } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { adminListQuery, adminReasonBody } from '@vyro/validation';
import { auditAdmin } from './lib/audit';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/', async (c) => {
  const parsed = adminListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(deliveries)
    .limit(parsed.data.limit ?? 50)
    .all();
  return c.json({ deliveries: rows });
});

const reassignSchema = adminReasonBody.extend({ assigneeId: z.string().min(1) });

router.post('/:id/reassign', async (c) => {
  const parsed = reassignSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(deliveries).where(eq(deliveries.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Delivery not found');
  await auditAdmin({
    ctx: c,
    action: 'delivery.reassign',
    target: { type: 'delivery', id: row.id },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

router.post('/:id/mark-lost', async (c) => {
  const parsed = adminReasonBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const row = await db.select().from(deliveries).where(eq(deliveries.id, c.req.param('id'))).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Delivery not found');
  await auditAdmin({
    ctx: c,
    action: 'delivery.mark-lost',
    target: { type: 'delivery', id: row.id },
    after: parsed.data,
  });
  return c.json({ ok: true });
});

export default router;
