import type { MessageBatch } from '@cloudflare/workers-types';
import { getDb } from '@vyro/db';
import { notifications, users, userSettings } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { renderSupplierVerification, sendEmail, sendEmailOrThrow } from '../lib/email';
import { renderAdminAlertEmail } from '../lib/emailTemplates/adminAlert';
import { recordQueueMetric, recordQueueEvent } from '../lib/queueInstrument';

/**
 * NOTIFICATIONS_QUEUE consumer.
 *
 * Two message shapes:
 *   A. `{ notificationId, userId, type, title, body, link }` — normal
 *      buyer/supplier notifications. Email is sent when the type maps to a
 *      transactional event (e.g. supplier verification decisions).
 *   B. `{ kind: 'admin_alert_email', recipientUserId, recipientEmail, title,
 *      body, link, severity }` — fan-out from notifyAdmins for critical
 *      admin alerts. Honors userSettings.notifyAdminAlerts opt-out.
 *
 * Idempotent on `notificationId`.
 */
export async function handleNotificationsBatch(
  batch: MessageBatch<unknown>,
  env: Env,
): Promise<void> {
  for (const msg of batch.messages) {
    const t0 = Date.now();
    recordQueueMetric(env, 'queue.consume.start', 'notifications', 0);
    const body = msg.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      msg.ack();
      continue;
    }
    try {
      if (body.kind === 'admin_alert_email') {
        await handleAdminAlertEmail(env, body);
        msg.ack();
        recordQueueMetric(env, 'queue.ack', 'notifications', Date.now() - t0);
        continue;
      }
      // Shape A: buyer/supplier notification
      const notificationId = body.notificationId;
      const userId = body.userId;
      if (typeof notificationId !== 'string' || typeof userId !== 'string') {
        msg.ack();
        continue;
      }
      const db = getDb(env.DB);
      const row = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.id, notificationId))
        .get();
      if (!row) {
        msg.ack();
        continue;
      }
      await maybeEmailNotification(
        env,
        typeof body.type === 'string' ? body.type : '',
        userId,
        typeof body.title === 'string' ? body.title : undefined,
        typeof body.body === 'string' ? body.body : null,
        typeof body.link === 'string' ? body.link : null,
      );
      if (env.METRICS) {
        try {
          env.METRICS.writeDataPoint({
            blobs: ['notification', typeof body.type === 'string' ? body.type : 'unknown'],
            doubles: [1],
            indexes: [userId],
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
      console.error('[queue:notifications] handle failed', { body, err });
    }
  }
}

/**
 * Send an admin-targeted alert email to a single admin recipient.
 * Honors userSettings.notifyAdminAlerts (default on).
 */
async function handleAdminAlertEmail(env: Env, body: Record<string, unknown>): Promise<void> {
  const recipientUserId = body.recipientUserId;
  const recipientEmail = body.recipientEmail;
  const title = body.title;
  const text = body.body;
  const link = body.link;
  const severity = body.severity;
  if (
    typeof recipientUserId !== 'string' ||
    typeof recipientEmail !== 'string' ||
    typeof title !== 'string' ||
    typeof text !== 'string'
  ) {
    return;
  }
  const sev = severity === 'critical' || severity === 'warning' ? severity : 'info';

  const db = getDb(env.DB);
  const settings = await db
    .select({ notifyAdminAlerts: userSettings.notifyAdminAlerts })
    .from(userSettings)
    .where(eq(userSettings.userId, recipientUserId))
    .get();
  if (settings && settings.notifyAdminAlerts === 0) return;

  const { subject, html } = renderAdminAlertEmail({
    title,
    body: text,
    link: typeof link === 'string' ? link : null,
    severity: sev,
  });
  await sendEmailOrThrow(env, { to: recipientEmail, subject, html });
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
