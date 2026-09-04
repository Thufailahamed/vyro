import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requireRole } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { adminAnalyticsQuery } from '@vyro/validation/analytics';
import { cached } from '../cache';
import { computeAdminAnalytics } from '../repo/admin';
import { getPlatformSettings } from '../../settings/adminRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

function dayBucket(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

router.get('/', requireRole({ admin: true }), async (c) => {
  const parsed = adminAnalyticsQuery.safeParse(c.req.query());
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const range = parsed.data.range ?? '30d';
  const settings = await getPlatformSettings(c.env.DB);
  const key = `admin:${range}:${dayBucket()}`;
  const data = await cached(key, 60_000, () =>
    computeAdminAnalytics(c.env.DB, range, settings.platformFeeBps),
  );
  return c.json(data);
});

export default router;
