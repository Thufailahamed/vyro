import { describe, it, expect } from 'vitest';
import { verifyResendSignature, parseEvent } from '../../../src/lib/email/webhook';

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

describe('resend webhook', () => {
  it('verifyResendSignature accepts valid signature', async () => {
    const secret = 'whsec_test_abc';
    const body = '{"type":"email.delivered"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await hmacSha256Hex(secret, `${ts}.${body}`);
    const header = `t=${ts},v1=${sig}`;
    expect(await verifyResendSignature(secret, body, header)).toBe(true);
  });

  it('verifyResendSignature rejects tampered body', async () => {
    const secret = 'whsec_test_abc';
    const body = '{"type":"email.delivered"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = await hmacSha256Hex(secret, `${ts}.${body}`);
    const header = `t=${ts},v1=${sig}`;
    expect(await verifyResendSignature(secret, body + 'X', header)).toBe(false);
  });

  it('verifyResendSignature rejects missing header', async () => {
    expect(await verifyResendSignature('s', 'body', null)).toBe(false);
  });

  it('verifyResendSignature rejects expired timestamp', async () => {
    const secret = 'whsec_test_abc';
    const body = '{"type":"email.delivered"}';
    const ts = String(Math.floor(Date.now() / 1000) - 600);
    const sig = await hmacSha256Hex(secret, `${ts}.${body}`);
    const header = `t=${ts},v1=${sig}`;
    expect(await verifyResendSignature(secret, body, header)).toBe(false);
  });

  it('parseEvent extracts delivered event', () => {
    const evt = parseEvent(
      JSON.stringify({
        type: 'email.delivered',
        data: {
          to: 'a@b.com',
          email_id: 'msg_123',
          created_at: '2026-09-27T10:00:00Z',
        },
      }),
    );
    expect(evt).toEqual({
      type: 'email.delivered',
      recipient: 'a@b.com',
      messageId: 'msg_123',
      occurredAt: '2026-09-27T10:00:00Z',
    });
  });

  it('parseEvent extracts bounced event with reason', () => {
    const evt = parseEvent(
      JSON.stringify({
        type: 'email.bounced',
        data: {
          to: 'a@b.com',
          email_id: 'msg_123',
          created_at: '2026-09-27T10:00:00Z',
          bounce: { reason: 'mailbox_full' },
        },
      }),
    );
    expect(evt?.type).toBe('email.bounced');
    expect(evt?.reason).toBe('mailbox_full');
  });

  it('parseEvent returns null for unknown type', () => {
    expect(parseEvent(JSON.stringify({ type: 'email.unknown' }))).toBe(null);
  });

  it('parseEvent returns null for malformed body', () => {
    expect(parseEvent('not json')).toBe(null);
  });
});
