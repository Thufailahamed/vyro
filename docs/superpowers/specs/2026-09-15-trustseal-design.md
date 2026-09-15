# TrustSEAL Paid Verification Badge — Design

Date: 2026-09-15
Status: Approved (brainstorming §§1–5)
Source gap: `2026-09-15-competitor-audit.md` §2.1 #11 TrustSEAL Verification + §5.3 Gold-style tier note; roadmap #2 supplier verification & trust badges.

## 1. Goal

Add a paid TrustSEAL badge on top of existing free KYC verification, matching IndiaMART TrustSEAL model: phone/email/address/GST/PAN already covered by KYC, plus annual paid subscription for gold badge + priority ranking + Member Since.

Non-goals (v1): tiers (Basic/Gold), RFQ quotas, ad credits, BuyLeads priority, third-party on-site inspection, buyer membership, refunds/proration.

User choices locked:
- Scope: paid badge on top of KYC (free verified stays)
- Payment: PayHere annual plan
- Perks: badge + ranking only
- Term: 12mo fixed price
- Approach: A — new table + PayHere reuse

## 2. Definition + rule (§1 approved)

`isTrustSealed(supplier, sub, now) = supplier.verificationStatus == 'verified' AND sub.status == 'active' AND sub.expiresAt > now`

- Fixed price: 2,500,000 cents (LKR 25,000/yr), 12mo = 365 days.
- Requires KYC verified first; checkout blocked otherwise (403 NEEDS_KYC).
- Suspended supplier (`status='suspended'` or `verificationStatus='suspended'`) hides badge even if sub active (derived check).
- Shared helper in `packages/shared/src/trustSeal.ts`: `isTrustSealed({verificationStatus, status}, sub, now) => boolean` + `memberSinceYear(startedAt)`.
- `memberSinceYear` = year of first activation `startedAt`. Renewals reuse same row and MUST NOT overwrite `startedAt`; only `expiresAt` extends (`expiresAt = max(existingExpiresAt, now) + 365d` on re-pay, `startedAt` preserved).

Alternatives rejected:
- B (columns on suppliers): no history, renewal audit lost.
- C (full memberships module): E3, violates YAGNI for badge+ranking v1.

## 3. Data + API (§2 approved)

New D1 table `trust_seal_subscriptions`:

```sql
CREATE TABLE trust_seal_subscriptions (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL UNIQUE REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending|active|expired|cancelled
  started_at INTEGER,
  expires_at INTEGER,
  payment_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX trust_seal_supplier_idx ON trust_seal_subscriptions(supplier_id);
```

New Drizzle schema `packages/db/src/schema/trustSeal.ts` + export in index.

New API module `apps/api/src/modules/trustSeal/`:
- `POST /api/suppliers/:id/trust-seal/checkout` — requireSupplierRole(owner), check KYC verified, upsert pending sub, call `PayHereGateway.startCheckout({amountCents: 2500000, ...})` return `{redirectUrl, subscriptionId}`. Idempotent if pending exists and not expired checkout.
- `GET /api/suppliers/:id/trust-seal/status` — `{active, expiresAt, memberSinceYear, status}` for supplier portal + public subset.
- PayHere webhook extension in `payments/` webhook handler: on `payment.success` where `gatewayRef` (PayHere `order_id`) equals sub `payment_id` → first activation sets `status='active', startedAt=now, expiresAt=now+365d`; renewal keeps original `startedAt` and sets `expiresAt=max(existingExpiresAt,now)+365d`. Sig mismatch → reject, no state change.
- Admin: `GET /api/admin/trust-seal` list + `POST /api/admin/trust-seal/:id/revoke` (status=cancelled).
- Enrichment: `storefront by-slug`, `PDP /api/products/:id/offers`, `search` results include `trustSealed: boolean`, `trustSealExpiresAt: number|null`, `memberSinceYear: number|null`. Batched lookup by supplierIds to avoid N+1. Missing sub → inactive, never throw.
- Retroactive by construction: derived check, no backfill.

Cron `apps/api/src/cron/trustSeal.ts` nightly:
- Mark `active` with `expiresAt <= now` → `expired`.
- Enqueue renewal reminders at 30d/7d via NOTIFICATIONS_QUEUE.

## 4. UI surfaces (§3 approved)

New `TrustSealBadge` in `apps/web/src/components/TrustSealBadge.tsx`:
- Gold style (amber-500/15 bg, ShieldCheck icon), label `TRUSTSEAL · Since YYYY`, title `TrustSEAL verified · expires {date}`, `aria-label="TrustSEAL verified supplier"`.
- Renders nothing when inactive.

Placements:
1. Storefront hero (`SupplierStorefrontPage`) next to verified badge + stars.
2. PDP offer rows (`ProductDetailPage.tsx`) next to supplier name.
3. Search results supplier line.
4. Supplier `VerificationPage.tsx` upsell card: if KYC approved + no active sub → Pay button → checkout redirect; if pending → pending state; if active → expiry + renew button; if KYC not approved → disabled hint "Verify KYC first".

Buyer sees badge only; no payment internals exposed.

## 5. Ranking + expiry (§4 approved)

Extend `apps/api/src/modules/searchRanking/score.ts`:
- New input `trustSealed: boolean`, weight +0.15, reason `'TrustSEAL'`.
- Order: TrustSEAL verified > free verified > unverified, tie-break price asc.
- Expired/cancelled/suspended loses boost immediately.

## 6. Error handling, privacy, testing (§5 approved)

- KYC not verified → 403 NEEDS_KYC on checkout.
- Double-pay idempotent via paymentId unique; second success webhook no-ops if already active with same paymentId.
- Webhook sig mismatch → 400, no activation.
- Missing/deleted supplier or sub → inactive, no crash.
- Rejected/suspended KYC → badge disappears on next fetch (derived).
- Privacy: public only `trustSealed`, `memberSinceYear`, expiry date in tooltip. Never expose paymentId, amount, PayHere raw.
- Tests:
  - `shared isTrustSealed` unit: active/future vs expired vs pending vs KYC-unverified vs suspended.
  - `trustSeal checkout gate`: blocks unverified, allows verified, idempotent pending.
  - `webhook activate`: success activates 365d, mismatch rejects, duplicate idempotent.
  - `score boost`: TrustSEAL outranks free verified, reason present.
  - Web `TrustSealBadge` render: gold with year when active, hidden when inactive.
- Manual QA: verify supplier → pay via sandbox → badge on storefront/PDP/search + rank uplift; expire via cron → badge clears; revoke via admin → clears.

## 7. Files touched (expected)

- `packages/db/migrations/0037_trust_seal.sql` (new), `packages/db/src/schema/trustSeal.ts`, `index.ts`.
- `packages/shared/src/trustSeal.ts` — `isTrustSealed`, constants `TRUST_SEAL_PRICE_CENTS=2500000`, `TRUST_SEAL_TERM_DAYS=365`.
- `packages/validation/src/trustSeal.ts` — checkout/status zod schemas.
- `apps/api/src/modules/trustSeal/{service,repository,routes}.ts`, webhook branch, `cron/trustSeal.ts`, `searchRanking/score.ts`, `storefront/routes.ts`, `products/routes.ts`, `search/` enrichment.
- `apps/web/src/components/TrustSealBadge.tsx` (new), `SupplierStorefrontPage`, `ProductDetailPage`, search results, `supplier/VerificationPage.tsx`, admin trust-seal page.
- Tests under `apps/api/test/trustSeal/`, `apps/web/test/trustSealBadge.test.tsx`.

## 8. Rollout

No flag (additive). No backfill (derived). Sandbox PayHere verify first. Docs: update roadmap #2 note + runbook cron line.
