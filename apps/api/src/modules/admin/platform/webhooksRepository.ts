import { getDb } from '@vyro/db';
import { webhooks, webhookDeliveries } from '@vyro/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type WebhookRow = {
  id: string;
  name: string;
  url: string;
  eventTypesJson: string;
  secret: string;
  active: 0 | 1;
  createdBy: string;
  createdAt: number;
};

export type WebhookDeliveryRow = {
  id: string;
  webhookId: string;
  eventType: string;
  payloadJson: string;
  status: 'pending' | 'success' | 'failed';
  responseStatus: number | null;
  responseBody: string | null;
  attemptCount: number;
  nextRetryAt: number | null;
  createdAt: number;
};

export async function listWebhooks(d1: D1Database): Promise<WebhookRow[]> {
  const db = getDb(d1);
  return (await db.select().from(webhooks).orderBy(desc(webhooks.createdAt)).all()) as WebhookRow[];
}

export async function getWebhook(d1: D1Database, id: string): Promise<WebhookRow | null> {
  const db = getDb(d1);
  const row = (await db.select().from(webhooks).where(eq(webhooks.id, id)).get()) as
    | WebhookRow
    | undefined;
  return row ?? null;
}

export async function createWebhook(
  d1: D1Database,
  body: {
    name: string;
    url: string;
    eventTypes: string[];
    secret: string;
    active: boolean;
    createdBy: string;
  },
): Promise<WebhookRow> {
  const id = randomUUID();
  const row: WebhookRow = {
    id,
    name: body.name,
    url: body.url,
    eventTypesJson: JSON.stringify(body.eventTypes),
    secret: body.secret,
    active: body.active ? 1 : 0,
    createdBy: body.createdBy,
    createdAt: Date.now(),
  };
  await getDb(d1).insert(webhooks).values(row).run();
  return row;
}

export async function updateWebhook(
  d1: D1Database,
  id: string,
  patch: Partial<{ name: string; url: string; eventTypes: string[]; active: boolean }>,
): Promise<{ before: WebhookRow; after: WebhookRow } | null> {
  const before = await getWebhook(d1, id);
  if (!before) return null;
  const update: Partial<WebhookRow> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.url !== undefined) update.url = patch.url;
  if (patch.eventTypes !== undefined) update.eventTypesJson = JSON.stringify(patch.eventTypes);
  if (patch.active !== undefined) update.active = patch.active ? 1 : 0;
  await getDb(d1).update(webhooks).set(update).where(eq(webhooks.id, id)).run();
  return { before, after: { ...before, ...update } as WebhookRow };
}

export async function disableWebhook(d1: D1Database, id: string): Promise<WebhookRow | null> {
  const before = await getWebhook(d1, id);
  if (!before) return null;
  await getDb(d1).update(webhooks).set({ active: 0 }).where(eq(webhooks.id, id)).run();
  return { ...before, active: 0 };
}

export async function listDeliveries(
  d1: D1Database,
  webhookId: string,
  limit = 100,
): Promise<WebhookDeliveryRow[]> {
  const db = getDb(d1);
  return (await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit)
    .all()) as WebhookDeliveryRow[];
}

export async function getDelivery(
  d1: D1Database,
  webhookId: string,
  deliveryId: string,
): Promise<WebhookDeliveryRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhookId, webhookId)))
    .get()) as WebhookDeliveryRow | undefined;
  return row ?? null;
}

export async function markDelivery(
  d1: D1Database,
  deliveryId: string,
  status: 'pending' | 'success' | 'failed',
  responseStatus: number | null,
): Promise<void> {
  await getDb(d1)
    .update(webhookDeliveries)
    .set({ status, responseStatus, attemptCount: 1 })
    .where(eq(webhookDeliveries.id, deliveryId))
    .run();
}
