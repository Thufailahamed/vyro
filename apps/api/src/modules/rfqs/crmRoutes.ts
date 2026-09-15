import { Hono } from 'hono';
import type { Ctx } from '../../middleware/session';
import { session } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import type { Env } from '../../env';
import {
  leadsListQuerySchema,
  setTagSchema,
  setStatusSchema,
  addNoteSchema,
} from '@vyro/validation';
import { requireSupplierRole } from '@vyro/auth';
import { crm } from './crm';
import { isFeatureEnabled } from '../../lib/featureFlags';
import { recordAudit } from '../supplierProducts/repository';

const router = new Hono<{ Bindings: Env }>();
const S_ROLES = ['owner', 'sales', 'operations'] as const;

function ctxOf(c: { get(k: string): unknown }): Ctx {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');
  return ctx;
}

async function ensureCrmEnabled(d1: D1Database): Promise<void> {
  if (!(await isFeatureEnabled(d1, 'LEAD_MANAGER_ENABLED'))) {
    throw httpError(404, 'NOT_FOUND', 'feature not enabled');
  }
}

function requireSupplier(c: { req: { query: (k: string) => string | undefined }; get: (k: string) => unknown }): { ctx: Ctx; supplierId: string } {
  const ctx = ctxOf(c);
  const supplierId = c.req.query('supplierId');
  if (!supplierId) throw httpError(400, 'VALIDATION_ERROR', 'supplierId required');
  requireSupplierRole(ctx, supplierId, S_ROLES);
  return { ctx, supplierId };
}

router.use('*', session());
router.use('*', async (c, next) => {
  await ensureCrmEnabled(c.env.DB);
  await next();
});

router.get('/leads', async (c) => {
  const { supplierId } = requireSupplier(c);
  const filter = leadsListQuerySchema.parse({
    ...c.req.query(),
    from: c.req.query('from') ? Number(c.req.query('from')) : undefined,
    to: c.req.query('to') ? Number(c.req.query('to')) : undefined,
    limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
  });
  const result = await crm.crmList(c.env.DB, supplierId, filter);
  return c.json(result);
});

router.get('/leads/:id', async (c) => {
  const { supplierId } = requireSupplier(c);
  const lead = await crm.crmGet(c.env.DB, supplierId, c.req.param('id'));
  if (!lead) throw httpError(404, 'NOT_FOUND', 'lead not found');
  return c.json({ lead });
});

router.patch('/leads/:id/tag', async (c) => {
  const { ctx, supplierId } = requireSupplier(c);
  const leadId = c.req.param('id');
  const body = setTagSchema.parse(await c.req.json().catch(() => null));
  try {
    await crm.crmSetTag(c.env.DB, supplierId, leadId, body.tag);
  } catch (e) {
    throw httpError(400, 'VALIDATION_ERROR', (e as Error).message);
  }
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'crm.tag_set',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: { supplierId, tag: body.tag },
  });
  return c.json({ tag: body.tag });
});

router.patch('/leads/:id/status', async (c) => {
  const { ctx, supplierId } = requireSupplier(c);
  const leadId = c.req.param('id');
  const body = setStatusSchema.parse(await c.req.json().catch(() => null));
  try {
    await crm.crmSetStatus(c.env.DB, supplierId, leadId, body.status);
  } catch (e) {
    const msg = (e as Error).message;
    if (/terminal/i.test(msg)) throw httpError(409, 'CONFLICT', msg);
    throw httpError(400, 'VALIDATION_ERROR', msg);
  }
  await recordAudit(c.env.DB, {
    actorUserId: ctx.userId,
    action: 'crm.status_set',
    resourceType: 'lead',
    resourceId: leadId,
    metadata: { supplierId, status: body.status },
  });
  return c.json({ status: body.status });
});

router.post('/leads/:id/notes', async (c) => {
  const { ctx, supplierId } = requireSupplier(c);
  const leadId = c.req.param('id');
  const body = addNoteSchema.parse(await c.req.json().catch(() => null));
  try {
    const note = await crm.crmAddNote(c.env.DB, supplierId, leadId, ctx.userId, body.body);
    await recordAudit(c.env.DB, {
      actorUserId: ctx.userId,
      action: 'crm.note_added',
      resourceType: 'lead',
      resourceId: leadId,
      metadata: { supplierId, notePreview: body.body.slice(0, 80) },
    });
    return c.json({ note }, 201);
  } catch (e) {
    throw httpError(400, 'VALIDATION_ERROR', (e as Error).message);
  }
});

router.get('/leads/:id/notes', async (c) => {
  const { supplierId } = requireSupplier(c);
  const cursor = c.req.query('cursor');
  const limit = Number(c.req.query('limit') ?? 25);
  try {
    const result = await crm.crmListNotes(c.env.DB, supplierId, c.req.param('id'), cursor, limit);
    return c.json(result);
  } catch (e) {
    throw httpError(404, 'NOT_FOUND', (e as Error).message);
  }
});

router.get('/summary', async (c) => {
  const { supplierId } = requireSupplier(c);
  const summary = await crm.crmSummary(c.env.DB, supplierId);
  return c.json(summary);
});

export default router;