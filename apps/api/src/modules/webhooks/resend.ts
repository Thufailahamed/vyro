import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../../env';
import { verifyResendSignature, parseEvent } from '../../lib/email/webhook';

const router = new Hono<{ Bindings: Env }>();

interface WebhookResult {
  status: number;
  body: unknown;
}

/**
 * Pure handler — exposed so tests can exercise it without spinning up Hono.
 * Verifies the `Resend-Signature` header, parses the event, updates the
 * matching `notifications` row by `resend_id`, and inserts into
 * `email_suppressions` on bounces/complaints.
 */
export async function handleResendWebhook(
  env: Env,
  rawBody: string,
  signatureHeader: string | null,
): Promise<WebhookResult> {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return { status: 500, body: { error: 'webhook secret not configured' } };
  }
  const ok = await verifyResendSignature(secret, rawBody, signatureHeader);
  if (!ok) {
    // eslint-disable-next-line no-console
    console.warn('[webhook:resend] bad signature');
    return { status: 401, body: { error: 'invalid signature' } };
  }
  const event = parseEvent(rawBody);
  if (!event) {
    // Forward compatible: unknown event types or malformed bodies.
    let unknownType = 'unknown';
    try {
      const parsed = JSON.parse(rawBody);
      unknownType = (parsed as { type?: string }).type ?? 'unknown';
    } catch {
      /* keep unknown */
    }
    return { status: 200, body: { ignored: unknownType } };
  }

  const status = mapStatus(event.type);
  await env.DB.prepare(
    'UPDATE notifications SET status = ? WHERE resend_id = ?',
  )
    .bind(status, event.messageId)
    .run();

  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO email_suppressions (recipient, reason, event_at) VALUES (?, ?, ?)',
    )
      .bind(event.recipient, event.reason ?? event.type, event.occurredAt)
      .run();
  }
  return { status: 200, body: { ok: true, type: event.type } };
}

function mapStatus(t: string): string {
  switch (t) {
    case 'email.delivered':
      return 'delivered';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    case 'email.delivery_delayed':
      return 'pending';
    default:
      return 'queued';
  }
}

router.post('/resend', async (c: Context<{ Bindings: Env }>) => {
  const raw = await c.req.text();
  const sig = c.req.header('resend-signature');
  const env = c.env as Env;
  const r = await handleResendWebhook(env, raw, sig);
  return c.json(r.body as Record<string, unknown>, r.status as 200 | 401 | 500);
});

export default router;
