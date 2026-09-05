import { Hono } from 'hono';
import { z } from 'zod';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { auditAdmin } from '../lib/audit';
import { CRON_JOBS, getCronJob } from './cronRegistry';
import { httpError } from '../../../lib/errors';

const router = new Hono<{ Bindings: { DB: D1Database } }>();

router.use('*', session());
router.get('/', requirePermission('cron:read'), (c) => {
  return c.json({
    jobs: CRON_JOBS.map((j) => ({ name: j.name, schedule: j.schedule, description: j.description })),
  });
});

const triggerBody = z.object({ name: z.string().min(1) }).strict();

router.post('/trigger', requirePermission('cron:trigger'), async (c) => {
  const body = triggerBody.parse(await c.req.json().catch(() => ({})));
  const job = getCronJob(body.name);
  if (!job) throw httpError(404, 'NOT_FOUND', `Unknown cron job: ${body.name}`);

  await auditAdmin({
    ctx: c,
    action: 'cron.trigger',
    target: { type: 'cron', id: job.name },
    after: { schedule: job.schedule },
  });

  try {
    await job.handler();
    return c.json({ ok: true, name: job.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    throw httpError(500, 'INTERNAL', `Cron ${job.name} failed: ${message}`);
  }
});

export default router;
