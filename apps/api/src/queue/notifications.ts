import type { MessageBatch } from '@cloudflare/workers-types';
import { getDb } from '@vyro/db';
import { notifications, users } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { renderSupplierVerification, sendEmail } from '../lib/email';
import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';

/**
 * NOTIFICATIONS_QUEUE consumer.
 *
 * Producers (see apps/api/src/modules/notifications/routes.ts) send
 * `{ notificationId, userId, type }`. This is the fan-out hub where future
 * channels (email, push, SMS) hook in. For now we:
 *   1. Verify the referenced notification row exists.
 *   2. Email the recipient when the notification type warrants it
 *      (e.g. supplier verification decisions, invites).
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
    const t0 = Date.now();
    recordQueueMetric(env, 'queue.consume.start', 'notifications', 0);
    const body = msg.body as Partial<{
      notificationId: string;
      userId: string;
      type: string;
      title?: string;
      body?: string | null;
      link?: string | null;
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
      await maybeEmailNotification(env, body.type ?? '', body.userId, body.title, body.body, body.link);
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
      recordQueueMetric(env, 'queue.ack', 'notifications', Date.now() - t0);
    } catch (err) {
      await recordQueueEvent(env, 'notifications', 'retry', msg.id, body, err instanceof Error ? err.message : String(err));
      recordQueueMetric(env, 'queue.retry', 'notifications', Date.now() - t0);
      msg.retry({ delaySeconds: 30 });
      // eslint-disable-next-line no-console
      console.error('[queue:notifications] handle failed', {
        id: body.notificationId,
        err,
      });
    }
  }
}

/**
 * Sends an email for notifications whose `type` maps to a transactional event.
 * Other notification types are in-app only — they pass through silently.
 */
async function maybeEmailNotification(
  env: Env,
  type: string,
  userId: string,
  title: string | undefined,
  body: string | null | undefined,
  link: string | null | undefined,
): Promise<void> {
  let subject: string | null = null;
  let text: string | null = null;
  let html: string | undefined;

  if (type === 'supplier.verified') {
    subject = 'You are verified on Vyro';
    text =
      'Good news — your supplier account is now verified on Vyro. Buyers can find you and you can publish offers.';
  } else if (type === 'supplier.rejected') {
    subject = 'Your verification was rejected';
    text = `Unfortunately we were not able to verify your supplier account.${body ? `\n\nReason: ${body}` : ''}`;
    html = body
      ? `<p>Unfortunately we were not able to verify your supplier account.</p><p><strong>Reason:</strong> ${escapeHtml(body)}</p>`
      : undefined;
  } else if (type === 'supplier.review_required') {
    subject = 'More information needed for your Vyro verification';
    text =
      'We need a little more information before we can verify your supplier account. Please update your verification details.';
  } else {
    return; // not a transactional type
  }

  const db = getDb(env.DB);
  const user = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return;
  const linkStr = link ?? null;
  const rendered =
    type === 'supplier.verified' || type === 'supplier.rejected'
      ? renderSupplierVerification({
          to: user.email,
          status: type === 'supplier.verified' ? 'verified' : 'rejected',
          reason: body ?? null,
          link: linkStr ?? 'https://vyro.local/supplier/verification',
        })
      : {
          to: user.email,
          subject: subject ?? title ?? 'Vyro notification',
          text: text ?? '',
          ...(html ? { html } : {}),
        };
  await sendEmail(env, rendered);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
