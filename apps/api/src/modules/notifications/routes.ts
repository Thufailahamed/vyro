import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import { getDb } from '@vyro/db';
import { notifications } from '@vyro/db/schema';
import { and, count, desc, eq, isNull, lt } from 'drizzle-orm';
import { newId } from '@vyro/shared';
import { queueSend } from '../../lib/queue';
import { requirePermission } from '../../middleware/rbac';
export {
  notifyUsers,
  notifyOrderParties,
  notifySupplierOrg,
  notifyBusinessOrg,
} from './dispatcher';

const router = new Hono<{ Bindings: Env }>();

const createSchema = z
  .object({ userId: z.string().min(1), type: z.string().min(1).max(60), title: z.string().min(1).max(200), body: z.string().max(2000).optional(), link: z.string().max(500).optional() })
  .strict();

router.post('/', session(), requirePermission('notification:write'), async (c) => {
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
    await queueSend(c.env, 'notifications', { notificationId: id, userId: parsed.data.userId, type: parsed.data.type });
  } catch {}
  return c.json({ id }, 201);
});

router.get('/me', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  const limitRaw = Number(c.req.query('limit') ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 50;
  const before = Number(c.req.query('before') ?? 0);
  const unreadOnly = c.req.query('unread') === '1' || c.req.query('unread') === 'true';
  const source = c.req.query('source');

  const filters = [eq(notifications.userId, ctx.userId)];
  if (Number.isFinite(before) && before > 0) filters.push(lt(notifications.createdAt, before));
  if (unreadOnly) filters.push(isNull(notifications.readAt));
  if (source === 'ai') filters.push(eq(notifications.source, 'ai'));
  if (source === 'system') filters.push(eq(notifications.source, 'system'));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...filters))
    .orderBy(desc(notifications.createdAt))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const unread = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)))
    .get();

  return c.json({
    notifications: page,
    unreadCount: unread?.n ?? 0,
    nextCursor: hasMore ? (page[page.length - 1]?.createdAt ?? null) : null,
  });
});

router.get('/me/unread-count', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  const source = c.req.query('source');
  const conditions = [eq(notifications.userId, ctx.userId), isNull(notifications.readAt)];
  if (source === 'ai') conditions.push(eq(notifications.source, 'ai'));
  if (source === 'system') conditions.push(eq(notifications.source, 'system'));
  const row = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(...conditions))
    .get();
  return c.json({ unreadCount: row?.n ?? 0 });
});

router.post('/me/read-all', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  const now = Date.now();
  const result = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)))
    .run();
  const changes = (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
  return c.json({ ok: true, readAt: now, updated: changes });
});

router.post('/:id/read', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const db = getDb(c.env.DB);
  const result = await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, ctx.userId)));
  // 0 changes means the notification does not belong to the caller
  // (or does not exist). Surface as 404 instead of a silent no-op.
  const changes =
    (result as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
  if (changes === 0) {
    throw httpError(404, 'NOT_FOUND', 'Notification not found');
  }
  return c.json({ ok: true });
});

/**
 * Single-user convenience wrapper. Goes through the dispatcher so preferences
 * are always honoured.
 */
export const notifyUser = async (
  d1: D1Database,
  userId: string,
  type: string,
  title: string,
  body?: string,
  link?: string,
) => {
  const { notifyUsers } = await import('./dispatcher');
  await notifyUsers(d1, undefined, [userId], {
    type,
    title,
    body: body ?? null,
    link: link ?? null,
  });
};

export default router;
