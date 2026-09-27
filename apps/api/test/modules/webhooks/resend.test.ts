import { describe, it, expect, vi } from 'vitest';
import { handleResendWebhook } from '../../../src/modules/webhooks/resend';

function makeDb() {
  const calls: { sql: string; binds: unknown[] }[] = [];
  const stmt = {
    bind: vi.fn(function (this: any, ...binds: unknown[]) {
      (this as any)._binds = binds;
      return this;
    }),
    run: vi.fn(async function (this: any) {
      calls.push({ sql: (this as any)._sql ?? '', binds: (this as any)._binds ?? [] });
      return { success: true };
    }),
  };
  // Patch bind so it captures sql per call.
  const originalBind = stmt.bind;
  stmt.bind = vi.fn((...binds: unknown[]) => {
    const ctx = { _sql: '', _binds: binds, run: stmt.run };
    return {
      ...ctx,
      bind: originalBind,
      run: async () => {
        calls.push({ sql: ctx._sql, binds });
        return { success: true };
      },
    };
  });
  return {
    db: {
      prepare: vi.fn((sql: string) => {
        const binds: unknown[] = [];
        return {
          bind: (...b: unknown[]) => {
            binds.push(...b);
            return {
              run: async () => {
                calls.push({ sql, binds });
                return { success: true };
              },
            };
          },
        };
      }),
    },
    calls,
  };
}

async function signHeader(secret: string, body: string, tsOverride?: number) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const ts = tsOverride ?? Math.floor(Date.now() / 1000);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${body}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${ts},v1=${hex}`;
}

describe('resend webhook handler', () => {
  it('returns 401 on bad signature', async () => {
    const { db } = makeDb();
    const env = { DB: db, RESEND_WEBHOOK_SECRET: 'whsec_test_abc' } as any;
    const res = await handleResendWebhook(env, '{"type":"email.delivered"}', 't=1,v1=deadbeef');
    expect(res.status).toBe(401);
  });

  it('returns 500 when webhook secret not configured', async () => {
    const { db } = makeDb();
    const env = { DB: db } as any;
    const res = await handleResendWebhook(env, '{}', null);
    expect(res.status).toBe(500);
  });

  it('returns 200 on delivered event, updates notifications', async () => {
    const { db, calls } = makeDb();
    const env = { DB: db, RESEND_WEBHOOK_SECRET: 'whsec_test_abc' } as any;
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'a@b.com', email_id: 'msg_1', created_at: '2026-09-27T10:00:00Z' },
    });
    const sig = await signHeader('whsec_test_abc', body);
    const res = await handleResendWebhook(env, body, sig);
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes('UPDATE notifications'))).toBe(true);
  });

  it('returns 200 on bounced event, inserts suppression', async () => {
    const { db, calls } = makeDb();
    const env = { DB: db, RESEND_WEBHOOK_SECRET: 'whsec_test_abc' } as any;
    const body = JSON.stringify({
      type: 'email.bounced',
      data: {
        to: 'a@b.com',
        email_id: 'msg_2',
        created_at: '2026-09-27T10:00:00Z',
        bounce: { reason: 'mailbox_full' },
      },
    });
    const sig = await signHeader('whsec_test_abc', body);
    const res = await handleResendWebhook(env, body, sig);
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes('email_suppressions'))).toBe(true);
  });

  it('returns 200 with ignored=true for unknown event type', async () => {
    const { db } = makeDb();
    const env = { DB: db, RESEND_WEBHOOK_SECRET: 'whsec_test_abc' } as any;
    const body = JSON.stringify({ type: 'email.unknown', data: {} });
    const sig = await signHeader('whsec_test_abc', body);
    const res = await handleResendWebhook(env, body, sig);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignored: 'email.unknown' });
  });
});
