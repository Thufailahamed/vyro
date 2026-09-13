import { Hono } from 'hono';
import type { Env } from '../env';
import { INITIAL_RULES } from '@vyro/shared';
import { SilenceBodySchema } from '@vyro/validation';
import {
  silenceRule,
  unsilenceRule,
  isSilenced,
} from '../observability/silence';
import { getDb } from '@vyro/db';
import { notifications } from '@vyro/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { session } from '../middleware/session';
import { requirePermission } from '../middleware/rbac';

const router = new Hono<{ Bindings: Env }>();

router.use('*', session());

router.get('/api/admin/observability/alerts/rules', requirePermission('observability:read'), async (c) => {
  const enriched = await Promise.all(
    INITIAL_RULES.map(async (r) => ({
      ...r,
      silenced: !!(await isSilenced(c.env, r.name)),
    })),
  );
  return c.json({ rules: enriched });
});

router.get('/api/admin/observability/alerts/history', requirePermission('observability:read'), async (c) => {
  const url = new URL(c.req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const db = getDb(c.env.DB);
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.type, 'observability_alert'))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .all();
  return c.json({ rows });
});

router.post('/api/admin/observability/alerts/silence', requirePermission('observability:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = SilenceBodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const ctx = (c.get('ctx') as { userId?: string } | undefined) ?? {};
  const entry = await silenceRule(
    c.env,
    parsed.data.ruleName,
    ctx.userId ?? 'unknown',
    parsed.data.reason,
    parsed.data.durationMinutes,
  );
  return c.json({ ok: true, entry });
});

router.delete('/api/admin/observability/alerts/silence/:ruleName', requirePermission('observability:write'), async (c) => {
  await unsilenceRule(c.env, c.req.param('ruleName'));
  return c.json({ ok: true });
});

export default router;