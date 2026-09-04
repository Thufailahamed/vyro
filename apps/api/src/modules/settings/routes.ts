import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import {
  userProfilePatchSchema,
  userNotificationsPatchSchema,
  userSecurityPatchSchema,
} from '@vyro/validation/settings';
import { getOrCreateUserSettings, patchUserSettings } from './repository';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/me', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const settings = await getOrCreateUserSettings(c.env.DB, ctx.userId);
  return c.json({ settings });
});

router.patch('/me', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = userProfilePatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const updated = await patchUserSettings(c.env.DB, ctx.userId, parsed.data);
  return c.json({ settings: updated });
});

router.get('/me/notifications', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const s = await getOrCreateUserSettings(c.env.DB, ctx.userId);
  return c.json({
    notifyOrderUpdates: s.notifyOrderUpdates === 1,
    notifyMessages: s.notifyMessages === 1,
    notifyMarketing: s.notifyMarketing === 1,
  });
});

router.patch('/me/notifications', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = userNotificationsPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const updated = await patchUserSettings(c.env.DB, ctx.userId, parsed.data);
  return c.json({
    notifyOrderUpdates: updated.notifyOrderUpdates === 1,
    notifyMessages: updated.notifyMessages === 1,
    notifyMarketing: updated.notifyMarketing === 1,
  });
});

router.get('/me/security', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const s = await getOrCreateUserSettings(c.env.DB, ctx.userId);
  return c.json({
    twoFactorEnabled: s.twoFactorEnabled === 1,
    sessionTimeoutMin: s.sessionTimeoutMin,
  });
});

router.patch('/me/security', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = userSecurityPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const updated = await patchUserSettings(c.env.DB, ctx.userId, parsed.data);
  return c.json({
    twoFactorEnabled: updated.twoFactorEnabled === 1,
    sessionTimeoutMin: updated.sessionTimeoutMin,
  });
});

export default router;
