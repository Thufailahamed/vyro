import { Hono } from 'hono';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import {
  adminAbuseReportsListQuery,
  adminAbuseReportIdParam,
  adminAbuseReportNoteBody,
  adminAbuseReportResolveBody,
} from '@vyro/validation';
import type { Ctx } from '../../../middleware/session';
import * as svc from './abuseReportsService';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/', requirePermission('abuse_report:read'), async (c) => {
  const parsed = adminAbuseReportsListQuery.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid query');
  const opts = parsed.data;
  const ctx = c.get('ctx') as Ctx;
  return c.json(
    await svc.list(c.env.DB, {
      ...(opts.status !== undefined ? { status: opts.status } : {}),
      ...(opts.assignedTo === 'me'
        ? { assignedTo: ctx.userId }
        : opts.assignedTo === 'unassigned'
          ? { unassigned: true }
          : {}),
      ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
    }),
  );
});

router.get('/:id', requirePermission('abuse_report:read'), async (c) => {
  const parsed = adminAbuseReportIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.get(c.env.DB, parsed.data.id));
});

router.post('/:id/claim', requirePermission('abuse_report:read'), async (c) => {
  const parsed = adminAbuseReportIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const ctx = c.get('ctx') as Ctx;
  return c.json(await svc.claim(c, parsed.data.id, ctx.userId));
});

router.post('/:id/notes', requirePermission('abuse_report:read'), async (c) => {
  const parsed = adminAbuseReportIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminAbuseReportNoteBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(await svc.addNote(c, parsed.data.id, body.data.note));
});

router.post('/:id/resolve', requirePermission('abuse_report:resolve'), async (c) => {
  const parsed = adminAbuseReportIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const body = adminAbuseReportResolveBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body');
  return c.json(
    await svc.resolve(c, parsed.data.id, body.data.resolution, body.data.notes),
  );
});

router.post('/:id/takedown', requirePermission('takedown:write'), async (c) => {
  const parsed = adminAbuseReportIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  return c.json(await svc.takedown(c, parsed.data.id));
});

export default router;
