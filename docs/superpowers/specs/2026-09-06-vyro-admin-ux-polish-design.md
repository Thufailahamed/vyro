# T8 Admin UX Polish Design

**Goal:** Cross-role UX polish — global search, audit export scheduling, saved views, keyboard shortcuts.

**Architecture:** All features live in the admin SPA. Global search aggregates via a single `/api/admin/search` endpoint that joins a small set of tables; saved views stored in localStorage (per-user, per-page); audit export scheduled via Cloudflare cron (stub); keyboard shortcuts wired via a top-level keymap listener.

**Tech Stack:** React 19, react-query, zod, vitest.

## Global Constraints

- All features respect existing role permissions (no privilege escalation).
- Saved views = localStorage; first version ships without backend.
- Keyboard shortcuts opt-in; `?` opens a help overlay listing shortcuts.
- Cross-role = super_admin sees everything; other roles see whatever they already have permission to access.

---

## Section 1: Global search

### Problem

Admins scroll long lists to find an entity. Need one search box that returns mixed results across users, suppliers, businesses, products, orders/refunds, abuse reports.

### Design

**UI:** Search input in admin shell top bar (right side, next to sign-out). Press `Cmd/Ctrl+K` or `/` to focus. Type → debounced 200ms → dropdown of grouped results.

**Backend:** `GET /api/admin/search?q=<term>&limit=8` returns:
```json
{
  "users": [{ "id": "u-1", "email": "x@y.z", "role": "user" }],
  "suppliers": [{ "id": "s-1", "name": "Acme", "slug": "acme" }],
  "businesses": [{ "id": "b-1", "name": "Foo Inc", "slug": "foo" }],
  "products": [{ "id": "p-1", "title": "Widget", "sku": "W-100" }],
  "orders": [{ "id": "o-1", "poNumber": "PO-2026-001" }],
  "abuseReports": [{ "id": "r-1", "reason": "spam" }]
}
```

Empty groups omitted. Max 8 per group. Returns 200 even with zero matches (results: all empty arrays).

**Permissions:** super_admin sees all groups. Other roles see only groups they have at least one read permission for. Non-permitted groups omitted.

| Role | Visible groups |
| --- | --- |
| super_admin | all |
| ops | users, suppliers, businesses, products, abuseReports |
| finance | users, suppliers, businesses, orders (refunds/payouts as orders) |
| support | users, suppliers, businesses, products, orders, abuseReports |

**SQL:** simple `LIKE '%q%'` on indexed text columns (email, name, slug, title, sku, po_number, reason). Limit per group.

### Edge cases

- Empty `q` → 400 VALIDATION_ERROR.
- `q` shorter than 2 chars → empty results (skip query).
- Special chars: use parameterized query — no SQL injection risk.

---

## Section 2: Audit export scheduling

### Problem

Audit page exports ad-hoc CSV. Admins want recurring exports emailed to them.

### Design

**UI:** Audit page gets a "Schedule export" button. Opens modal: frequency (`daily|weekly|monthly`), email target, format (`csv|json`).

**Backend:** `POST /api/admin/audit/exports/schedule` with `{frequency, email, format}`. Returns `{id, nextRunAt}`. List via `GET /api/admin/audit/exports`. Cancel via `DELETE /api/admin/audit/exports/:id`.

**Storage:** new table `audit_export_schedules` (id, requestedBy, frequency, email, format, nextRunAt, active, createdAt). New schema migration 0014.

**Delivery:** First version schedules but does not deliver. Cron job `audit-export-runner` (added to cronRegistry) is a stub. UI shows "scheduled" status; delivery is future work.

**Permissions:** `audit:export` only (super_admin).

---

## Section 3: Saved views

### Problem

Admins want to bookmark filtered lists (e.g., "Open refunds > 7 days old", "Pending KYC").

### Design

**UI:** Each list page (refunds, payouts, abuse reports, KYC, sessions, chargebacks) gets a "Save current view" button in the header. Click → name input → save. Saved views show as chips above the table; click chip to apply filters; X to delete.

**Storage:** localStorage keyed by `vyro.admin.savedViews.<page>` where `<page>` is `refunds|payouts|abuse|kyc|sessions|chargebacks`. Each entry: `{id, name, filters: Record<string, unknown>, createdAt}`.

**Permissions:** Read-only feature flag; user-only. No cross-user sync in v1.

**Scope:** Per-page filter schema is whatever the page already exposes (status, date range, etc.). Saved views only persist filter values, not sort/pagination.

---

## Section 4: Keyboard shortcuts

### List

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl+K` or `/` | Focus global search |
| `g` then `o` | Go to Overview |
| `g` then `u` | Go to Users |
| `g` then `a` | Go to Audit |
| `?` | Open shortcuts overlay |
| `Esc` | Close any modal/overlay |

### Design

- Listener mounted once at `AdminShell` root.
- Two-key chords (`g o`) have a 1.5s timeout.
- Overlay is a Surface with the shortcut table; close on `?` or `Esc`.
- Disabled when focus is in `<input>`, `<textarea>`, or contenteditable.

---

## Section 5: Out of scope

- Audit export email delivery (stub cron).
- Cross-user saved views sync.
- Bulk actions across saved view results.
- Search result keyboard navigation (v1: mouse only).

---

## Section 6: Testing

- Vitest unit tests for:
  - `useGlobalSearch` hook: query key, debounce, group filtering by role.
  - `savedViews` lib: CRUD against localStorage.
  - Shortcut handler: chord matching, ignore-when-typing.
- API integration test: `/api/admin/search` with `q=foo` returns expected groups; finance role sees only orders + users; empty `q` returns 400.
