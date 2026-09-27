import type { ResendEvent, ResendEventType } from './types';

const VALID_TYPES: ResendEventType[] = [
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyResendSignature(
  secret: string,
  rawBody: string,
  header: string | null,
): Promise<boolean> {
  if (!header) return false;
  // Parse "t=<unix>,v1=<hex>"
  const parts: Record<string, string> = {};
  for (const p of header.split(',')) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    parts[p.slice(0, idx).trim()] = p.slice(idx + 1);
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject timestamps >5min old (replay protection).
  const ts = parseInt(t, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${rawBody}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return timingSafeEqual(expected, v1);
}

interface RawEventBody {
  type?: string;
  data?: {
    to?: string;
    email_id?: string;
    created_at?: string;
    bounce?: { reason?: string };
    complaint?: { reason?: string };
  };
}

export function parseEvent(rawBody: string): ResendEvent | null {
  let body: RawEventBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const type = body.type;
  if (!type || !VALID_TYPES.includes(type as ResendEventType)) return null;
  const data = body.data ?? {};
  if (!data.to || !data.email_id || !data.created_at) return null;
  const reason = data.bounce?.reason ?? data.complaint?.reason;
  return {
    type: type as ResendEventType,
    recipient: data.to,
    messageId: data.email_id,
    occurredAt: data.created_at,
    ...(reason ? { reason } : {}),
  };
}
