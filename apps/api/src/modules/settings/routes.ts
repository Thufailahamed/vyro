import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
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
import { newId } from '@vyro/shared';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import exportRouter from './export';
import deleteRouter from './delete';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const avatarUploadSchema = z
  .object({
    filename: z.string().min(1).max(120),
    contentType: z.string().regex(/^image\/(png|jpeg|webp|gif)$/),
    base64: z.string().min(8).max(6_000_000),
  })
  .strict();

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
  const db = getDb(c.env.DB);
  const user = await db.select({ marketingOptIn: users.marketingOptIn }).from(users).where(eq(users.id, ctx.userId)).get();
  return c.json({
    notifyOrderUpdates: s.notifyOrderUpdates === 1,
    notifyMessages: s.notifyMessages === 1,
    notifyMarketing: s.notifyMarketing === 1,
    marketingOptIn: user?.marketingOptIn ?? true,
  });
});

router.patch('/me/notifications', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = userNotificationsPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const { marketingOptIn, ...rest } = parsed.data;
  const updated = await patchUserSettings(c.env.DB, ctx.userId, rest);
  let marketingOptInValue: boolean | undefined;
  if (marketingOptIn !== undefined) {
    const db = getDb(c.env.DB);
    await db.update(users).set({ marketingOptIn }).where(eq(users.id, ctx.userId)).run();
    marketingOptInValue = marketingOptIn;
  }
  return c.json({
    notifyOrderUpdates: updated.notifyOrderUpdates === 1,
    notifyMessages: updated.notifyMessages === 1,
    notifyMarketing: updated.notifyMarketing === 1,
    ...(marketingOptInValue !== undefined ? { marketingOptIn: marketingOptInValue } : {}),
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

router.post('/me/avatar', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = avatarUploadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());

  const bytes = Uint8Array.from(atob(parsed.data.base64), (ch) => ch.charCodeAt(0));
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw httpError(413, 'PAYLOAD_TOO_LARGE', 'Avatar exceeds 2MB');
  }

  const ext = parsed.data.filename.split('.').pop()?.toLowerCase() ?? 'png';
  const safeExt = /^(png|jpg|jpeg|webp|gif)$/.test(ext) ? ext : 'png';
  const r2Key = `avatars/${ctx.userId}/${newId()}.${safeExt}`;
  await c.env.PRODUCTS.put(r2Key, bytes, {
    httpMetadata: { contentType: parsed.data.contentType },
  });

  const avatarUrl = `/api/settings/avatars/${r2Key}`;
  const updated = await patchUserSettings(c.env.DB, ctx.userId, { avatarUrl });
  return c.json({ avatarUrl, settings: updated });
});

router.get('/avatars/:key{.*}', async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  const key = c.req.param('key');
  if (!key.startsWith('avatars/')) throw httpError(404, 'NOT_FOUND', 'Not found');
  const object = await c.env.PRODUCTS.get(key);
  if (!object) return c.text('Not found', 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
});

router.route('/', exportRouter);
router.route('/', deleteRouter);

export default router;
