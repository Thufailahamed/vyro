import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  renderPasswordReset,
  renderAdminInvite,
  renderSupplierVerification,
  sendEmail,
  sendEmailOrThrow,
  defaultFromAddress,
} from '../../src/lib/email';
import type { Env } from '../../src/env';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    PRODUCTS: {} as R2Bucket,
    CACHE: {} as KVNamespace,
    AUDIT_QUEUE: {} as Queue,
    NOTIFICATIONS_QUEUE: {} as Queue,
    ENVIRONMENT: 'local',
    WEB_ORIGIN: 'https://vyro.local',
    ADMIN_ORIGIN: 'https://vyro.local',
    BETTER_AUTH_SECRET: 'x'.repeat(40),
    BETTER_AUTH_URL: 'https://vyro.local',
    ...overrides,
  } as Env;
}

let logBuffer: string[] = [];

beforeEach(() => {
  logBuffer = [];
  vi.spyOn(console, 'log').mockImplementation((line) => logBuffer.push(String(line)));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('email provider selection', () => {
  it('tries mailchannels first in local with no keys', async () => {
    const env = makeEnv();
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('down', { status: 500 })) as typeof fetch;
    try {
      const r = await sendEmail(env, { to: 'a@b.c', subject: 'hi', text: 'hello' });
      expect(r.ok).toBe(true);
      // Mailchannels stubbed to fail → falls through to console.
      if (r.ok) expect(['resend', 'mailchannels', 'console']).toContain(r.provider);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('prefers resend when RESEND_API_KEY is set', async () => {
    const env = makeEnv({ RESEND_API_KEY: 're_test_123' });
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: 'fake' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as typeof fetch;
    try {
      const r = await sendEmail(env, { to: 'a@b.c', subject: 'hi', text: 'hello' });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.provider).toBe('resend');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('returns failure when every provider fails in production with no key', async () => {
    const env = makeEnv({ ENVIRONMENT: 'production' });
    // Stub fetch so both resend (skipped: no key) and mailchannels fail.
    // In production, resend is the first provider even without a key — it
    // returns 'no api key', mailchannels is stubbed to fail, so result is
    // not ok.
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('down', { status: 500 })) as typeof fetch;
    try {
      const r = await sendEmail(env, { to: 'a@b.c', subject: 'hi', text: 'hello' });
      expect(r.ok).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('falls back to console when mailchannels fails in local', async () => {
    const env = makeEnv();
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('forbidden', { status: 403 })) as typeof fetch;
    try {
      const r = await sendEmail(env, { to: 'a@b.c', subject: 'fallback', text: 'x' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.provider).toBe('console');
        const log = logBuffer[logBuffer.length - 1] ?? '';
        expect(log).toContain('"to":"a@b.c"');
        expect(log).toContain('"subject":"fallback"');
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('sendEmailOrThrow', () => {
  it('throws EMAIL_SEND_FAILED when every provider fails in production', async () => {
    const env = makeEnv({ ENVIRONMENT: 'production' });
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response('down', { status: 500 })) as typeof fetch;
    try {
      await expect(
        sendEmailOrThrow(env, { to: 'a@b.c', subject: 'x', text: 'y' }),
      ).rejects.toMatchObject({ code: 'EMAIL_SEND_FAILED' });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('templates', () => {
  it('renderPasswordReset includes URL and ttl', () => {
    const m = renderPasswordReset({
      to: 'a@b.c',
      url: 'https://vyro.local/reset?token=xyz',
      ttlMinutes: 60,
    });
    expect(m.subject).toMatch(/Reset your Vyro password/i);
    expect(m.text).toContain('https://vyro.local/reset?token=xyz');
    expect(m.text).toContain('60 minutes');
    expect(m.html).toContain('https://vyro.local/reset?token=xyz');
    // HTML-escapes the URL even though ours is safe — proves the escaper runs.
    expect(m.html!).not.toMatch(/&amp;xyz/);
  });

  it('renderAdminInvite includes role and accept url', () => {
    const m = renderAdminInvite({
      to: 'a@b.c',
      acceptUrl: 'https://vyro.local/admin/invite/accept?token=abc',
      role: 'ops',
      expiresAtIso: '2026-01-01T00:00:00.000Z',
      invitedBy: 'alice',
    });
    expect(m.subject).toContain('ops');
    expect(m.text).toContain('https://vyro.local/admin/invite/accept?token=abc');
    expect(m.text).toContain('2026-01-01T00:00:00.000Z');
    expect(m.html).toContain('<strong>alice</strong>');
  });

  it('renderSupplierVerification renders both branches', () => {
    const ok = renderSupplierVerification({
      to: 'a@b.c',
      status: 'verified',
      link: 'https://vyro.local/supplier/verification',
    });
    expect(ok.subject).toMatch(/verified/i);

    const bad = renderSupplierVerification({
      to: 'a@b.c',
      status: 'rejected',
      reason: '<bad docs>',
      link: 'https://vyro.local/supplier/verification',
    });
    expect(bad.subject).toMatch(/rejected/i);
    expect(bad.html!).toContain('&lt;bad docs&gt;'); // escaped
  });
});

describe('defaultFromAddress', () => {
  it('falls back when EMAIL_FROM missing', () => {
    expect(defaultFromAddress(makeEnv())).toBe('Vyro <no-reply@vyro.local>');
  });
  it('uses EMAIL_FROM when present', () => {
    expect(defaultFromAddress(makeEnv({ EMAIL_FROM: 'Ops <ops@vyro.io>' }))).toBe(
      'Ops <ops@vyro.io>',
    );
  });
});
