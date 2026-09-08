import type { Context } from 'hono';
import { httpError } from '../../../lib/errors';
import { auditAdmin } from '../../admin/lib/audit';
import * as repo from './webhooksRepository';
import { processDeliveries } from '../../../lib/webhooks';

export async function list(d1: D1Database) {
  return repo.listWebhooks(d1);
}

export async function create(
  ctx: Context,
  body: {
    name: string;
    url: string;
    eventTypes: string[];
    secret: string;
    active?: boolean;
  },
) {
  const d1 = ctx.env.DB as D1Database;
  const row = await repo.createWebhook(d1, {
    name: body.name,
    url: body.url,
    eventTypes: body.eventTypes,
    secret: body.secret,
    active: body.active ?? true,
    createdBy: 'admin',
  });
  await auditAdmin({
    ctx,
    action: 'webhook.create',
    target: { type: 'webhook', id: row.id },
    after: { name: row.name, url: row.url, eventTypes: body.eventTypes, active: row.active === 1 },
  });
  return row;
}

export async function update(
  ctx: Context,
  id: string,
  patch: {
    name?: string;
    url?: string;
    eventTypes?: string[];
    active?: boolean;
  },
) {
  const d1 = ctx.env.DB as D1Database;
  const out = await repo.updateWebhook(d1, id, patch);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Webhook not found');
  await auditAdmin({
    ctx,
    action: 'webhook.update',
    target: { type: 'webhook', id },
    before: { name: out.before.name, url: out.before.url, active: out.before.active === 1 },
    after: { name: out.after.name, url: out.after.url, active: out.after.active === 1 },
  });
  return out.after;
}

export async function disable(ctx: Context, id: string) {
  const d1 = ctx.env.DB as D1Database;
  const out = await repo.disableWebhook(d1, id);
  if (!out) throw httpError(404, 'NOT_FOUND', 'Webhook not found');
  await auditAdmin({
    ctx,
    action: 'webhook.delete',
    target: { type: 'webhook', id },
    before: { active: true },
    after: { active: false },
  });
  return out;
}

export async function listDeliveries(d1: D1Database, webhookId: string) {
  const list = await repo.listDeliveries(d1, webhookId);
  return list.map((d) => ({
    ...d,
    eventTypes: undefined,
    payload: (() => {
      try {
        return JSON.parse(d.payloadJson);
      } catch {
        return null;
      }
    })(),
  }));
}

export async function retryDelivery(ctx: Context, webhookId: string, deliveryId: string) {
  const d1 = ctx.env.DB as D1Database;
  const delivery = await repo.getDelivery(d1, webhookId, deliveryId);
  if (!delivery) throw httpError(404, 'NOT_FOUND', 'Delivery not found');
  // Reset for immediate re-dispatch, then drain the queue now so the admin
  // sees the result on the same request.
  await repo.markDelivery(d1, deliveryId, 'pending', null);
  await auditAdmin({
    ctx,
    action: 'webhook.retry',
    target: { type: 'webhook_delivery', id: deliveryId },
    before: { status: delivery.status },
    after: { status: 'pending' },
  });
  // Best-effort drain. The retry itself is already audited; if processing
  // fails the delivery stays pending and the cron tick will pick it up.
  const processed = await processDeliveries(ctx.env as never, { batchSize: 25 });
  return { ok: true, processed };
}
