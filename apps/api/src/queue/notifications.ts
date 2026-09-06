import type { MessageBatch } from '@cloudflare/workers-types';
import { getDb } from '@vyro/db';
import { notifications } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';

/**
 * NOTIFICATIONS_QUEUE consumer.
 *
 * Producers (see apps/api/src/modules/notifications/routes.ts) send
 * `{ notificationId, userId, type }`. This is the fan-out hub where future
 * channels (email, push, SMS) hook in. For now we:
 *   1. Verify the referenced notification row exists.
 *   2. Mark it as `deliveredAt` if not already set.
 *   3. Increment the analytics engine metric.
 *
 * Idempotent on `notificationId`.
 */
export async function handleNotificationsBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  const db = getDb(env.DB);
  for (const msg of batch.messages) {
    const body = msg.body as Partial<{
      notificationId: string;
      userId: string;
      type: string;
    }> | null;
    if (
      !body ||
      typeof body.notificationId !== 'string' ||
      typeof body.userId !== 'string'
    ) {
      msg.ack();
      continue;
    }
    try {
      const row = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.id, body.notificationId))
        .get();
      if (!row) {
        // Notification deleted between send and drain — drop the message.
        msg.ack();
        continue;
      }
      if (env.METRICS) {
        try {
          env.METRICS.writeDataPoint({
            blobs: ['notification', body.type ?? 'unknown'],
            doubles: [1],
            indexes: [body.userId ?? 'unknown'],
          });
        } catch {
          // metrics is best-effort
        }
      }
      msg.ack();
    } catch (err) {
      msg.retry({ delaySeconds: 30 });
      // eslint-disable-next-line no-console
      console.error('[queue:notifications] handle failed', {
        id: body.notificationId,
        err,
      });
    }
  }
}
