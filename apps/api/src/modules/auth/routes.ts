import { Hono } from 'hono';
import { signUpSchema } from '@vyro/validation/auth';
import { createAuth } from '@vyro/auth';
import { ensureEmailAvailable } from './service';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.post('/signup', async (c) => {
  const parsed = signUpSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await ensureEmailAvailable(c.env.DB, parsed.data.email);
  const auth = createAuth(c.env);
  const result = await auth.api.signUpEmail({
    body: {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      name: parsed.data.name,
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
    },
    asResponse: false,
  });
  return c.json({ ok: true, userId: result.user.id }, 201);
});

router.post('/sign-out', async (c) => {
  const auth = createAuth(c.env);
  await auth.api.signOut({ headers: c.req.raw.headers });
  return c.json({ ok: true });
});

router.get('/me', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw httpError(401, 'UNAUTHORIZED', 'No active session');
  return c.json({ user: session.user });
});

export default router;
