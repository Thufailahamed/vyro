import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import { listSchedules, createSchedule, cancelSchedule } from './exportSchedulesService';

const router = new Hono<{ Bindings: { DB: D1Database } }>();

router.use('*', session());

router.get('/', requirePermission('audit:export'), async (c) => {
  const ctx = c.get('ctx') as { userId: string };
  const schedules = await listSchedules(c.env.DB, ctx.userId);
  return c.json({ schedules });
});

const createBody = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    email: z.string().min(3).max(254),
    format: z.enum(['csv', 'json']).default('csv'),
  })
  .strict();

router.post('/', requirePermission('audit:export'), async (c) => {
  const parsed = createBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid body', parsed.error.flatten());
  const body = parsed.data;
  const ctx = c.get('ctx') as { userId: string };
  const row = await createSchedule(c.env.DB, {
    requestedBy: ctx.userId,
    frequency: body.frequency,
    email: body.email,
    format: body.format,
  });
  await auditAdmin({
    ctx: c,
    action: 'audit_export.create',
    target: { type: 'audit_export_schedule', id: row.id },
    after: { frequency: row.frequency, email: row.email, format: row.format },
  });
  return c.json(row, 201);
});

router.delete('/:id', requirePermission('audit:export'), async (c) => {
  const ctx = c.get('ctx') as { userId: string };
  const id = c.req.param('id');
  const result = await cancelSchedule(c.env.DB, id, ctx.userId);
  if (!result) throw httpError(404, 'NOT_FOUND', 'Schedule not found');
  await auditAdmin({
    ctx: c,
    action: 'audit_export.cancel',
    target: { type: 'audit_export_schedule', id },
    before: result.before,
    after: result.after,
  });
  return c.json(result.after);
});

export default router;
