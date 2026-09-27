import { Resend } from 'resend';
import type { Env } from '../../env';
import { httpError } from '../errors';
import type { EmailMessage, SendOutcome, SendResult } from './types';

const DEFAULT_FROM = 'Vyro <no-reply@vyro.local>';

function defaultFromAddress(env: Env): string {
  return env.EMAIL_FROM ?? DEFAULT_FROM;
}

function resendKey(env: Env): string | undefined {
  return env.RESEND_API_KEY;
}

function hashEmail(email: string): string {
  // Stable, short hash for log PII stripping.
  let h = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export async function sendEmail(env: Env, msg: EmailMessage): Promise<SendOutcome> {
  const apiKey = resendKey(env);
  if (!apiKey) {
    return { ok: false, provider: 'resend', error: 'no api key' };
  }
  const from = msg.from ?? defaultFromAddress(env);
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(
      {
        from,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        ...(msg.html ? { html: msg.html } : {}),
        ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
        ...(msg.attachments
          ? {
              attachments: msg.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      },
      msg.idempotencyKey ? { idempotencyKey: msg.idempotencyKey } : undefined,
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[email] resend error', {
        toHash: hashEmail(msg.to),
        message: error.message,
      });
      return { ok: false, provider: 'resend', error: error.message };
    }
    return { ok: true, provider: 'resend', id: data?.id ?? 'unknown' };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[email] resend threw', { toHash: hashEmail(msg.to), error });
    return { ok: false, provider: 'resend', error };
  }
}

export async function sendEmailOrThrow(env: Env, msg: EmailMessage): Promise<SendResult> {
  const r = await sendEmail(env, msg);
  if (!r.ok) {
    if (r.error === 'no api key') {
      throw httpError(502, 'EMAIL_NOT_CONFIGURED', r.error);
    }
    throw httpError(502, 'EMAIL_SEND_FAILED', r.error);
  }
  return r;
}
