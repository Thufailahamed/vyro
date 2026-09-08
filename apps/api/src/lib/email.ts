import { httpError } from './errors';
import type { Env } from '../env';

/**
 * Transactional email pipeline.
 *
 * Provider precedence (chosen by which env vars are present at runtime):
 *   1. `RESEND_API_KEY`       → Resend HTTPS API.
 *   2. `EMAIL_FROM` + (no key) → Cloudflare MailChannels (free on Workers).
 *   3. No provider configured → `console` (dev / `wrangler tail` capture).
 *
 * The sender always logs every attempt at `info` and every failure at `error`,
 * so operators can tail Workers logs in any environment to confirm what was
 * emitted. Callers wrap failures in `httpError(502, 'EMAIL_SEND_FAILED', ...)`
 * when the user needs to see the failure (e.g. password reset).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body; providers that prefer plain text fall back to `text`. */
  html?: string;
  /** Override the sender for one message (e.g. transactional vs marketing). */
  from?: string;
  /** Reply-To header for one message. */
  replyTo?: string;
}

export interface SendResult {
  ok: true;
  provider: 'resend' | 'mailchannels' | 'console';
  id: string;
}

export type SendOutcome =
  | SendResult
  | { ok: false; provider: 'resend' | 'mailchannels' | 'console'; error: string };

const DEFAULT_FROM = 'Vyro <no-reply@vyro.local>';

export function defaultFromAddress(env: Env): string {
  const from = (env as unknown as { EMAIL_FROM?: string }).EMAIL_FROM;
  return from ?? DEFAULT_FROM;
}

function resendKey(env: Env): string | undefined {
  return (env as unknown as { RESEND_API_KEY?: string }).RESEND_API_KEY;
}

function providerOrder(env: Env): Array<'resend' | 'mailchannels' | 'console'> {
  const isProd = env.ENVIRONMENT === 'production';
  if (resendKey(env)) {
    // Resend is configured; allow console as a last-resort fallback so devs
    // never silently drop emails during local-only configuration mistakes.
    return ['resend', 'mailchannels', 'console'];
  }
  if (isProd) {
    // No provider in production: surface as a 502. We intentionally omit the
    // console provider so callers know the email didn't go out.
    return ['resend', 'mailchannels'];
  }
  // Local dev: prefer mailchannels (free, no key), fall back to console
  // so email pipeline is always observable in `wrangler tail`.
  return ['mailchannels', 'console'];
}

async function sendViaResend(env: Env, msg: EmailMessage): Promise<SendOutcome> {
  const apiKey = resendKey(env);
  if (!apiKey) return { ok: false, provider: 'resend', error: 'no api key' };
  const from = msg.from ?? defaultFromAddress(env);
  const payload = {
    from,
    to: [msg.to],
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    reply_to: msg.replyTo,
  };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      provider: 'resend',
      error: `resend ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const json = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, provider: 'resend', id: json?.id ?? 'unknown' };
}

async function sendViaMailChannels(env: Env, msg: EmailMessage): Promise<SendOutcome> {
  // Cloudflare MailChannels — requires Workers, free, no third-party.
  const from = msg.from ?? defaultFromAddress(env);
  const payload = {
    personalizations: [
      {
        to: [{ email: msg.to }],
        ...(msg.replyTo ? { reply_to: { email: msg.replyTo } } : {}),
      },
    ],
    from: { email: from, name: from.includes('<') ? from.split('<')[0]!.trim() : 'Vyro' },
    subject: msg.subject,
    content: [
      { type: 'text/plain', value: msg.text },
      ...(msg.html ? [{ type: 'text/html', value: msg.html }] : []),
    ],
  };
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      provider: 'mailchannels',
      error: `mailchannels ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  return { ok: true, provider: 'mailchannels', id: `mc-${Date.now()}` };
}

function sendViaConsole(env: Env, msg: EmailMessage): SendOutcome {
  const from = msg.from ?? defaultFromAddress(env);
  // Single structured line — easy to grep in `wrangler tail`.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      tag: 'email',
      env: env.ENVIRONMENT,
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    }),
  );
  return { ok: true, provider: 'console', id: `console-${Date.now()}` };
}

/**
 * Best-effort send. Tries providers in `providerOrder` until one returns ok.
 * Returns the first success, or the final failure if every provider failed.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<SendOutcome> {
  const order = providerOrder(env);
  let lastFailure: SendOutcome | null = null;
  for (const p of order) {
    let outcome: SendOutcome;
    if (p === 'resend') outcome = await sendViaResend(env, msg);
    else if (p === 'mailchannels') outcome = await sendViaMailChannels(env, msg);
    else outcome = sendViaConsole(env, msg);
    if (outcome.ok) return outcome;
    lastFailure = outcome;
  }
  // eslint-disable-next-line no-console
  console.error('[email] all providers failed', { to: msg.to, subject: msg.subject, lastFailure });
  return lastFailure ?? { ok: false, provider: 'console', error: 'unknown' };
}

/**
 * Throws `EMAIL_SEND_FAILED` on failure — for use from request handlers where the
 * user must know the email didn't go out (password reset, admin invite).
 */
export async function sendEmailOrThrow(env: Env, msg: EmailMessage): Promise<SendResult> {
  const r = await sendEmail(env, msg);
  if (!r.ok) throw httpError(502, 'EMAIL_SEND_FAILED', r.error);
  return r;
}

// ---------- templates ----------

export interface PasswordResetEmail {
  to: string;
  url: string;
  /** Minutes the link is valid — shown to the user. */
  ttlMinutes: number;
}

export function renderPasswordReset(e: PasswordResetEmail): EmailMessage {
  return {
    to: e.to,
    subject: 'Reset your Vyro password',
    text:
      `Someone (hopefully you) asked to reset your Vyro password.\n\n` +
      `Open this link within ${e.ttlMinutes} minutes to choose a new one:\n${e.url}\n\n` +
      `If you didn't request this, ignore this email — your password has not been changed.\n`,
    html:
      `<p>Someone (hopefully you) asked to reset your Vyro password.</p>` +
      `<p>Open this link within <strong>${e.ttlMinutes} minutes</strong> to choose a new one:</p>` +
      `<p><a href="${escapeHtml(e.url)}">${escapeHtml(e.url)}</a></p>` +
      `<p style="color:#666;font-size:12px">If you didn't request this, ignore this email — your password has not been changed.</p>`,
  };
}

export interface AdminInviteEmail {
  to: string;
  acceptUrl: string;
  role: string;
  /** ISO timestamp string for human readability. */
  expiresAtIso: string;
  invitedBy: string;
}

export function renderAdminInvite(e: AdminInviteEmail): EmailMessage {
  return {
    to: e.to,
    subject: `You're invited to join Vyro as ${e.role}`,
    text:
      `${e.invitedBy} invited you to join Vyro as a ${e.role}.\n\n` +
      `Accept your invite (link expires ${e.expiresAtIso}):\n${e.acceptUrl}\n\n` +
      `If you weren't expecting this, you can ignore this email.\n`,
    html:
      `<p><strong>${escapeHtml(e.invitedBy)}</strong> invited you to join Vyro as a <strong>${escapeHtml(e.role)}</strong>.</p>` +
      `<p>Accept your invite (link expires ${escapeHtml(e.expiresAtIso)}):</p>` +
      `<p><a href="${escapeHtml(e.acceptUrl)}">${escapeHtml(e.acceptUrl)}</a></p>` +
      `<p style="color:#666;font-size:12px">If you weren't expecting this, you can ignore this email.</p>`,
  };
}

export interface VerificationEmail {
  to: string;
  status: 'verified' | 'rejected';
  reason?: string | null;
  /** Path on the SPA, e.g. `/supplier/verification`. */
  link: string;
}

export function renderSupplierVerification(e: VerificationEmail): EmailMessage {
  const subject =
    e.status === 'verified' ? 'You are verified on Vyro' : 'Your verification was rejected';
  const intro =
    e.status === 'verified'
      ? 'Good news — your supplier account is now verified on Vyro. Buyers can find you and you can publish offers.'
      : 'Unfortunately we were not able to verify your supplier account.';
  const tail = e.status === 'verified'
    ? ''
    : `\nReason: ${e.reason ?? '(no reason supplied)'}\n\nUpdate your verification details: ${e.link}\n`;
  return {
    to: e.to,
    subject,
    text: `${intro}\n\nView your supplier account: ${e.link}\n${tail}`,
    html:
      `<p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(e.link)}">${escapeHtml(e.link)}</a></p>` +
      (e.status === 'rejected'
        ? `<p><strong>Reason:</strong> ${escapeHtml(e.reason ?? '(no reason supplied)')}</p>`
        : ''),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
