# Seller KYC (Per-Supplier KYB) — Design

**Date:** 2026-09-10
**Status:** Approved (architecture §1, components §2, dataflow/errors/testing §3)
**Choices:** Per-supplier KYB, soft-warning gating, simple fields.

## 1. Audit finding

Admin KYC approval IS done: `kyc_reviews` table, `GET /api/admin/kyc`, `GET /:id`,
`POST /` (admin-only), `POST /:id/decision`, `GET /:id/documents`, TrustSafety KYC tab,
audit (`kyc.create/approved/rejected/needs_more_info`), notifications, observability `pendingKyc`.

NOT done (this spec): seller submission, user↔supplier link, seller UI, gating UX, resubmit.

## 2. Architecture

Seller `POST /api/kyc/submit {supplierId, registrationNo, taxId, bankName, bankAccountNo,
bankBranch, accountHolder, documentsJson?}` → upserts `supplier_settings` + creates/updates
`kyc_reviews {userId, status: pending}`. Admin decide syncs linked supplier to
`verified`/`rejected`/`pending`. `GET /api/kyc/my` returns `{kyc, supplier}` for banner +
verification page. Soft-warning only — no product/order blocking.

## 3. Components

Backend `apps/api/src/modules/kyc/`: `validation.ts` (Zod), `repository.ts`
(find-my-KYC + supplier link), `routes.ts` (`GET /my`, `POST /submit`, session-only).
Patch `trustSafety/kycService.decide` → also `setSupplierVerification`.
Patch `suppliers/service.onboard` → auto-create `kyc_reviews` pending row.

Frontend: `apps/web/src/supplier/VerificationPage.tsx` (form + status timeline + resubmit),
`SupplierShell` banner (amber pending, red rejected), route `/supplier/verification` in `App.tsx`.
Reuses `supplier_settings` fields. Admin UI untouched.

## 4. Data flow

Onboard → `suppliers(pending)` + `kyc_reviews(pending)`. Seller submits →
`supplier_settings` mirror + `kyc_reviews(pending)` + notify support.
Admin approves → `kyc.approved` + `supplier.verified` + notify seller to `/supplier/verification`.
Rejected/needs_more_info → seller sees reason + resubmit (allowed only from those states, else 409).

## 5. Error handling

401 no session, 403 not supplier member, 404 unknown supplier, 409 resubmit while
pending/approved, 400 Zod validation. All decisions audited.

## 6. Testing

Vitest `apps/api/test/kyc-seller.test.ts` (submit, my, resubmit rules, decide-syncs-supplier).
E2E `scripts/e2e.md` §7e.4 seller flow. Existing `kyc.test.ts` stays green + typecheck.

## 7. Out of scope

R2 mandatory doc uploads (phase 2), hard-blocking unverified sellers, buyer KYC, migration
adding `supplierId` to `kyc_reviews` (use userId→supplier-members lookup instead).
