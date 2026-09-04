import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requireRole } from '../../middleware/rbac';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { platformSettingsPatchSchema } from '@vyro/validation/settings';
import { getPlatformSettings, patchPlatformSettings } from './adminRepository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', session(), requireRole({ admin: true }), async (c) => {
  const settings = await getPlatformSettings(c.env.DB);
  return c.json({ settings });
});

router.patch('/', session(), requireRole({ admin: true }), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = platformSettingsPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const updated = await patchPlatformSettings(c.env.DB, ctx.userId, parsed.data);
  return c.json({ settings: updated });
});

export default router;
