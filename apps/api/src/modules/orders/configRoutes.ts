import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { requirePermission } from '../../middleware/rbac';
import { httpError } from '../../lib/errors';
import { orderLifecycleConfigSchema } from '@vyro/validation/orderLifecycle';
import * as cfgSvc from '../admin/platform/configSectionsService';
import { getLifecycleConfig, ORDER_LIFECYCLE_SECTION } from './config';

/** Admin settings for order automation windows + toggles. */
const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('feature_flag:read'), async (c) => {
  const raw = await cfgSvc.read(c.env.DB, ORDER_LIFECYCLE_SECTION);
  return c.json({ value: await getLifecycleConfig(c.env.DB), version: raw.version });
});

const body = z.object({ value: orderLifecycleConfigSchema, expectedVersion: z.number().int().min(0) }).strict();

router.put('/', requirePermission('feature_flag:write'), async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
  const current = await cfgSvc.read(c.env.DB, ORDER_LIFECYCLE_SECTION);
  // Merge so the stamped `automationSince` is never lost by a settings save.
  const merged = { ...((current.value ?? {}) as Record<string, unknown>), ...parsed.data.value };
  await cfgSvc.update(c, ORDER_LIFECYCLE_SECTION, merged, parsed.data.expectedVersion);
  const raw = await cfgSvc.read(c.env.DB, ORDER_LIFECYCLE_SECTION);
  return c.json({ value: await getLifecycleConfig(c.env.DB), version: raw.version });
});

export default router;
