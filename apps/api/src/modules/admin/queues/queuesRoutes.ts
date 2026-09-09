import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requireRole, requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../lib/audit';
import * as svc from './queuesService';

const querySchema = z.object({
  queue: z.enum(['audit', 'notifications', 'invoices']).optional(),
  event: z.enum(['retry', 'dlq', 'manual']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  before: z.coerce.number().int().min(0).optional(),
});

const retryBody = z.object({ editedPayload: z.unknown().optional() });
const bulkBody = z.object({
  eventIds: z.array(z.string().min(1)).min(1).max(100),
  editedPayload: z.unknown().optional(),
});
const enqueueBody = z.object({
  queue: z.enum(['audit', 'notifications', 'invoices']),
  payload: z.unknown(),
});

const router = new Hono<{ Bindings: Env }>();

router.use('*', session(), requireRole({ admin: true }));

router.get('/health', requirePermission('queues:read'), async (c) => {
  const queues = await svc.getHealth(c.env);
  return c.json({ queues });
});

router.get('/throughput', requirePermission('queues:read'), async (c) => {
  const points = await svc.getThroughput(c.env);
  return c.json({ points });
});

router.get('/events', requirePermission('queues:read'), async (c) => {
  const parsed = querySchema.safeParse(c.req.query());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad query', parsed.error.flatten());
  const events = await svc.listEvents(c.env, {
    ...(parsed.data.queue !== undefined ? { queue: parsed.data.queue } : {}),
    ...(parsed.data.event !== undefined ? { event: parsed.data.event } : {}),
    ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    ...(parsed.data.before !== undefined ? { before: parsed.data.before } : {}),
  });
  return c.json({ events });
});

router.post('/retry/:eventId', requirePermission('queues:write'), async (c) => {
  const eventId = c.req.param('eventId');
  const body = await c.req.json().catch(() => ({}));
  const parsed = retryBody.safeParse(body);
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad body', parsed.error.flatten());
  try {
    const out = await svc.retryEvent(c.env, eventId, parsed.data.editedPayload, c.get('ctx').userId);
    await auditAdmin({
      ctx: c,
      action: 'queue.retry.single',
      target: { type: 'queue_event', id: eventId },
      after: { newMsgId: out.newMsgId },
    });
    return c.json({ ok: true, newMsgId: out.newMsgId });
  } catch (err) {
    if ((err as { code?: string })?.code === 'NOT_FOUND') {
      throw httpError(404, 'NOT_FOUND', 'queue event not found');
    }
    throw err;
  }
});

router.post('/retry-bulk', requirePermission('queues:write'), async (c) => {
  const parsed = bulkBody.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad body', parsed.error.flatten());
  const out = await svc.retryBulk(c.env, parsed.data.eventIds, parsed.data.editedPayload, c.get('ctx').userId);
  await auditAdmin({
    ctx: c,
    action: 'queue.retry.bulk',
    target: { type: 'queue_event', id: parsed.data.eventIds.join(',') },
    after: out,
  });
  return c.json({ ok: true, ...out });
});

router.post('/enqueue', requirePermission('queues:write'), async (c) => {
  const parsed = enqueueBody.safeParse(await c.req.json());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'bad body', parsed.error.flatten());
  const out = await svc.manualEnqueue(c.env, parsed.data.queue, parsed.data.payload, c.get('ctx').userId);
  await auditAdmin({
    ctx: c,
    action: 'queue.enqueue.manual',
    target: { type: 'queue', id: parsed.data.queue },
    after: { msgId: out.msgId },
  });
  return c.json({ ok: true, msgId: out.msgId, eventId: out.eventId });
});

export const queuesRoutes = router;