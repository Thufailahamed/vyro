import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { getDb } from '@vyro/db';
import { users, auditLogs } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import { newId } from '@vyro/shared';
import { logger } from '../../lib/logger';

const body = z.object({ confirm: z.literal('DELETE') });

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.post('/me/delete', async (c) => {
  const ctx = c.get('ctx') as { userId: string };
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  }
  const runAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const db = getDb(c.env.DB);
  await db
    .update(users)
    .set({ status: 'pending_deletion', deletionScheduledFor: runAt })
    .where(eq(users.id, ctx.userId))
    .run();
  await db
    .insert(auditLogs)
    .values({
      id: newId(),
      action: 'account.delete.scheduled',
      resourceType: 'user',
      resourceId: ctx.userId,
      actorUserId: ctx.userId,
      metadata: JSON.stringify({ runAt }),
      ip: null,
      userAgent: null,
      createdAt: Date.now(),
    })
    .run();
  // eslint-disable-next-line no-console
  logger.info('account.delete.scheduled', { userId: ctx.userId, scheduledAt: new Date(runAt).toISOString() });
  return c.json({ ok: true, scheduledAt: runAt }, 202);
});

export default router;
