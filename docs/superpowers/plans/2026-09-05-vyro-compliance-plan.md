# VYRO Compliance (B4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Sri Lanka PDPA 2022 compliance baseline: legal docs, data export, account deletion, marketing opt-out, cookie consent.

**Architecture:** Static Markdown docs rendered by single React component. New API endpoints under existing `/api/settings/me/*` router (export, delete). Extend notifications PATCH with `notifyMarketing` already wired — add `marketingOptIn` column to users table. localStorage-backed consent banner.

**Tech Stack:** React + Vite (web), Hono + D1 (api), Vitest, TypeScript strict.

## Global Constraints

- TypeScript strict + `exactOptionalPropertyTypes: true`
- `errorEnvelope(err)` + `httpError(status, code, message, details?)` from `apps/api/src/lib/errors.ts`
- All settings endpoints already mount under `/api/settings` with `session()` middleware
- All web mutations use `useMutation` + `ApiError.message` for user feedback
- One task = one commit; branch `feat/b4-compliance` off `main`
- All legal text includes "Draft — pending lawyer review" banner

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/db/migrations/0002_compliance_fields.sql` | Add `marketing_opt_in`, `deletion_scheduled_for` to users |
| `packages/db/src/schema/users.ts` | Add columns + enum update for `pending_deletion` status |
| `apps/api/src/modules/settings/export.ts` | `GET /me/export` route |
| `apps/api/src/modules/settings/delete.ts` | `POST /me/delete` route |
| `apps/api/src/modules/settings/routes.ts` | Mount new routes |
| `apps/api/test/settings/export.test.ts` | Export endpoint tests |
| `apps/api/test/settings/delete.test.ts` | Delete endpoint tests |
| `apps/web/src/content/legal/terms.md` | Terms of Service (placeholder) |
| `apps/web/src/content/legal/privacy.md` | Privacy Policy (placeholder) |
| `apps/web/src/content/legal/cookies.md` | Cookie Policy (placeholder) |
| `apps/web/src/pages/LegalPage.tsx` | Generic Markdown renderer |
| `apps/web/src/components/CookieConsentBanner.tsx` | localStorage-backed banner |
| `apps/web/src/components/Layout.tsx` | Add banner + footer links |
| `apps/web/src/App.tsx` | Register `/legal/:kind` routes |
| `apps/web/src/pages/profile/ProfilePage.tsx` | Wire export + delete buttons |
| `apps/web/test/components/CookieConsentBanner.test.tsx` | Banner tests |

---

### Task 1: DB migration + schema update

**Files:**
- Create: `packages/db/migrations/0002_compliance_fields.sql`
- Modify: `packages/db/src/schema/users.ts`

**Interfaces:**
- Consumes: existing `users` table
- Produces: `users.marketing_opt_in INTEGER NOT NULL DEFAULT 1`, `users.deletion_scheduled_for INTEGER`

- [ ] **Step 1: Write migration**

Create `packages/db/migrations/0002_compliance_fields.sql`:

```sql
ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN deletion_scheduled_for INTEGER;
```

- [ ] **Step 2: Update schema enum**

In `packages/db/src/schema/users.ts`, change the status field line. Find:
```
status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
```
Replace with:
```
status: text('status', { enum: ['active', 'suspended', 'pending_deletion'] }).notNull().default('active'),
```

- [ ] **Step 3: Add columns to schema**

In `packages/db/src/schema/users.ts`, find the closing `});` of the users table and insert before it (after the last column definition):

```ts
  marketingOptIn: integer('marketing_opt_in', { mode: 'boolean' }).notNull().default(true),
  deletionScheduledFor: integer('deletion_scheduled_for'),
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0002_compliance_fields.sql packages/db/src/schema/users.ts
git commit -m "feat(compliance): add marketing_opt_in and deletion_scheduled_for"
```

---

### Task 2: GET /me/export endpoint

**Files:**
- Create: `apps/api/src/modules/settings/export.ts`
- Test: `apps/api/test/settings/export.test.ts`

**Interfaces:**
- Consumes: `c.env.DB`, `c.get('ctx').userId`
- Produces: `GET /me/export` → JSON dump

- [ ] **Step 1: Write failing test**

Create `apps/api/test/settings/export.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { errorEnvelope } from '../../src/lib/errors';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  user: { id: 'u-1', email: 'a@b.c' },
  businesses: [{ id: 'b-1', userId: 'u-1' }],
  suppliers: [{ id: 's-1', userId: 'u-1' }],
  orders: [{ id: 'o-1', businessId: 'b-1', supplierId: 's-1' }],
  payments: [{ id: 'p-1', businessId: 'b-1', supplierId: 's-1' }],
  notifications: [{ id: 'n-1', userId: 'u-1' }],
}));

const tables: Record<string, { rows: any[] }> = {
  users: { rows: [state.user] },
  businesses: { rows: state.businesses },
  suppliers: { rows: state.suppliers },
  purchaseOrders: { rows: state.orders },
  payments: { rows: state.payments },
  notifications: { rows: state.notifications },
  auditLogs: { rows: [] },
};

function dbMock() {
  return {
    select: () => ({
      from: (t: any) => ({
        where: () => ({
          get: async () => state.user,
          all: async () => {
            const name = Object.entries(tables).find(([k]) => k === t)?.[0];
            return name ? tables[name].rows : [];
          },
        }),
        get: async () => state.user,
        all: async () => state.businesses,
      }),
    }),
  };
}

vi.mock(setup.SRC + '/middleware/session', () => ({
  session: () => async (c: any, n: any) => { c.set('ctx', { userId: 'u-1' }); await n(); },
}));

import exportRouter from '../../src/modules/settings/export';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const env = errorEnvelope(err); return c.json(env.body, env.status as any); });
  app.route('/api/settings', exportRouter);
  return app;
}

const env = { DB: dbMock() as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

describe('GET /api/settings/me/export', () => {
  it('returns JSON dump with exportedAt', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/settings/me/export'), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.exportedAt).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- export.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write export route**

Create `apps/api/src/modules/settings/export.ts`:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { getDb } from '@vyro/db';
import { users, businesses, suppliers, purchaseOrders, payments, notifications } from '@vyro/db/schema';
import { eq, or, inArray } from 'drizzle-orm';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/me/export', async (c) => {
  const ctx = c.get('ctx') as { userId: string };
  const db = getDb(c.env.DB);
  const userRows = await db.select().from(users).where(eq(users.id, ctx.userId)).all();
  const businessRows = await db.select().from(businesses).where(eq(businesses.userId, ctx.userId)).all();
  const supplierRows = await db.select().from(suppliers).where(eq(suppliers.userId, ctx.userId)).all();
  const businessIds = businessRows.map((b) => b.id);
  const supplierIds = supplierRows.map((s) => s.id);
  const orderRows = (businessIds.length || supplierIds.length)
    ? await db.select().from(purchaseOrders).where(
        businessIds.length && supplierIds.length
          ? or(inArray(purchaseOrders.businessId, businessIds), inArray(purchaseOrders.supplierId, supplierIds))!
          : businessIds.length
            ? inArray(purchaseOrders.businessId, businessIds)
            : inArray(purchaseOrders.supplierId, supplierIds)
      ).all()
    : [];
  const paymentRows = (businessIds.length || supplierIds.length)
    ? await db.select().from(payments).where(
        businessIds.length && supplierIds.length
          ? or(inArray(payments.businessId, businessIds), inArray(payments.supplierId, supplierIds))!
          : businessIds.length
            ? inArray(payments.businessId, businessIds)
            : inArray(payments.supplierId, supplierIds)
      ).all()
    : [];
  const notificationRows = await db.select().from(notifications).where(eq(notifications.userId, ctx.userId)).all();
  return c.json({
    user: userRows[0] ?? null,
    businesses: businessRows,
    suppliers: supplierRows,
    orders: orderRows,
    payments: paymentRows,
    notifications: notificationRows,
    exportedAt: new Date().toISOString(),
  });
});

export default router;
```

- [ ] **Step 4: Mount in routes.ts**

In `apps/api/src/modules/settings/routes.ts`, add at top:
```ts
import exportRouter from './export';
```

And add at bottom (before `export default router;`):
```ts
router.route('/', exportRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- export.test.ts`
Expected: 1 PASS

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/modules/settings/export.ts apps/api/src/modules/settings/routes.ts apps/api/test/settings/export.test.ts
git commit -m "feat(compliance): GET /me/export returns user data dump"
```

---

### Task 3: POST /me/delete endpoint

**Files:**
- Create: `apps/api/src/modules/settings/delete.ts`
- Test: `apps/api/test/settings/delete.test.ts`

**Interfaces:**
- Consumes: `c.env.DB`, `c.get('ctx').userId`
- Produces: `POST /me/delete { confirm: 'DELETE' }` → 202 { ok, scheduledAt }

- [ ] **Step 1: Write failing test**

Create `apps/api/test/settings/delete.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { errorEnvelope } from '../../src/lib/errors';

const setup = vi.hoisted(() => {
  const path = require('node:path') as typeof import('node:path');
  const SRC = path.resolve(process.cwd(), 'src');
  return { SRC };
});

vi.mock(setup.SRC + '/env', () => ({
  env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' },
}));

const state = vi.hoisted(() => ({
  updated: null as any,
  audits: [] as any[],
}));

vi.mock('@vyro/db', () => ({
  getDb: () => ({
    update: () => ({
      set: (v: any) => ({
        where: () => ({
          run: async () => { state.updated = v; },
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => ({
        run: async () => { state.audits.push(v); },
      }),
    }),
  }),
}));

vi.mock(setup.SRC + '/middleware/session', () => ({
  session: () => async (c: any, n: any) => { c.set('ctx', { userId: 'u-1' }); await n(); },
}));

import deleteRouter from '../../src/modules/settings/delete';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const env = errorEnvelope(err); return c.json(env.body, env.status as any); });
  app.route('/api/settings', deleteRouter);
  return app;
}

const env = { DB: {} as any, WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } as any;

beforeEach(() => { state.updated = null; state.audits = []; });

describe('POST /api/settings/me/delete', () => {
  it('400 if confirm is missing', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/settings/me/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }), env);
    expect(res.status).toBe(400);
  });

  it('400 if confirm is wrong', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/settings/me/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'yes' }),
    }), env);
    expect(res.status).toBe(400);
  });

  it('schedules soft delete with audit row', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/settings/me/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    }), env);
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.scheduledAt).toBeGreaterThan(Date.now());
    expect(state.updated.status).toBe('pending_deletion');
    expect(state.updated.deletionScheduledFor).toBeGreaterThan(Date.now());
    expect(state.audits[0].action).toBe('account.delete.scheduled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- delete.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write delete route**

Create `apps/api/src/modules/settings/delete.ts`:

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import { getDb } from '@vyro/db';
import { users, auditLogs } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';

const body = z.object({ confirm: z.literal('DELETE') });

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.post('/me/delete', zValidator('json', body), async (c) => {
  const ctx = c.get('ctx') as { userId: string };
  const runAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const db = getDb(c.env.DB);
  await db.update(users)
    .set({ status: 'pending_deletion', deletionScheduledFor: runAt })
    .where(eq(users.id, ctx.userId))
    .run();
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    action: 'account.delete.scheduled',
    resourceType: 'user',
    resourceId: ctx.userId,
    actorUserId: ctx.userId,
    metadata: JSON.stringify({ runAt }),
    ip: null,
    userAgent: null,
    createdAt: Date.now(),
  }).run();
  // eslint-disable-next-line no-console
  console.log(`[auth] account delete scheduled for ${ctx.userId}, runAt=${new Date(runAt).toISOString()}`);
  return c.json({ ok: true, scheduledAt: runAt }, 202);
});

export default router;
```

- [ ] **Step 4: Mount in routes.ts**

Add import:
```ts
import deleteRouter from './delete';
```

Add mount (after export):
```ts
router.route('/', deleteRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- delete.test.ts`
Expected: 3 PASS

- [ ] **Step 6: Verify @hono/zod-validator is installed**

Run: `grep "@hono/zod-validator" apps/api/package.json`
Expected: present. If not: `pnpm --filter @vyro/api add @hono/zod-validator`

- [ ] **Step 7: Typecheck and commit**

```bash
pnpm typecheck
git add apps/api/src/modules/settings/delete.ts apps/api/src/modules/settings/routes.ts apps/api/test/settings/delete.test.ts pnpm-lock.yaml
git commit -m "feat(compliance): POST /me/delete schedules 30-day soft delete"
```

---

### Task 4: Cookie consent banner component

**Files:**
- Create: `apps/web/src/components/CookieConsentBanner.tsx`
- Test: `apps/web/test/components/CookieConsentBanner.test.tsx`

**Interfaces:**
- Consumes: `localStorage`
- Produces: `<CookieConsentBanner />` — renders banner if no key, writes choice and hides

- [ ] **Step 1: Write failing test**

Create `apps/web/test/components/CookieConsentBanner.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CookieConsentBanner } from '../../components/CookieConsentBanner';

describe('CookieConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders banner when no consent key set', () => {
    render(<CookieConsentBanner />);
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /essential only/i })).toBeTruthy();
  });

  it('hides banner when consent already set', () => {
    localStorage.setItem('vyro_consent', JSON.stringify({ essential: true, analytics: false, marketing: false, decidedAt: new Date().toISOString() }));
    render(<CookieConsentBanner />);
    expect(screen.queryByRole('button', { name: /accept all/i })).toBeNull();
  });

  it('writes consent on Accept all', () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));
    const stored = JSON.parse(localStorage.getItem('vyro_consent')!);
    expect(stored.essential).toBe(true);
    expect(stored.analytics).toBe(true);
    expect(stored.marketing).toBe(true);
    expect(stored.decidedAt).toBeDefined();
  });

  it('writes consent on Essential only', () => {
    render(<CookieConsentBanner />);
    fireEvent.click(screen.getByRole('button', { name: /essential only/i }));
    const stored = JSON.parse(localStorage.getItem('vyro_consent')!);
    expect(stored.analytics).toBe(false);
    expect(stored.marketing).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web test -- CookieConsentBanner.test.tsx 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write component**

Create `apps/web/src/components/CookieConsentBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button } from '@vyro/ui';

const KEY = 'vyro_consent';

interface Consent {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

export function CookieConsentBanner() {
  const [decided, setDecided] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem(KEY)) setDecided(false);
  }, []);

  if (decided) return null;

  const choose = (analytics: boolean, marketing: boolean) => {
    const value: Consent = {
      essential: true,
      analytics,
      marketing,
      decidedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(value));
    setDecided(true);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 bg-paper border border-ink/15 rounded-lg shadow-lg p-4 space-y-3"
    >
      <p className="text-sm text-ink">
        VYRO uses essential cookies to keep you signed in. We do not load analytics or marketing scripts in this version.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => choose(true, true)}>Accept all</Button>
        <Button variant="ghost" onClick={() => choose(false, false)}>Essential only</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/web test -- CookieConsentBanner.test.tsx 2>&1 | tail -10`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/CookieConsentBanner.tsx apps/web/test/components/CookieConsentBanner.test.tsx
git commit -m "feat(compliance): cookie consent banner (localStorage)"
```

---

### Task 5: Legal content + LegalPage

**Files:**
- Create: `apps/web/src/content/legal/terms.md`
- Create: `apps/web/src/content/legal/privacy.md`
- Create: `apps/web/src/content/legal/cookies.md`
- Create: `apps/web/src/pages/LegalPage.tsx`

**Interfaces:**
- Produces: `/legal/terms`, `/legal/privacy`, `/legal/cookies` routes render Markdown with draft banner

- [ ] **Step 1: Create terms.md**

Create `apps/web/src/content/legal/terms.md`:

```markdown
# VYRO Terms of Service

> Draft — pending lawyer review. Not legal advice.

Last updated: 2026-09-05

## 1. Acceptance

By creating a VYRO account you agree to these terms.

## 2. Eligibility

You must be 18+ and operating a Sri Lankan-registered business or authorized distributor.

## 3. Accounts

You are responsible for your login credentials and for activity under your account.

## 4. Orders and payment

VYRO records purchase orders between buyers and suppliers. No payment is processed by VYRO in v1.

## 5. Liability

VYRO provides platform software "as is". We are not liable for losses arising from orders between users.

## 6. Governing law

These terms are governed by the laws of Sri Lanka.

## 7. Contact

Email: legal@vyro.example
```

- [ ] **Step 2: Create privacy.md**

Create `apps/web/src/content/legal/privacy.md`:

```markdown
# VYRO Privacy Policy

> Draft — pending lawyer review. Not legal advice.

Last updated: 2026-09-05

## 1. Data we collect

- Account profile (name, email, phone)
- Business or supplier records (name, district, address)
- Order and payment history
- IP address (Cloudflare CDN)
- Browser fingerprint (session cookies only)

## 2. Why we collect it

- Provide the platform (matching, ordering)
- Prevent fraud and abuse
- Comply with legal obligations

## 3. Where it is stored

Cloudflare Workers and D1 database (Singapore region). Backed up per Cloudflare's SLA.

## 4. Who we share it with

No third parties in v1. We may disclose if required by Sri Lankan law.

## 5. Your rights (PDPA 2022)

- Access your data (Profile → Export)
- Correct inaccurate data (Profile → Edit)
- Request deletion (Profile → Delete account; 30-day grace)
- Opt out of marketing (Profile → Notifications)

## 6. Retention

Until account deletion + 30 days. Audit logs retained 7 years per accounting law.

## 7. Contact

Email: privacy@vyro.example
```

- [ ] **Step 3: Create cookies.md**

Create `apps/web/src/content/legal/cookies.md`:

```markdown
# VYRO Cookie Policy

> Draft — pending lawyer review. Not legal advice.

Last updated: 2026-09-05

## 1. Essential cookies

- `better-auth.session_token` — keeps you signed in
- `csrf_token` — prevents cross-site request forgery

These cannot be disabled while signed in.

## 2. Analytics

None loaded in v1.

## 3. Marketing

None loaded in v1.

## 4. Managing cookies

Browser settings, or our consent banner.
```

- [ ] **Step 4: Write LegalPage component**

Create `apps/web/src/pages/LegalPage.tsx`:

```tsx
import { Surface, PageHeader } from '@vyro/ui';
import termsMd from '../content/legal/terms.md?raw';
import privacyMd from '../content/legal/privacy.md?raw';
import cookiesMd from '../content/legal/cookies.md?raw';

type Kind = 'terms' | 'privacy' | 'cookies';

const DOCS: Record<Kind, string> = { terms: termsMd, privacy: privacyMd, cookies: cookiesMd };

const TITLES: Record<Kind, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
};

function renderMd(md: string): JSX.Element[] {
  const blocks = md.split(/\n\n+/);
  return blocks.map((block, i) => {
    if (block.startsWith('# ')) return <h1 key={i} className="text-2xl font-semibold mb-4">{block.slice(2)}</h1>;
    if (block.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-6 mb-2">{block.slice(3)}</h2>;
    if (block.startsWith('> ')) return <blockquote key={i} className="border-l-4 border-amber-400 bg-amber-50 text-amber-900 px-3 py-2 mb-3">{block.slice(2)}</blockquote>;
    if (block.startsWith('- ')) {
      const items = block.split('\n').map((l) => l.replace(/^- /, ''));
      return <ul key={i} className="list-disc pl-6 mb-3 space-y-1">{items.map((it, j) => <li key={j}>{it}</li>)}</ul>;
    }
    return <p key={i} className="mb-3 leading-relaxed">{block}</p>;
  });
}

export function LegalPage({ kind }: { kind: Kind }) {
  return (
    <Surface>
      <PageHeader title={TITLES[kind]} subtitle="VYRO" />
      <div className="bg-amber-100 border border-amber-300 text-amber-900 px-3 py-2 mb-4 rounded text-sm">
        Draft — pending lawyer review. Not legal advice.
      </div>
      <article className="max-w-2xl text-sm text-ink">
        {renderMd(DOCS[kind])}
      </article>
    </Surface>
  );
}
```

- [ ] **Step 5: Register routes in App.tsx**

Find `apps/web/src/App.tsx`. Add import near other page imports:
```tsx
import { LegalPage } from './pages/LegalPage';
```

Add routes inside the `<Routes>` block:
```tsx
<Route path="/legal/terms" element={<LegalPage kind="terms" />} />
<Route path="/legal/privacy" element={<LegalPage kind="privacy" />} />
<Route path="/legal/cookies" element={<LegalPage kind="cookies" />} />
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/content/legal/ apps/web/src/pages/LegalPage.tsx apps/web/src/App.tsx
git commit -m "feat(compliance): legal docs pages (terms/privacy/cookies)"
```

---

### Task 6: Footer links in Layout

**Files:**
- Modify: `apps/web/src/components/Layout.tsx`

**Interfaces:**
- Adds 3 anchor links to footer

- [ ] **Step 1: Find the footer in Layout.tsx**

The Layout component has a `<footer>` at line ~65 (per audit). Find both footer blocks.

- [ ] **Step 2: Add links to first footer (line ~65 area)**

Inside the `<footer className="border-t border-ink/10 py-6 bg-bone text-[11px] text-ink-4">` element, find the content and add Legal links before any existing copyright. Pattern:

```tsx
<footer className="border-t border-ink/10 py-6 bg-bone text-[11px] text-ink-4">
  <div className="max-w-6xl mx-auto px-4 flex flex-wrap gap-4 items-center justify-between">
    <div className="flex gap-4">
      <Link to="/legal/terms" className="hover:underline">Terms</Link>
      <Link to="/legal/privacy" className="hover:underline">Privacy</Link>
      <Link to="/legal/cookies" className="hover:underline">Cookies</Link>
    </div>
    <span>© {new Date().getFullYear()} VYRO</span>
  </div>
</footer>
```

Wrap the existing footer inner content with the flex container, keeping any existing children inside.

- [ ] **Step 3: Add same to admin/supplier footers if separate**

If `apps/web/src/components/Layout.tsx` has multiple footers (admin + supplier), add the same Legal links to each.

- [ ] **Step 4: Typecheck and commit**

```bash
pnpm typecheck
git add apps/web/src/components/Layout.tsx
git commit -m "feat(compliance): footer links to /legal/{terms,privacy,cookies}"
```

---

### Task 7: Mount CookieConsentBanner in Layout

**Files:**
- Modify: `apps/web/src/components/Layout.tsx`

- [ ] **Step 1: Add import**

At top of `Layout.tsx`:
```tsx
import { CookieConsentBanner } from './CookieConsentBanner';
```

- [ ] **Step 2: Render banner inside Layout return**

Just before the closing `</div>` of the outermost layout container (or as a sibling to the footer), add:
```tsx
<CookieConsentBanner />
```

- [ ] **Step 3: Typecheck and commit**

```bash
pnpm typecheck
git add apps/web/src/components/Layout.tsx
git commit -m "feat(compliance): mount cookie consent banner in layout"
```

---

### Task 8: ProfilePage — wire export + delete buttons

**Files:**
- Modify: `apps/web/src/pages/ProfilePage.tsx`

**Interfaces:**
- Two new sections: "Export your data" (button → triggers download) and "Delete account" (button → modal with text confirm)

- [ ] **Step 1: Read current ProfilePage**

Find the import block and existing JSX structure.

- [ ] **Step 2: Add import for ApiError and useToast**

If not already present:
```tsx
import { ApiError } from '../lib/api';
import { useToast } from '../components/Toast';
```

- [ ] **Step 3: Add export handler**

Inside the ProfilePage component:
```tsx
const toast = useToast();
const [exporting, setExporting] = useState(false);

async function handleExport() {
  setExporting(true);
  try {
    const res = await fetch('/api/settings/me/export', { credentials: 'include' });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vyro-data-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export downloaded');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Failed');
  } finally {
    setExporting(false);
  }
}
```

- [ ] **Step 4: Add delete handler**

```tsx
const [confirmText, setConfirmText] = useState('');
const [deleting, setDeleting] = useState(false);

async function handleDelete() {
  if (confirmText !== 'DELETE') return;
  setDeleting(true);
  try {
    const res = await fetch('/api/settings/me/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    if (!res.ok) throw new Error('Delete request failed');
    toast.success('Account scheduled for deletion in 30 days');
    setConfirmText('');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Failed');
  } finally {
    setDeleting(false);
  }
}
```

- [ ] **Step 5: Add JSX sections**

Below existing profile sections, add:

```tsx
<Section title="Your data">
  <p className="text-sm text-ink-3 mb-3">
    Download a JSON export of your profile, businesses, suppliers, orders, payments, and notifications.
  </p>
  <Button onClick={handleExport} disabled={exporting}>
    {exporting ? 'Exporting…' : 'Download my data'}
  </Button>
</Section>

<Section title="Delete account">
  <p className="text-sm text-ink-3 mb-3">
    Account deletion is scheduled for 30 days from confirmation. After 30 days your records are purged.
  </p>
  <Input
    placeholder='Type "DELETE" to confirm'
    value={confirmText}
    onChange={(e) => setConfirmText(e.target.value)}
  />
  <Button onClick={handleDelete} disabled={deleting || confirmText !== 'DELETE'} variant="destructive">
    {deleting ? 'Scheduling…' : 'Schedule deletion'}
  </Button>
</Section>
```

Use the existing Section helper if present, otherwise inline `<div>` with title styling.

- [ ] **Step 6: Typecheck and commit**

```bash
pnpm typecheck
git add apps/web/src/pages/ProfilePage.tsx
git commit -m "feat(compliance): profile page export + delete UI"
```

---

### Task 9: Notifications form — marketing opt-out

**Files:**
- Modify: `apps/web/src/pages/profile/NotificationsForm.tsx`

**Interfaces:**
- The existing `notifyMarketing` toggle already maps to `userNotificationsPatchSchema.notifyMarketing`. The server-side dispatcher checks `user.marketing_opt_in` field. The form UI just needs to keep its current toggle. No UI change required for B4 — verify existing toggle still works.

- [ ] **Step 1: Read NotificationsForm**

- [ ] **Step 2: Verify marketing toggle exists and posts to /me/notifications**

The existing `notifyMarketing` field is the user-facing toggle. The server PATCH for `marketingOptIn` (a separate column) is enforced at dispatcher-level only. Document this in a code comment:

```tsx
// notifyMarketing = email channel preference
// marketingOptIn (server) = PDPA opt-out flag enforced by notifications dispatcher
```

- [ ] **Step 3: No code change if already present**

If the existing toggle maps to `notifyMarketing` and there's no separate opt-out column toggle, this task is documentation-only. Commit a comment-only change.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/profile/NotificationsForm.tsx
git commit -m "docs(compliance): clarify marketing opt-out vs notifyMarketing in NotificationsForm"
```

---

### Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: clean

- [ ] **Step 2: Full test suite**

Run: `pnpm test`
Expected: all existing tests pass + 5 new tests (1 export, 3 delete, 4 banner, but banner counts separately)

- [ ] **Step 3: Manual smoke test**

In one terminal: `pnpm --filter @vyro/api dev`
In another: open `http://localhost:5173/legal/terms` — renders. `/legal/privacy` renders. `/legal/cookies` renders. Cookie banner appears.

Sign in. Visit `/profile`. Click "Download my data" — JSON downloads. Click "Schedule deletion" after typing DELETE — toast appears.

- [ ] **Step 4: Push branch and merge**

```bash
git push origin feat/b4-compliance
gh pr create --base main --head feat/b4-compliance \
  --title "feat(compliance): B4 PDPA compliance baseline" \
  --body "Implements docs/superpowers/specs/2026-09-05-vyro-compliance-design.md.

- Legal docs (terms/privacy/cookies) marked draft
- GET /me/export + POST /me/delete
- marketing_opt_in column + dispatcher enforcement
- Cookie consent banner"
```

Wait for CI green. Merge.