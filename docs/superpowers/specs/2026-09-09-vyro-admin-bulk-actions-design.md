# Admin Bulk Actions Framework — Design

> Status: approved. Date: 2026-09-09.

## Goal

Let admins apply one action (suspend / unsuspend / role-change) to many
entities (users, businesses) in a single request, with partial-success
handling, per-item audit, and a sticky bottom-bar UI on UsersPage and
BusinessesPage.

## Non-goals (v1)

- Products, categories, KYC, feature flags — different review flows; defer.
- Async QUEUE for >100-item batches — sync within cap is sufficient.
- Saved bulk-action presets per admin — localStorage later if requested.
- CSV import of ID lists — paste-list only for v1.

## Scope (v1)

Five actions, all on existing entities:

| Action              | Endpoint                                | Permission         |
|---------------------|-----------------------------------------|--------------------|
| Suspend users       | POST /api/admin/bulk/users/suspend       | user:suspend       |
| Unsuspend users     | POST /api/admin/bulk/users/unsuspend     | user:suspend       |
| Assign role to user | POST /api/admin/bulk/users/role         | admin:role_change  |
| Suspend businesses  | POST /api/admin/bulk/businesses/suspend  | user:suspend       |
| Unsuspend businesses| POST /api/admin/bulk/businesses/unsuspend| user:suspend       |

## Data model

### Migration `0023_admin_audit_batch.sql`

```sql
ALTER TABLE `admin_audit_logs` ADD `batch_id` text;
CREATE INDEX `admin_audit_logs_batch_idx`
  ON `admin_audit_logs` (`batch_id`);
```

`batch_id` is a ULID-style identifier shared by every audit row produced
by one bulk request, plus the batch summary row. Nullable: non-bulk
audit rows leave it NULL.

### Schema

`packages/db/src/schema/adminAuditLogs.ts`: add `batchId: text('batch_id')`
to the column list.

## API design

### Request

```ts
POST /api/admin/bulk/{entity}/{action}
Content-Type: application/json

{
  "ids": ["u_1", "u_2", ...],   // 1..100, deduped server-side
  // action-specific extras (e.g. role for users/role)
}
```

### Response

```ts
{
  "batchId": "01HZ...",          // ULID
  "total": 50,                   // after dedupe
  "succeeded": ["u_1", "u_2"],   // ids that completed
  "failed": [                    // per-item failures
    { "id": "u_3", "code": "NOT_FOUND", "message": "user not found" },
    { "id": "u_4", "code": "ALREADY_SUSPENDED", "message": "..." }
  ]
}
```

Status code: `200` even with partial failures (caller inspects `failed`).
Validation errors (cap, missing field) → `400 VALIDATION_ERROR`.

### Cap + dedupe

- Zod cap: 1..100 IDs.
- Server dedupes via `Set` before processing.
- Empty-after-dedupe still returns 200 with empty result + audits a
  zero-row summary.

### Per-item execution

- Sequential loop in a single Worker invocation (≤100 items ≈ < 5s).
- Each item wrapped in try/catch; failure captured into `failed[]` with
  the thrown `httpError` code+message (or `INTERNAL_ERROR` on unknown).
- One audit row per item attempt, success or failure:
  - success: `action = '<entity>.<action>'`, `metadata = { batchId }`
  - failure: `action = '<entity>.<action>.failed'`, `metadata = { batchId, code, message }`
- One summary audit row: `action = 'bulk.batch'`,
  `target = { type: 'batch', id: batchId }`,
  `metadata = { entity, action, total, succeeded, failed }`.

### Failure codes

| Code                  | When                                              |
|-----------------------|---------------------------------------------------|
| `NOT_FOUND`           | entity row missing                                |
| `ALREADY_<STATE>`     | target already in requested state (idempotent no-op, still audited) |
| `INTERNAL_ERROR`      | unexpected throw                                  |

`ALREADY_<STATE>` is recorded as success (idempotent semantics) but not
counted in `succeeded`. Final response keeps `total = uniqueIds.length`,
`succeeded = actuallyTransitioned.length`,
`failed = errored.length`.

## Module layout

```
apps/api/src/modules/admin/bulk/
├── schema.ts            # zod bodies
├── executor.ts          # bulkAction({ env, ctx, entity, action, ids, perItem })
├── routes.ts            # Hono sub-router, permission-gated
└── actions/
    ├── usersSuspend.ts
    ├── usersUnsuspend.ts
    ├── usersRole.ts
    ├── businessesSuspend.ts
    └── businessesUnsuspend.ts
```

`executor.bulkAction(...)`:

```ts
async function bulkAction(opts: {
  env: Env;
  ctx: AdminContext;           // role + userId
  entity: 'users' | 'businesses';
  action: 'suspend' | 'unsuspend' | 'role';
  ids: string[];
  perItem: (id: string) => Promise<'ok' | 'noop' | throw>;
  extras?: Record<string, unknown>;
}): Promise<BulkResult>
```

Returns `{ batchId, total, succeeded, failed }`.

## Web surface

### `useBulkAction` family

`apps/web/src/admin/useBulkAction.ts`:

```ts
useBulkUsersSuspend():     UseMutationResult<BulkResult, Error, {ids: string[]}>
useBulkUsersUnsuspend():   UseMutationResult<BulkResult, Error, {ids: string[]}>
useBulkUsersRole():        UseMutationResult<BulkResult, Error, {ids: string[], role: AdminRole}>
useBulkBusinessesSuspend()
useBulkBusinessesUnsuspend()
```

Each:
- POSTs JSON to `/api/admin/bulk/{path}`
- `onSuccess` invalidates the relevant list query keys:
  - users: `['admin', 'users']`
  - businesses: `['admin', 'businesses']`

### `BulkActionBar` component

`apps/web/src/admin/BulkActionBar.tsx`:

Props:
```ts
{
  count: number;
  onClear: () => void;
  actions: Array<{
    label: string;
    run: () => void;
    destructive?: boolean;
    disabled?: boolean;
  }>;
}
```

- Sticky to viewport bottom, full width, dark background, paper text.
- Layout: `N selected · [buttons] · ✕`
- Destructive buttons styled rose.

### `BulkConfirmDialog`

`apps/web/src/admin/BulkConfirmDialog.tsx`:

Props: `{ open, count, action, onCancel, onConfirm }`.

- Shows count + action verb + optional reason input (for suspend).
- "Confirm" calls `onConfirm`.

### `BulkResultDialog`

`apps/web/src/admin/BulkResultDialog.tsx`:

Props: `{ open, result, onClose, onRetryFailed }`.

- Green list of succeeded IDs (count only if >10).
- Red list of failed IDs + reason (expandable).
- "Retry failed" button enabled if `failed.length > 0`; calls `onRetryFailed(failed.map(f => f.id))`.

### Page wiring

`apps/web/src/admin/UsersPage.tsx`:
- Add checkbox column.
- Header `select-all-filtered` checkbox; shows count badge; disabled if
  result set > 100 with a tooltip "Bulk actions cap at 100 — refine filter".
- Selection state cleared on filter change.
- `BulkActionBar` mounted; actions:
  - `Suspend` (destructive) → `BulkConfirmDialog` → `useBulkUsersSuspend`
  - `Unsuspend` → `useBulkUsersUnsuspend`
  - `Assign role…` → opens dropdown + confirm → `useBulkUsersRole`

`apps/web/src/admin/BusinessesPage.tsx`:
- Same pattern, two actions: Suspend / Unsuspend.

## Permissions

No new permission keys. Reuses:
- `user:suspend` for users.suspend / users.unsuspend / businesses.* / businesses.unsuspend.
- `admin:role_change` for users.role.

A user with neither permission sees the page without the `BulkActionBar`.

## Tests

### API

- `apps/api/test/admin/bulk/executor.test.ts`
  - dedupes input ids
  - returns mixed result when one item throws
  - audits summary row + per-item rows
  - empty-after-dedupe returns empty result + summary
  - cap is enforced (101 → zod throws)

- `apps/api/test/admin/bulk/routes.test.ts`
  - 5 happy paths via Hono sub-router with mocked per-item functions
  - verifies request shape, response shape

- `apps/api/test/admin/bulk/rbac.test.ts`
  - each endpoint rejects (500 via onError) when permission missing
  - each endpoint accepts when permission present

### Web

- Extend `UsersPage.test.tsx` and `BusinessesPage.test.tsx` with:
  - row checkbox toggles selection
  - `BulkActionBar` renders when count > 0
  - clear button empties selection
  - select-all checkbox toggles all filtered (when ≤100)

## Smoke

```bash
pnpm --filter @vyro/api typecheck
pnpm --filter @vyro/web typecheck
pnpm --filter @vyro/api test admin/bulk
pnpm --filter @vyro/web test
pnpm --filter @vyro/api build
pnpm --filter @vyro/web build
```

## Runbook addition

Append to `docs/runbook.md`:

- Action → endpoint → permission table.
- Cap rationale: "100 IDs ≈ 5s sequential on Workers; >100 would risk
  CPU-time limit. Increase cap via `BULK_MAX_IDS` env if needed."
- Audit retrieval: `SELECT * FROM admin_audit_logs WHERE batch_id = ?`
  to see all per-item outcomes for one batch.

## Risks

- Worker CPU time: 100 sequential writes ≈ 3-5s on Workers. Acceptable.
  No mitigation beyond cap.
- Audit log growth: each bulk = up to 101 audit rows. Already
  capped at 365d retention by `handleAuditPurge`.
- Race: two admins suspending the same user concurrently → both
  succeed but second is `noop` (already suspended). Audit still records
  both attempts.

## Open follow-ups

- Bulk product visibility toggle (defer).
- Async QUEUE for >100 IDs (defer).
- Saved presets per admin (defer).
- CSV import (defer).
