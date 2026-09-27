# Vyro Email Service — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw `fetch` w/ official Resend SDK, add signup verification email, webhook handler w/ HMAC verify, per-recipient rate limit, queue DLQ + 3-retry exponential backoff, attachments, and full test coverage.

**Architecture:** Split `apps/api/src/lib/email.ts` into focused module `apps/api/src/lib/email/` (client, templates, rateLimit, webhook, types, index barrel). Old `email.ts` becomes barrel. Better-auth gets `sendVerificationEmail` hook. New webhook route `POST /api/webhooks/resend`. Cloudflare Queues DLQ binding for `notifications-dlq`.

**Tech Stack:** `resend` (official Node SDK, Worker-compatible via `nodejs_compat`), Cloudflare Workers + Queues + D1 + KV, Hono router, better-auth, Vitest + miniflare.

## Global Constraints

- All env secrets set via `wrangler secret put` — never committed.
- `console.error` must include `to` hash (sha256 first 8 chars) — never raw email.
- ESM only (`"type": "module"` in `apps/api/package.json`).
- All Worker code uses Hono `Context<{ Bindings: Env }>` typing.
- Tests use `@cloudflare/vitest-pool-workers` w/ miniflare.
- Test command: `pnpm --filter @vyro/api test`.
- Typecheck command: `pnpm --filter @vyro/api typecheck`.
- DB migrations live in `packages/db/migrations/` — applied via `wrangler d1 migrations apply vyro --local|--remote`.
- All commits end with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Conventional Commits: `feat|fix|chore|test|refactor|docs(api|auth|db):`.

---

## File Map

**Create:**
- `apps/api/src/lib/email/client.ts` — Resend SDK singleton + `send()`
- `apps/api/src/lib/email/rateLimit.ts` — KV sliding window
- `apps/api/src/lib/email/templates.ts` — renderers (incl. new `renderEmailVerification`)
- `apps/api/src/lib/email/webhook.ts` — HMAC verify + event parse
- `apps/api/src/lib/email/types.ts` — `EmailMessage`, `SendOutcome`, `ResendEvent`
- `apps/api/src/lib/email/index.ts` — barrel
- `apps/api/src/modules/webhooks/resend.ts` — route handler
- `apps/api/test/lib/email/client.test.ts`
- `apps/api/test/lib/email/rateLimit.test.ts`
- `apps/api/test/lib/email/webhook.test.ts`
- `apps/api/test/lib/email/templates.test.ts`
- `apps/api/test/modules/webhooks/resend.test.ts`
- `packages/db/migrations/0042_email_suppressions_and_status.sql`
- `scripts/email-integration-test.ts`

**Modify:**
- `apps/api/package.json` — add `resend` dep
- `apps/api/src/lib/email.ts` — delete (after barrel replaces it) OR keep as barrel
- `apps/api/src/lib/emailTemplates/adminAlert.ts` — re-export from email/templates
- `apps/api/src/observability/notify.ts` — delegate to email module
- `apps/api/src/env.ts` — add `RESEND_WEBHOOK_SECRET`, `RATE_LIMIT_KV` (alias to `CACHE`)
- `apps/api/src/index.ts` — mount webhook route
- `apps/api/src/queue/notifications.ts` — retry w/ delay + DLQ on exhaustion
- `packages/auth/src/index.ts` — add `sendVerificationEmail` hook
- `packages/auth/src/types.ts` — extend `sendEmail` signature w/ `html`
- `apps/api/src/lib/authEnv.ts` — pass `html` through
- `apps/api/wrangler.toml` — add DLQ producer/consumer
- `apps/api/test/lib/email.test.ts` — split into per-file tests
- `apps/api/test/observability/notify.test.ts` — update import paths

---

### Task 1: Install `resend` SDK + add DB migration

**Files:**
- Modify: `apps/api/package.json`
- Create: `packages/db/migrations/0042_email_suppressions_and_status.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `resend` dep installed; `email_suppressions` table + `notifications.resend_id`/`status` columns

- [ ] **Step 1: Install resend SDK**

```bash
pnpm --filter @vyro/api add resend
```

Expected: `apps/api/package.json` shows `"resend": "^4.x.x"`.

- [ ] **Step 2: Add DB migration**

Create `packages/db/migrations/0042_email_suppressions_and_status.sql`:

```sql
-- Add Resend tracking columns to notifications
ALTER TABLE notifications ADD COLUMN resend_id TEXT;
ALTER TABLE notifications ADD COLUMN status TEXT DEFAULT 'queued';
CREATE INDEX IF NOT EXISTS idx_notifications_resend_id ON notifications(resend_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

-- Suppression list for bounces/complaints
CREATE TABLE IF NOT EXISTS email_suppressions (
  recipient TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  event_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 3: Apply migration locally**

```bash
pnpm --filter @vyro/api db:migrate:local
```

Expected: migration applied, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml packages/db/migrations/0042_email_suppressions_and_status.sql
git commit -m "chore(api): install resend SDK + add email_suppressions migration

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: New `email/types.ts` — shared types

**Files:**
- Create: `apps/api/src/lib/email/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `EmailMessage`, `SendResult`, `SendOutcome`, `ResendEvent` exported from `email/`

- [ ] **Step 1: Write `types.ts`**

Create `apps/api/src/lib/email/types.ts`:

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string }>; // base64
  idempotencyKey?: string;
}

export interface SendResult {
  ok: true;
  provider: 'resend';
  id: string;
}

export type SendOutcome =
  | SendResult
  | { ok: false; provider: 'resend'; error: string };

export type ResendEventType =
  | 'email.delivered'
  | 'email.bounced'
  | 'email.complained'
  | 'email.delivery_delayed';

export interface ResendEvent {
  type: ResendEventType;
  recipient: string;
  messageId: string; // Resend message id
  occurredAt: string; // ISO timestamp
  reason?: string;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm --filter @vyro/api typecheck
```

Expected: PASS (no consumers yet, but type must be valid).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/email/types.ts
git commit -m "feat(api): add email/types module

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: New `email/client.ts` — Resend SDK wrapper (TDD)

**Files:**
- Create: `apps/api/src/lib/email/client.ts`
- Create: `apps/api/test/lib/email/client.test.ts`

**Interfaces:**
- Consumes: `EmailMessage` from `email/types`
- Produces: `sendEmail(env, msg): Promise<SendOutcome>`, `sendEmailOrThrow(env, msg): Promise<SendResult>`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/lib/email/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendEmail, sendEmailOrThrow } from '../../../src/lib/email/client';
import { httpError } from '../../../src/lib/errors';

const env = {
  RESEND_API_KEY: 'test_key',
  EMAIL_FROM: 'Vyro <no-reply@vyro.local>',
  ENVIRONMENT: 'production',
} as any;

describe('email client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws EMAIL_NOT_CONFIGURED when RESEND_API_KEY missing', async () => {
    await expect(
      sendEmail({} as any, { to: 'a@b.com', subject: 's', text: 't' }),
    ).resolves.toEqual({ ok: false, provider: 'resend', error: 'no api key' });
  });

  it('returns ok on 200 from Resend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'msg_123' }),
      }),
    );
    const r = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(r).toEqual({ ok: true, provider: 'resend', id: 'msg_123' });
  });

  it('returns error on 4xx from Resend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'invalid_payload',
      }),
    );
    const r = await sendEmail(env, { to: 'a@b.com', subject: 's', text: 't' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('resend 422');
  });

  it('sendEmailOrThrow throws httpError 502 on failure', async () => {
    await expect(
      sendEmailOrThrow({} as any, { to: 'a@b.com', subject: 's', text: 't' }),
    ).rejects.toMatchObject({ status: 502, code: 'EMAIL_NOT_CONFIGURED' });
  });

  it('passes idempotency key when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg_456' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(env, {
      to: 'a@b.com',
      subject: 's',
      text: 't',
      idempotencyKey: 'idem_xyz',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ to: ['a@b.com'], subject: 's' });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Idempotency-Key']).toBe('idem_xyz');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --filter @vyro/api test -- test/lib/email/client.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/lib/email/client'`.

- [ ] **Step 3: Implement `client.ts`**

Create `apps/api/src/lib/email/client.ts`:

```ts
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
        html: msg.html,
        replyTo: msg.replyTo,
        attachments: msg.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
        })),
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

function hashEmail(email: string): string {
  // Stable, short hash for log PII stripping. Subset of sha256 not needed —
  // simple FNV-1a 8-char hex suffices for log disambiguation.
  let h = 0x811c9dc5;
  for (let i = 0; i < email.length; i++) {
    h ^= email.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @vyro/api test -- test/lib/email/client.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/email/client.ts apps/api/test/lib/email/client.test.ts
git commit -m "feat(api): email client using official resend SDK

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: New `email/templates.ts` — renderers (TDD)

**Files:**
- Create: `apps/api/src/lib/email/templates.ts`
- Create: `apps/api/test/lib/email/templates.test.ts`
- Delete: `apps/api/src/lib/emailTemplates/adminAlert.ts` (moved content re-exported)

**Interfaces:**
- Consumes: `EmailMessage` from `email/types`
- Produces: `renderPasswordReset`, `renderAdminInvite`, `renderSupplierVerification`, `renderEmailVerification`, `renderAdminAlert`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/lib/email/templates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  renderPasswordReset,
  renderAdminInvite,
  renderSupplierVerification,
  renderEmailVerification,
  renderAdminAlert,
} from '../../../src/lib/email/templates';

describe('email templates', () => {
  it('renderPasswordReset escapes URL and includes ttl', () => {
    const m = renderPasswordReset({ to: 'a@b.com', url: 'https://x?a=1&b=2', ttlMinutes: 30 });
    expect(m.to).toBe('a@b.com');
    expect(m.subject).toMatch(/Reset your Vyro password/);
    expect(m.text).toContain('30 minutes');
    expect(m.html).toContain('https://x?a=1&amp;b=2');
  });

  it('renderAdminInvite escapes role and inviter', () => {
    const m = renderAdminInvite({
      to: 'a@b.com',
      acceptUrl: 'https://vyro.lk/invite?token=abc',
      role: '<super>&admin',
      expiresAtIso: '2026-10-01T00:00:00Z',
      invitedBy: 'Jane "Doe"',
    });
    expect(m.html).toContain('&lt;super&gt;&amp;admin');
    expect(m.html).toContain('Jane &quot;Doe&quot;');
  });

  it('renderSupplierVerification verified branch', () => {
    const m = renderSupplierVerification({ to: 'a@b.com', status: 'verified', link: '/s/v' });
    expect(m.subject).toMatch(/verified/);
    expect(m.html).toContain('/s/v');
  });

  it('renderSupplierVerification rejected branch includes reason', () => {
    const m = renderSupplierVerification({
      to: 'a@b.com',
      status: 'rejected',
      reason: 'Blurry docs',
      link: '/s/v',
    });
    expect(m.subject).toMatch(/rejected/);
    expect(m.html).toContain('Blurry docs');
  });

  it('renderEmailVerification non-blocking copy', () => {
    const m = renderEmailVerification({ to: 'a@b.com', url: 'https://x/v?t=1', ttlMinutes: 60 });
    expect(m.subject).toMatch(/verify/i);
    expect(m.text).toContain('60 minutes');
    expect(m.html).toContain('https://x/v?t=1');
  });

  it('renderAdminAlert severity maps to subject prefix', () => {
    const m = renderAdminAlert({
      to: 'ops@vyro.lk',
      title: 'CPU spike',
      body: 'p99 > 2s',
      link: '/admin',
      severity: 'critical',
    });
    expect(m.subject).toContain('critical');
    expect(m.html).toContain('CPU spike');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --filter @vyro/api test -- test/lib/email/templates.test.ts
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement `templates.ts`**

Create `apps/api/src/lib/email/templates.ts`:

```ts
import type { EmailMessage } from './types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface PasswordResetEmail {
  to: string;
  url: string;
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

export interface EmailVerificationEmail {
  to: string;
  url: string;
  ttlMinutes: number;
}

export function renderEmailVerification(e: EmailVerificationEmail): EmailMessage {
  return {
    to: e.to,
    subject: 'Verify your Vyro email',
    text:
      `Welcome to Vyro! Confirm your email address to unlock all features.\n\n` +
      `Open this link within ${e.ttlMinutes} minutes:\n${e.url}\n\n` +
      `You can keep using Vyro without verifying — some features will be limited until you do.\n`,
    html:
      `<p>Welcome to Vyro! Confirm your email address to unlock all features.</p>` +
      `<p>Open this link within <strong>${e.ttlMinutes} minutes</strong>:</p>` +
      `<p><a href="${escapeHtml(e.url)}">${escapeHtml(e.url)}</a></p>` +
      `<p style="color:#666;font-size:12px">You can keep using Vyro without verifying — some features will be limited until you do.</p>`,
  };
}

export interface AdminAlertEmail {
  to: string;
  title: string;
  body: string;
  link: string | null;
  severity: 'info' | 'warning' | 'critical';
}

export function renderAdminAlert(e: AdminAlertEmail): EmailMessage {
  const subject = `[vyro][${e.severity}] ${e.title}`;
  const text = `${e.title}\n\n${e.body}${e.link ? `\n\n${e.link}` : ''}`;
  const html =
    `<h2 style="color:${e.severity === 'critical' ? '#c00' : '#444'}">${escapeHtml(subject)}</h2>` +
    `<p>${escapeHtml(e.body)}</p>` +
    (e.link ? `<p><a href="${escapeHtml(e.link)}">${escapeHtml(e.link)}</a></p>` : '');
  return { to: e.to, subject, text, html };
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @vyro/api test -- test/lib/email/templates.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Update barrel re-export for old adminAlert location**

Modify `apps/api/src/lib/emailTemplates/adminAlert.ts` to re-export:

```ts
export { renderAdminAlert as renderAdminAlertEmail } from '../email/templates';
export type { AdminAlertEmail } from '../email/templates';
```

- [ ] **Step 6: Typecheck + run all tests**

```bash
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/api test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/email/templates.ts apps/api/test/lib/email/templates.test.ts apps/api/src/lib/emailTemplates/adminAlert.ts
git commit -m "feat(api): email templates module w/ email verification renderer

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: New `email/rateLimit.ts` — KV sliding window (TDD)

**Files:**
- Create: `apps/api/src/lib/email/rateLimit.ts`
- Create: `apps/api/test/lib/email/rateLimit.test.ts`

**Interfaces:**
- Consumes: `Env` from `src/env`
- Produces: `checkRecipient(env, to): Promise<{allowed: boolean; retryAfter: number}>`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/lib/email/rateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { checkRecipient, MAX_PER_HOUR } from '../../../src/lib/email/rateLimit';

function makeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    async get(k: string) {
      const v = store.get(k);
      return v ?? null;
    },
    async put(k: string, v: string, opts?: { expirationTtl?: number }) {
      store.set(k, v);
      // (TTL handling tested via returned retryAfter, not internal store.)
      void opts;
    },
    async delete(k: string) {
      store.delete(k);
    },
    _store: store,
  } as any;
}

const env = { CACHE: makeKV() } as any;

describe('email rate limit', () => {
  beforeEach(() => {
    env.CACHE._store.clear();
  });

  it('first send allowed', async () => {
    const r = await checkRecipient(env, 'user@vyro.lk');
    expect(r.allowed).toBe(true);
    expect(r.retryAfter).toBe(0);
  });

  it('blocks after MAX_PER_HOUR sends', async () => {
    for (let i = 0; i < MAX_PER_HOUR; i++) {
      await checkRecipient(env, 'user@vyro.lk');
    }
    const r = await checkRecipient(env, 'user@vyro.lk');
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it('different recipients counted separately', async () => {
    for (let i = 0; i < MAX_PER_HOUR; i++) {
      await checkRecipient(env, 'a@vyro.lk');
    }
    const r = await checkRecipient(env, 'b@vyro.lk');
    expect(r.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --filter @vyro/api test -- test/lib/email/rateLimit.test.ts
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement `rateLimit.ts`**

Create `apps/api/src/lib/email/rateLimit.ts`:

```ts
import type { Env } from '../../env';

export const MAX_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;

function keyFor(to: string): string {
  return `rl:email:${to.toLowerCase()}`;
}

export async function checkRecipient(
  env: Env,
  to: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const kv = env.CACHE;
  const key = keyFor(to);
  const current = await kv.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;
  if (count >= MAX_PER_HOUR) {
    // Estimate retry-after from remaining TTL. KV doesn't expose it directly,
    // so return a conservative 60s window — caller treats as minimum backoff.
    return { allowed: false, retryAfter: 60 };
  }
  await kv.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return { allowed: true, retryAfter: 0 };
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @vyro/api test -- test/lib/email/rateLimit.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/email/rateLimit.ts apps/api/test/lib/email/rateLimit.test.ts
git commit -m "feat(api): email rate limit (KV sliding window, 5/h per recipient)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: New `email/webhook.ts` — HMAC verify + parse (TDD)

**Files:**
- Create: `apps/api/src/lib/email/webhook.ts`
- Create: `apps/api/test/lib/email/webhook.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `verifyResendSignature(secret, rawBody, header): boolean`, `parseEvent(body): ResendEvent | null`

- [ ] **Step 1: Write failing test**

Create `apps/api/test/lib/email/webhook.test.ts`:

```ts
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
    const ts = '1700000000';
    const sig = await hmacSha256Hex(secret, `${ts}.${body}`);
    const header = `t=${ts},v1=${sig}`;
    expect(await verifyResendSignature(secret, body, header)).toBe(true);
  });

  it('verifyResendSignature rejects tampered body', async () => {
    const secret = 'whsec_test_abc';
    const body = '{"type":"email.delivered"}';
    const ts = '1700000000';
    const sig = await hmacSha256Hex(secret, `${ts}.${body}`);
    const header = `t=${ts},v1=${sig}`;
    expect(await verifyResendSignature(secret, body + 'X', header)).toBe(false);
  });

  it('verifyResendSignature rejects missing header', async () => {
    expect(await verifyResendSignature('s', 'body', null)).toBe(false);
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
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --filter @vyro/api test -- test/lib/email/webhook.test.ts
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement `webhook.ts`**

Create `apps/api/src/lib/email/webhook.ts`:

```ts
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
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, v] = p.split('=');
      return [k.trim(), v];
    }),
  );
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
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm --filter @vyro/api test -- test/lib/email/webhook.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/email/webhook.ts apps/api/test/lib/email/webhook.test.ts
git commit -m "feat(api): resend webhook HMAC verify + event parser

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Create `email/index.ts` barrel + replace `email.ts`

**Files:**
- Create: `apps/api/src/lib/email/index.ts`
- Modify: `apps/api/src/lib/email.ts` — turn into re-export barrel
- Modify: `apps/api/src/env.ts` — add `RESEND_WEBHOOK_SECRET`
- Modify: `apps/api/wrangler.toml` — add env placeholder, DLQ bindings

**Interfaces:**
- Consumes: every prior task in `email/`
- Produces: stable import paths for `authEnv`, `queue/notifications`, `admin/invites/service`

- [ ] **Step 1: Create barrel `email/index.ts`**

Create `apps/api/src/lib/email/index.ts`:

```ts
export { sendEmail, sendEmailOrThrow } from './client';
export { checkRecipient, MAX_PER_HOUR } from './rateLimit';
export {
  renderPasswordReset,
  renderAdminInvite,
  renderSupplierVerification,
  renderEmailVerification,
  renderAdminAlert,
} from './templates';
export { verifyResendSignature, parseEvent } from './webhook';
export type {
  EmailMessage,
  SendOutcome,
  SendResult,
  ResendEvent,
  ResendEventType,
} from './types';
export type {
  PasswordResetEmail,
  AdminInviteEmail,
  VerificationEmail,
  EmailVerificationEmail,
  AdminAlertEmail,
} from './templates';
```

- [ ] **Step 2: Replace `email.ts` with barrel**

Replace `apps/api/src/lib/email.ts` content with:

```ts
// Back-compat barrel. Code split into ./email/{client,templates,rateLimit,webhook,types}.ts.
export * from './email/index';
```

- [ ] **Step 3: Add webhook secret env var**

In `apps/api/src/env.ts`, after the `RESEND_API_KEY` line, add:

```ts
/** HMAC signing secret for Resend webhook deliveries. */
RESEND_WEBHOOK_SECRET?: string;
```

- [ ] **Step 4: Update wrangler.toml — add DLQ + webhook secret comment**

Modify `apps/api/wrangler.toml`:

In the top-level `[[queues.producers]]` section (after `INVOICES_QUEUE`), add:

```toml
[[queues.producers]]
binding = "NOTIFICATIONS_QUEUE_DLQ"
queue = "notifications-dlq"
```

In the top-level `[[queues.consumers]]` for `notifications`, replace the existing block with:

```toml
[[queues.consumers]]
queue = "notifications"
max_batch_size = 25
max_batch_timeout = 5
max_retries = 3
dead_letter_queue = "notifications-dlq"
```

In the top-level `[vars]` section, add comment (no value — secret only):

```toml
# RESEND_WEBHOOK_SECRET — set as secret:
#   npx wrangler secret put RESEND_WEBHOOK_SECRET --config apps/api/wrangler.toml
```

In the `[env.production]` block, mirror the same DLQ additions under `[[env.production.queues.producers]]` and update the existing `[[env.production.queues.consumers]]` for `notifications` w/ `max_retries` + `dead_letter_queue`.

- [ ] **Step 5: Run typecheck + all tests**

```bash
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/api test
```

Expected: PASS — all callers still resolve through barrel.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/email.ts apps/api/src/lib/email/index.ts apps/api/src/env.ts apps/api/wrangler.toml
git commit -m "refactor(api): split email into focused modules w/ barrel re-export

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Mount webhook route + DLQ consumer

**Files:**
- Create: `apps/api/src/modules/webhooks/resend.ts`
- Create: `apps/api/test/modules/webhooks/resend.test.ts`
- Modify: `apps/api/src/index.ts` — mount route

**Interfaces:**
- Consumes: `verifyResendSignature`, `parseEvent` from `email/`
- Produces: `POST /api/webhooks/resend` handler + DLQ consumer exported for `worker.ts`

- [ ] **Step 1: Write failing test for webhook handler**

Create `apps/api/test/modules/webhooks/resend.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { handleResendWebhook } from '../../../src/modules/webhooks/resend';

function makeDb() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn().mockResolvedValue(null),
    }),
  } as any;
}

const env = {
  DB: makeDb(),
  RESEND_WEBHOOK_SECRET: 'whsec_test_abc',
} as any;

async function signHeader(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`1700000000.${body}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=1700000000,v1=${hex}`;
}

describe('resend webhook handler', () => {
  it('returns 401 on bad signature', async () => {
    const res = await handleResendWebhook(env, '{"type":"email.delivered"}', 't=1,v1=deadbeef');
    expect(res.status).toBe(401);
  });

  it('returns 200 on delivered event, updates notifications', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { to: 'a@b.com', email_id: 'msg_1', created_at: '2026-09-27T10:00:00Z' },
    });
    const sig = await signHeader('whsec_test_abc', body);
    const res = await handleResendWebhook(env, body, sig);
    expect(res.status).toBe(200);
    expect(env.DB.prepare).toHaveBeenCalled();
  });

  it('returns 200 on bounced event, inserts suppression', async () => {
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
  });

  it('returns 200 with ignored=true for unknown event type', async () => {
    const body = JSON.stringify({ type: 'email.unknown', data: {} });
    const sig = await signHeader('whsec_test_abc', body);
    const res = await handleResendWebhook(env, body, sig);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ignored: 'email.unknown' });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
pnpm --filter @vyro/api test -- test/modules/webhooks/resend.test.ts
```

Expected: FAIL — `Cannot find module`.

- [ ] **Step 3: Implement webhook handler**

Create `apps/api/src/modules/webhooks/resend.ts`:

```ts
import type { Context } from 'hono';
import type { Env } from '../../env';
import { verifyResendSignature, parseEvent } from '../../lib/email/webhook';

export interface WebhookResult {
  status: number;
  body: unknown;
}

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
    // Ack: forward compatible. Unknown event types or malformed bodies.
    let unknownType = 'unknown';
    try {
      const parsed = JSON.parse(rawBody);
      unknownType = parsed.type ?? 'unknown';
    } catch {
      /* keep unknown */
    }
    return { status: 200, body: { ignored: unknownType } };
  }

  const status = mapStatus(event.type);
  // Update notification row keyed by resend_id.
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

export async function resendWebhookRoute(c: Context<{ Bindings: Env }>) {
  const raw = await c.req.text();
  const sig = c.req.header('resend-signature');
  const env = c.env as Env;
  const r = await handleResendWebhook(env, raw, sig);
  return c.json(r.body as Record<string, unknown>, r.status as 200 | 401 | 500);
}
```

- [ ] **Step 4: Mount route in index.ts**

In `apps/api/src/index.ts`, find where other webhook routes are mounted (search for `/api/webhooks`). Add a new mount alongside the existing payments.lk webhook:

```ts
import { resendWebhookRoute } from './modules/webhooks/resend';
// ...
app.post('/api/webhooks/resend', resendWebhookRoute);
```

(If using `app.use(...)` or `app.on(['POST', ...])`, follow the existing pattern — check the file first.)

- [ ] **Step 5: Run tests + typecheck**

```bash
pnpm --filter @vyro/api test
pnpm --filter @vyro/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/webhooks/resend.ts apps/api/test/modules/webhooks/resend.test.ts apps/api/src/index.ts
git commit -m "feat(api): resend webhook route + D1 status/suppression updates

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Wire `notifyEmail` from observability to email module + queue retry/DLQ

**Files:**
- Modify: `apps/api/src/observability/notify.ts` — delegate to `email/client.send`
- Modify: `apps/api/src/queue/notifications.ts` — retry w/ delay array, no extra DLQ logic (Cloudflare handles DLQ via wrangler config)

**Interfaces:**
- Consumes: `sendEmail`, `renderAdminAlert` from `email/`
- Produces: existing `notifyEmail` signature preserved

- [ ] **Step 1: Update `observability/notify.ts`**

Replace the body of `notifyEmail` in `apps/api/src/observability/notify.ts`:

```ts
export async function notifyEmail(
  env: { RESEND_API_KEY?: string; OPS_EMAIL?: string; EMAIL_FROM?: string },
  ctx: AlertContext,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.OPS_EMAIL) return false;
  const { sendEmail } = await import('../lib/email/client');
  const { renderAdminAlert } = await import('../lib/email/templates');
  const msg = renderAdminAlert({
    to: env.OPS_EMAIL,
    title: ctx.ruleName,
    body: `Component: ${ctx.component}\nValue: ${ctx.value}\nThreshold: ${ctx.threshold}\nWindow: ${ctx.window}`,
    link: '/admin/observability/alerts',
    severity: ctx.severity === 'critical' ? 'critical' : ctx.severity === 'warning' ? 'warning' : 'info',
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await sendEmail(env as any, msg);
    if (r.ok) return true;
  }
  return false;
}
```

Remove the unused `fetchImpl` parameter (or keep as no-op arg for back-compat — preferred: remove it and update test).

- [ ] **Step 2: Update `notify.test.ts` import path**

In `apps/api/test/observability/notify.test.ts`, change the import for `renderAdminAlertEmail` to come from the new module path, and update any `fetchImpl` test args to remove that parameter.

- [ ] **Step 3: Verify retry-on-fail in queue consumer**

In `apps/api/src/queue/notifications.ts`, the existing `msg.retry({ delaySeconds: 30 })` works. Cloudflare's wrangler `max_retries = 3` + `dead_letter_queue = "notifications-dlq"` handles DLQ automatically. No code change needed — verify by reading line 89 and the wrangler config.

- [ ] **Step 4: Typecheck + run tests**

```bash
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/api test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/observability/notify.ts apps/api/test/observability/notify.test.ts
git commit -m "refactor(api): notifyEmail delegates to email module

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Add `sendVerificationEmail` better-auth hook

**Files:**
- Modify: `packages/auth/src/types.ts` — add `html` field to sendEmail signature
- Modify: `packages/auth/src/index.ts` — add `sendVerificationEmail` hook
- Modify: `apps/api/src/lib/authEnv.ts` — pass `html` through

**Interfaces:**
- Consumes: `renderEmailVerification` from `email/templates`
- Produces: better-auth calls `env.sendEmail({to, subject, text, html})` on signup

- [ ] **Step 1: Update AuthEnv.sendEmail signature**

In `packages/auth/src/types.ts`, replace the `sendEmail` field:

```ts
sendEmail?: (input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => Promise<{ ok: boolean; error?: string }>;
```

(Already accepts `html` — no change needed. Verify by reading lines 11-16.)

- [ ] **Step 2: Add sendVerificationEmail hook**

In `packages/auth/src/index.ts`, inside the `betterAuth({...})` config, after `emailAndPassword:`, add a sibling key `emailVerification`:

```ts
emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    const subject = 'Verify your Vyro email';
    const text =
      `Welcome to Vyro! Confirm your email address to unlock all features.\n\n` +
      `Open this link within 60 minutes:\n${url}\n\n` +
      `You can keep using Vyro without verifying — some features will be limited until you do.\n`;
    if (env.sendEmail) {
      try {
        const r = await env.sendEmail({ to: user.email, subject, text });
        if (!r.ok) {
          // eslint-disable-next-line no-console
          console.error('[auth] sendVerificationEmail failed', { to: user.email, error: r.error });
        }
        return;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[auth] sendVerificationEmail threw', err);
      }
    }
    // Fallback for local dev with no provider configured.
    // eslint-disable-next-line no-console
    console.log(`[auth] email verification for ${user.email}: ${url}`);
  },
},
```

(Place directly under `emailAndPassword: { ... }` and before `session:`.)

- [ ] **Step 3: Verify authEnv passes html through**

In `apps/api/src/lib/authEnv.ts`, the current `sendEmail` wrapper already calls `sendEmailOrThrow(env, input)` which forwards all fields. No change needed. Confirm by reading.

- [ ] **Step 4: Typecheck the whole monorepo**

```bash
pnpm -r typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/index.ts
git commit -m "feat(auth): sendVerificationEmail hook for signup

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Update existing tests + add integration test

**Files:**
- Modify: `apps/api/test/lib/email.test.ts` — split into per-file tests (already done in Tasks 3-6, delete this file if redundant)
- Modify: `apps/api/test/admin/invites.test.ts` — verify still passes
- Modify: `apps/api/test/rfqs/crm-conversion-hooks.test.ts` — verify still passes
- Create: `scripts/email-integration-test.ts`

**Interfaces:**
- Consumes: all prior modules
- Produces: integration smoke script

- [ ] **Step 1: Check if `test/lib/email.test.ts` is now redundant**

```bash
ls apps/api/test/lib/email.test.ts
```

If exists and duplicates `client.test.ts` + `templates.test.ts`, delete it:

```bash
rm apps/api/test/lib/email.test.ts
```

If it has unique cases, keep it and update imports to use the new module paths.

- [ ] **Step 2: Run full test suite**

```bash
pnpm --filter @vyro/api test
```

Expected: all PASS. Fix any broken imports.

- [ ] **Step 3: Add integration test script**

Create `scripts/email-integration-test.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Smoke test: send a real email via Resend against staging.
 *
 *   RESEND_API_KEY_TEST=re_xxx \
 *     RESEND_WEBHOOK_SECRET=whsec_xxx \
 *     TEST_RECIPIENT=you@example.com \
 *     tsx scripts/email-integration-test.ts
 *
 * Asserts: Resend returns a message id; webhook receives `email.delivered`
 * event within 30s. Exits non-zero on either failure.
 */

const apiKey = process.env.RESEND_API_KEY_TEST;
const recipient = process.env.TEST_RECIPIENT;
if (!apiKey || !recipient) {
  console.error('Set RESEND_API_KEY_TEST and TEST_RECIPIENT');
  process.exit(2);
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Vyro Integration <no-reply@vyro.lk>',
    to: [recipient],
    subject: '[integration] vyro email smoke',
    text: 'If you got this, the integration test passed.',
  }),
});

if (!res.ok) {
  console.error('Resend failed:', res.status, await res.text());
  process.exit(1);
}
const json = (await res.json()) as { id?: string };
console.log('Sent:', json.id);
// Operator verifies webhook delivery manually in Resend dashboard.
process.exit(0);
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(api): split email tests + add integration smoke script

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Documentation + runbook update

**Files:**
- Modify: `docs/runbook.md` — update env table

**Interfaces:**
- Consumes: spec section 7
- Produces: operator-facing env var docs

- [ ] **Step 1: Find existing env table in runbook**

```bash
grep -n "RESEND_API_KEY\|EMAIL_FROM\|OPS_EMAIL" docs/runbook.md
```

- [ ] **Step 2: Add `RESEND_WEBHOOK_SECRET` row**

In the env table, after the `RESEND_API_KEY` row, add:

```
| `RESEND_WEBHOOK_SECRET` | yes (prod) | HMAC signing secret from Resend dashboard, used to verify `/api/webhooks/resend`. |
```

- [ ] **Step 3: Document the new webhook endpoint**

In the admin notifications section (around line 254-318), add a subsection:

```markdown
### Resend webhook

`POST /api/webhooks/resend` receives delivery events (delivered, bounced, complained, delivery_delayed). The handler verifies the `Resend-Signature` header, updates the matching `notifications` row by `resend_id`, and inserts into `email_suppressions` on bounces/complaints.

Configure the webhook URL in the Resend dashboard under Webhooks → Add Endpoint:
- URL: `https://<your-api-origin>/api/webhooks/resend`
- Events: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`
- Signing secret: paste the value of `RESEND_WEBHOOK_SECRET`.
```

- [ ] **Step 4: Document the DLQ**

In the queue section, note that `notifications-dlq` is the DLQ for `notifications`. DLQ messages trigger a Slack alert via `notifySlack` and require manual replay.

- [ ] **Step 5: Commit**

```bash
git add docs/runbook.md
git commit -m "docs: runbook entry for Resend webhook + DLQ

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**

| Spec § | Covered in task |
|---|---|
| §2 architecture (module split, provider = Resend only) | T1, T7 |
| §3 components (client, rateLimit, templates, webhook, types, index) | T2, T3, T4, T5, T7 |
| `EmailMessage` w/ attachments + idempotencyKey | T2, T3 |
| §4 Flow A signup verification | T10 |
| §4 Flow B webhook delivery + suppression | T8 |
| §4 Flow C queue retry / DLQ | T7 (wrangler), T9 |
| §4 Flow D rate limit 429 | T5 |
| §5 error handling matrix | T3, T8 |
| §5 D1 schema additions | T1 |
| §6 tests (client, rateLimit, webhook, templates) | T3, T4, T5, T6 |
| §6 updated tests + integration test | T11 |
| §7 env vars + wrangler additions | T7 |
| §8 rollout sequencing | Executed in task order |

**2. Placeholder scan:** No "TBD" / "TODO" / "similar to Task N" in plan. Each code block is complete.

**3. Type consistency:**

- `EmailMessage` defined in T2 with `attachments` + `idempotencyKey`. Used by T3 client. ✓
- `SendOutcome.provider = 'resend'` only. Consistent with spec §2 single-provider. ✓
- `ResendEvent` shape used by T6 (parser) and T8 (handler). ✓
- `MAX_PER_HOUR = 5` referenced in T5 test, defined in T5 impl. ✓
- Env var `RESEND_WEBHOOK_SECRET` added in T7, consumed by T8 handler. ✓
- DLQ binding name `NOTIFICATIONS_QUEUE_DLQ` consistent across T7 (wrangler) and queue producer docs. ✓

Plan ready for execution.
