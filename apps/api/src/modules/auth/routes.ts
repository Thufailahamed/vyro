import { Hono } from 'hono';
import { signUpSchema, signInSchema } from '@vyro/validation/auth';
import { createAuth, loadSessionContext } from '@vyro/auth';
import { getDb } from '@vyro/db';
import { users } from '@vyro/db/schema';
import { ensureEmailAvailable } from './service';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';


const router = new Hono<{ Bindings: Env }>();

const handleSignUp = async (c: any) => {
  const parsed = signUpSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  await ensureEmailAvailable(c.env.DB, parsed.data.email);
  const auth = createAuth(c.env);
  const res = await auth.api.signUpEmail({
    body: {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      name: parsed.data.name,
      ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
    },
    headers: c.req.raw.headers,
    asResponse: true,
  });

  if (res.ok) {
    const cloned = res.clone();
    const data = (await cloned.json().catch(() => null)) as { user?: { id: string } } | null;
    if (data?.user?.id) {
      const db = getDb(c.env.DB);
      const now = Date.now();
      await db
        .insert(users)
        .values({
          id: data.user.id,
          email: parsed.data.email.toLowerCase(),
          passwordHash: 'better-auth',
          name: parsed.data.name,
          phone: parsed.data.phone ?? null,
          avatarUrl: null,
          isPlatformAdmin: false,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        .onConflictDoNothing();
    }
  }

  return res;
};

const handleSignIn = async (c: any) => {
  const parsed = signInSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const auth = createAuth(c.env);
  const res = await auth.api.signInEmail({
    body: {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
    },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  return res;
};

const handleSignOut = async (c: any) => {
  const auth = createAuth(c.env);
  const res = await auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
  return res;
};

router.post('/signup', handleSignUp);
router.post('/sign-up', handleSignUp);

router.post('/signin', handleSignIn);
router.post('/sign-in', handleSignIn);

router.post('/signout', handleSignOut);
router.post('/sign-out', handleSignOut);

router.post('/forget-password', async (c) => {
  const auth = createAuth(c.env);
  const res = await auth.api.requestPasswordReset({
    body: await c.req.json().catch(() => ({})),
    headers: c.req.raw.headers,
    asResponse: true,
  });
  return res;
});

router.post('/reset-password', async (c) => {
  const auth = createAuth(c.env);
  const res = await auth.api.resetPassword({
    body: await c.req.json().catch(() => ({})),
    headers: c.req.raw.headers,
    asResponse: true,
  });
  return res;
});

router.get('/me', async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw httpError(401, 'UNAUTHORIZED', 'No active session');
  const ctx = await loadSessionContext(c.env.DB, session.user.id);
  const isAdmin = Boolean(ctx?.isAdmin || (session.user as any)?.isPlatformAdmin);
  return c.json({
    user: {
      ...session.user,
      userId: session.user.id,
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isAdmin,
      isPlatformAdmin: isAdmin,
      memberships: (ctx?.businesses ?? []).map((b) => ({
        businessId: b.businessId || b.id,
        id: b.id,
        role: b.role,
        businessName: b.businessName || b.name || 'My Business',
      })),
      supplierMemberships: (ctx?.suppliers ?? []).map((s) => ({
        supplierId: s.supplierId || s.id,
        id: s.id,
        role: s.role,
        supplierName: s.supplierName || s.name || 'My Supplier',
      })),
    },
  });
});

export default router;

