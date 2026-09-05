import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import type { Ctx } from '../../../middleware/session';
import { httpError } from '../../../lib/errors';
import { adminInviteCreate, adminInviteAccept, adminInviteListQuery, adminInviteIdParam } from '@vyro/validation/adminInvites';
import { createInviteForEmail, acceptInvite } from './service';
import { listInvites, revoke } from './repository';
import { auditAdmin } from '../lib/audit';
import type { AdminRole } from '@vyro/auth';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.post('/', requirePermission('admin:invite'), async (c) => {
  const ctx = c.get('ctx') as Ctx;
  if (!ctx.adminRole) throw httpError(403, 'FORBIDDEN', 'No admin role');
  const parsed = adminInviteCreate.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  const out = await createInviteForEmail(c.env.DB, {
    email: parsed.data.email,
    role: parsed.data.role as AdminRole,
    actorRole: ctx.adminRole,
    actorId: ctx.userId,
  });
  await auditAdmin({
    ctx: c,
    action: 'admin.invite.create',
    target: { type: 'admin_invite', id: out.id },
    after: { email: parsed.data.email, role: parsed.data.role },
  });
  return c.json({ id: out.id, acceptUrl: out.acceptUrl, expiresAt: out.expiresAt }, 201);
});

router.get('/', requirePermission('admin:invite'), async (c) => {
  const parsed = adminInviteListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const out = await listInvites(c.env.DB, parsed.data.status);
  return c.json({ invites: out });
});

router.delete('/:id', requirePermission('admin:invite'), async (c) => {
  const parsed = adminInviteIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  await revoke(c.env.DB, parsed.data.id);
  await auditAdmin({
    ctx: c,
    action: 'admin.invite.revoke',
    target: { type: 'admin_invite', id: parsed.data.id },
  });
  return c.body(null, 204);
});

router.post('/accept', async (c) => {
  const parsed = adminInviteAccept.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input');
  const { token, name, password } = parsed.data;
  const out = await acceptInvite(c.env.DB, { token, ...(name !== undefined ? { name } : {}), ...(password !== undefined ? { password } : {}) });
  await auditAdmin({
    ctx: c,
    action: 'admin.invite.accept',
    target: { type: 'user', id: out.userId },
    after: { role: out.role },
  });
  return c.json({ userId: out.userId, role: out.role, email: out.email });
});

export default router;
