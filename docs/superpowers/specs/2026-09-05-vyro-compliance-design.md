# VYRO Compliance (Sub-project B4)

**Date:** 2026-09-05
**Status:** Approved design, pending implementation
**Parent:** `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` §10 deferred tracks
**Scope:** Sri Lanka Personal Data Protection Act 2022 (PDPA) compliance baseline. Static legal docs (terms, privacy, cookies), functional data subject rights (data export, account deletion, marketing opt-out), cookie consent UI.

## 1. Background

VYRO targets Sri Lankan B2B operators (25 districts per MarketingPages.tsx). Sri Lanka enacted the Personal Data Protection Act No. 9 of 2022. PDPA grants data subjects the right to access, correct, and erase personal data, and to opt out of direct marketing.

Current state (audited):
- No `/legal/*` pages exist.
- No consent UI exists.
- No data export or deletion endpoints.
- `apps/web/src/pages/MarketingPages.tsx` mentions Sri Lanka operations but no compliance copy.
- `packages/auth` (better-auth) provides session + email + 2FA but no compliance surface.
- Footer links absent in all 3 portals.

## 2. Goals

- Surface legal docs (terms, privacy, cookies) as public routes, footer-linked from all 3 portals.
- Implement data export endpoint accessible to authenticated users.
- Implement 30-day soft-delete scheduling with reversal window.
- Add marketing opt-out flag respected by notifications dispatcher.
- Cookie consent banner that blocks non-essential scripts (none yet, but plumbing ready).
- Mark all legal text as "Draft — pending lawyer review" so v1 ships are not held hostage to legal turnaround.

## 3. Non-goals

- Hiring a lawyer / commissioning real legal text.
- DPO contact form, breach notification workflow, or DPIA documentation.
- GDPR-only features (right to data portability portability format spec, automated cross-border transfer assessment).
- Actual automated purge job (we soft-delete + schedule; purge tool is admin-driven).
- Cookie scanner / preference center beyond binary "essential only" vs "accept all".

## 4. Architecture

### 4.1 Static docs

Markdown files in `apps/web/src/content/legal/*.md` are loaded at build time via Vite's `?raw` import. Rendered by a single `<LegalPage>` component that:
- Splits on `## ` headings into sections.
- Renders paragraphs as `<p>`, lists as `<ul>/<ol>`.
- Injects a yellow "Draft — pending lawyer review" banner at top.
- Renders within `Surface` chrome matching other pages.

Footer component (added to `Shell`) renders 3 links: Terms, Privacy, Cookies.

### 4.2 Functional rights

Three endpoints under `/api/settings/me` (existing settings router):

```
GET  /api/settings/me/export        → JSON dump
POST /api/settings/me/delete        → schedule soft delete
PATCH /api/settings/me/notifications → toggle marketingOptIn
```

All require `session()`. None require `requireRole` (self-service).

### 4.3 Consent UI

localStorage-backed banner. No backend. Banner checks `vyro_consent` key on mount. If missing, renders. After user choice, writes key and hides.

Schema:
```ts
type Consent = {
  essential: true;       // always true
  analytics: boolean;    // false in v1 (no analytics loaded)
  marketing: boolean;    // false in v1 (no marketing scripts)
  decidedAt: string;     // ISO timestamp
};
```

## 5. Components

### 5.1 `apps/web/src/content/legal/terms.md`

Placeholder content covering: acceptance, account responsibilities, payment (no real gateway yet), liability limitation, governing law (Sri Lanka), contact email, draft notice.

### 5.2 `apps/web/src/content/legal/privacy.md`

Placeholder content covering: data collected (profile, business info, order history, device IP, CF-Connecting-IP), purpose (service delivery, fraud prevention), retention (until account deletion + 30d grace), third parties (Cloudflare for hosting, no other processors in v1), data subject rights (access, correct, erase), contact.

### 5.3 `apps/web/src/content/legal/cookies.md`

Placeholder content covering: essential cookies (session token, CSRF token), analytics (none in v1), marketing (none in v1), how to manage via browser settings + our consent banner.

### 5.4 `apps/web/src/pages/LegalPage.tsx`

```ts
import termsMd from '../content/legal/terms.md?raw';
import privacyMd from '../content/legal/privacy.md?raw';
import cookiesMd from '../content/legal/cookies.md?raw';

const DOCS = { terms: termsMd, privacy: privacyMd, cookies: cookiesMd };

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' | 'cookies' }) {
  return (
    <Surface>
      <div className="bg-amber-100 border border-amber-300 text-amber-900 p-3 mb-4 rounded">
        Draft — pending lawyer review. Not legal advice.
      </div>
      <article className="prose">{render(DOCS[kind])}</article>
    </Surface>
  );
}
```

### 5.5 `apps/web/src/components/CookieConsentBanner.tsx`

```ts
const KEY = 'vyro_consent';

export function CookieConsentBanner() {
  const [decided, setDecided] = useState<boolean>(true); // start true to avoid SSR flash
  useEffect(() => {
    if (!localStorage.getItem(KEY)) setDecided(false);
  }, []);
  if (decided) return null;
  const choose = (analytics: boolean, marketing: boolean) => {
    localStorage.setItem(KEY, JSON.stringify({ essential: true, analytics, marketing, decidedAt: new Date().toISOString() }));
    setDecided(true);
  };
  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:max-w-md ...">
      <p>VYRO uses essential cookies. We don't load analytics or marketing scripts in v1.</p>
      <Button onClick={() => choose(true, true)}>Accept all</Button>
      <Button onClick={() => choose(false, false)} variant="ghost">Essential only</Button>
    </div>
  );
}
```

### 5.6 `apps/api/src/modules/settings/export.ts`

```ts
router.get('/export', session(), async (c) => {
  const ctx = c.get('ctx');
  const userId = ctx.userId;
  const db = getDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  const businesses = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).all();
  const suppliers = await db.select().from(suppliersTable).where(eq(suppliersTable.userId, userId)).all();
  const orders = await db.select().from(purchaseOrders).where(or(eq(purchaseOrders.businessId, ...), eq(purchaseOrders.supplierId, ...))).all();
  const payments = await db.select().from(payments).where(...).all();
  const notifications = await db.select().from(notifications).where(eq(notifications.userId, userId)).all();
  return c.json({
    user, businesses, suppliers, orders, payments, notifications,
    exportedAt: new Date().toISOString(),
  });
});
```

### 5.7 `apps/api/src/modules/settings/delete.ts`

```ts
const body = z.object({ confirm: z.literal('DELETE') });

router.post('/delete', session(), zValidator('json', body), async (c) => {
  const ctx = c.get('ctx');
  const runAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await db.update(users).set({ status: 'pending_deletion', deletionScheduledFor: runAt }).where(eq(users.id, ctx.userId)).run();
  await db.insert(auditLogs).values({ action: 'account.delete.scheduled', actorUserId: ctx.userId, metadata: JSON.stringify({ runAt }) }).run();
  // dev: log; prod: email
  console.log(`[auth] account delete scheduled for user ${ctx.userId}, runAt=${new Date(runAt).toISOString()}`);
  return c.json({ ok: true, scheduledAt: runAt }, 202);
});
```

### 5.8 `apps/api/src/modules/settings/notifications.ts`

Existing route extended. Add `marketingOptIn: z.boolean()` to PATCH schema. Notifications dispatcher checks flag before queuing `category='marketing'` notifications.

### 5.9 `packages/db/migrations/NNNN-add-marketing-optin.ts`

```sql
ALTER TABLE users ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 1;
```

Numbered and committed same task as the code that uses it.

## 6. Data flow

### 6.1 Data export

```
GET /api/settings/me/export (with session cookie)
  → session() loads ctx
  → repository: load user, businesses, suppliers, orders, payments, notifications
  → return JSON
```

### 6.2 Delete

```
POST /api/settings/me/delete { confirm: 'DELETE' }
  → session() → ctx
  → users.status = 'pending_deletion', deletionScheduledFor = now + 30d
  → audit row
  → 202 { scheduledAt }
```

User can re-login during grace period. To cancel: admin tool (out of scope) flips status back. v1 ships without admin reversal UI; document.

### 6.3 Marketing opt-out

```
PATCH /api/settings/me/notifications { marketingOptIn: false }
  → session() → users.marketing_opt_in = 0

[later] dispatcher.send(notification)
  → if category === 'marketing' && !user.marketing_opt_in → skip
```

## 7. Error handling

- Export returns 401 without session (existing middleware).
- Delete returns 400 if `confirm` ≠ `'DELETE'`.
- Notifications PATCH returns 400 on invalid body.
- All errors follow existing `errorEnvelope` shape.

## 8. Testing

- **API**: unit tests for export shape, delete schedule + audit, notifications PATCH.
- **DB migration**: apply on local D1, verify column added.
- **Web**: component test for CookieConsentBanner (banner shows when key absent, hides when set, writes correct JSON).
- **Web**: page test for LegalPage (renders Markdown, shows draft banner).
- **E2E**: extend `scripts/e2e.md` with cookie banner, footer links, export, delete, opt-out toggles.

## 9. Phases

Single branch `feat/b4-compliance`. Sub-tasks:

1. DB migration: add `marketing_opt_in` to users
2. API: extend notifications settings (PATCH marketingOptIn)
3. API: export endpoint
4. API: delete endpoint
5. Web: legal content files (3 Markdown)
6. Web: LegalPage component
7. Web: footer links in all 3 portals
8. Web: CookieConsentBanner component
9. Web: ProfilePage — export button, delete section, opt-out toggle wiring
10. Web: route registration for /legal/*
11. E2E doc extension
12. Final: typecheck + tests + e2e green

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Lawyer review takes weeks and blocks release | Mark all docs as "Draft — pending lawyer review" so v1 ships explicitly as placeholder. |
| Soft delete with no purge = indefinite retention | Document limitation. Add admin tool follow-up in backlog. |
| Marketing opt-out only blocks v1 categories | Add audit log + comment that this is v1-only; expand categories list as dispatcher grows. |
| Cookie consent banner blocks legitimate UX | Banner is minimal, dismissable, doesn't block scroll. |
| Export endpoint leaks data across tenants | All queries filter by `userId` or by entities owned by userId. Test with cross-user fixtures. |

## 11. Acceptance criteria

1. Footer in all 3 portals links to /legal/terms, /legal/privacy, /legal/cookies.
2. Each legal page renders with draft banner.
3. `GET /api/settings/me/export` returns valid JSON for authenticated user with own data only.
4. `POST /api/settings/me/delete { confirm: 'DELETE' }` schedules + audit row.
5. `PATCH /api/settings/me/notifications { marketingOptIn: false }` persists.
6. Cookie banner renders on first visit, hides after choice, localStorage updated.
7. Migration applies cleanly.
8. All existing tests pass — backwards compatible.

## 12. Out of scope (deferred)

- Real legal text (lawyer).
- Automated purge job (admin tool only in v1).
- DPO contact / breach flow.
- Cookie preference center beyond binary choice.
- Cross-border transfer assessment (Sri Lanka → EU etc).
- DPIA documentation.