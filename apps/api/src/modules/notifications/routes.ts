import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { notifications } from '@vyro/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { newId } from '@vyro/shared';

const router = new Hono<{ Bindings: Env }>();

const createSchema = z
  .object({ userId: z.string().min(1), type: z.string().min(1).max(60), title: z.string().min(1).max(200), body: z.string().max(2000).optional(), link: z.string().max(500).optional() })
  .strict();

router.post('/', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  if (!ctx.isAdmin) throw httpError(403, 'FORBIDDEN', 'Admin only for direct create');
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const db = getDb(c.env.DB);
  const id = newId();
  await db.insert(notifications).values({
    id,
    userId: parsed.data.userId,
    type: parsed.data.type,
    title: parsed.data.title,
    body: parsed.data.body ?? null,
    link: parsed.data.link ?? null,
    createdAt: Date.now(),
  });
  // Best-effort queue send; never block responses.
  try {
    await c.env.NOTIFICATIONS_QUEUE.send({ notificationId: id, userId: parsed.data.userId, type: parsed.data.type });
  } catch {}
  return c.json({ id }, 201);
});

router.get('/me', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, ctx.userId))
    .orderBy(sql`${notifications.createdAt} desc`)
    .limit(50)
    .all();
  return c.json({ notifications: rows });
});

router.post('/:id/read', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  await db.update(notifications).set({ readAt: Date.now() })
    .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, ctx.userId)));
  return c.json({ ok: true });
});

export const notifyUser = async (d1: D1Database, userId: string, type: string, title: string, body?: string, link?: string) => {
  const db = getDb(d1);
  await db.insert(notifications).values({
    id: newId(),
    userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
    createdAt: Date.now(),
  });
};

export default router;
