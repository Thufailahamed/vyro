# VYRO Admin Money/Orders — T3 Design

**Date:** 2026-09-06
**Status:** Approved
**Parent:** `2026-09-06-vyro-admin-core-ops-design.md` (T1)
**Predecessor:** T2 catalog moderation
**Phase:** 3 of 8 in enterprise admin roadmap

## Goal

Give the `finance` admin role a complete money surface: refund approval queue, payout batch approval, ledger reconciliation, invoice overrides, and chargeback handling. All writes audit-logged and permission-gated.

## Scope

### Gate existing endpoints (no new schema)

| Existing endpoint | Add gate |
|---|---|
| `POST /api/payments/:id/refund` | `payment:refund` (was session-only) |
| `GET /api/payments/:id/refunds` | `payment:read` |
| `GET /api/admin/payouts/*` | `payout:read` |
| `POST /api/admin/payouts/:id/approve` | `payout:approve` |

### New API endpoints

| Method | Path | Perm | Purpose |
|---|---|---|---|
| GET | `/api/admin/refunds/queue` | `payment:read` | Pending refunds (status=pending) list. |
| POST | `/api/admin/refunds/:id/approve` | `payment:refund` | Approve + execute refund. |
| POST | `/api/admin/refunds/:id/reject` | `payment:refund` | Reject with reason. |
| GET | `/api/admin/payouts/queue` | `payout:read` | Pending payout batches. |
| POST | `/api/admin/payouts/batch` | `payout:approve` | Create batch from supplier balances. |
| POST | `/api/admin/payouts/:batchId/approve` | `payout:approve` | Approve batch. |
| GET | `/api/admin/ledger/summary` | `ledger:read` | Net debits/credits across ledger. |
| GET | `/api/admin/invoices/:id/override` | `invoice:read` | Read invoice for finance overrides. |
| POST | `/api/admin/invoices/:id/override` | `invoice:read` | Write finance override note (metadata). |
| GET | `/api/admin/chargebacks` | `payment:read` | List flagged transactions. |
| POST | `/api/admin/chargebacks/:id/resolve` | `payment:refund` | Mark resolved + write refund if needed. |

All mutations call `auditAdmin({...})` with action strings: `refund.approve`, `refund.reject`, `payout.batch.create`, `payout.approve`, `invoice.override`, `chargeback.resolve`.

### Schema migration (`0010_admin_money.sql`)

```sql
ALTER TABLE `payouts` ADD `batch_id` text;--> statement-breakpoint
CREATE INDEX `payouts_batch_idx` ON `payouts` (`batch_id`) WHERE `batch_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `payout_batches` (
  `id` text PRIMARY KEY NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `approved_by` text REFERENCES `users`(`id`),
  `status` text NOT NULL DEFAULT 'pending',
  `total_cents` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `approved_at` integer
);--> statement-breakpoint
CREATE TABLE `chargebacks` (
  `id` text PRIMARY KEY NOT NULL,
  `payment_id` text NOT NULL REFERENCES `payments`(`id`),
  `reason` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `resolved_by` text REFERENCES `users`(`id`),
  `resolved_at` integer,
  `refund_id` text REFERENCES `refunds`(`id`),
  `created_at` integer NOT NULL
);
```

### Web layer

Files:
- Create: `apps/web/src/admin/MoneyPage.tsx` — tabs: Refunds queue / Payouts / Ledger / Invoices / Chargebacks
- Create: `apps/web/src/admin/{RefundQueue,PayoutsQueue,LedgerSummary,InvoiceOverrides,ChargebacksList}.tsx`
- Modify: `apps/web/src/admin/Shell.tsx` — Money NavLink gated on any of `payment:read|payout:read|ledger:read|invoice:read`
- Modify: `apps/web/src/App.tsx` — `/admin/money` route

## Data flow

- Refund queue: paginated list of `refunds WHERE status='pending'`. Approve → status='completed', refund executed. Reject → status='rejected'.
- Payouts: queue shows pending batches. Approve → status='approved', sets `approved_by`/`approved_at`.
- Ledger summary: aggregate debits + credits over time window.
- Invoice overrides: read invoice metadata + write admin note (stored in `metadata` JSON).
- Chargebacks: list open + resolve.

## Error handling

- 400 validation
- 403 missing permission
- 404 not found
- 409 `REFUND_NOT_PENDING`, `PAYOUT_NOT_PENDING`, `BATCH_ALREADY_APPROVED`, `CHARGEBACK_RESOLVED`

## Testing

- `apps/api/test/admin/refunds.test.ts` — queue + approve + reject + audit
- `apps/api/test/admin/payouts.test.ts` — batch create + approve + audit
- `apps/api/test/admin/ledger.test.ts` — summary aggregation
- `apps/api/test/admin/chargebacks.test.ts` — list + resolve
- `apps/web/src/admin/MoneyPage.test.ts` — tab switching

Final: `pnpm test`, `pnpm typecheck`, `pnpm audit:rbac`, `pnpm --filter @vyro/web build`.

## Out of scope (later phases)

- Real bank rails integration (mock for now)
- Multi-currency conversion
- Tax/VAT handling

## Constraints

- Only finance role grants from existing matrix
- All writes audit-logged
- Soft state changes (refund → status update, not delete)
- Backward compatible: existing endpoints still work for callers without perm
