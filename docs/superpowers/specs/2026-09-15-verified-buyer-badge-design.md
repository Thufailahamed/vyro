# Verified Buyer Badge — Design

Date: 2026-09-15
Status: Approved (brainstorming §§1–4)
Source gap: `2026-09-15-competitor-audit.md` §5.2 — "Verified buyer badge | IndiaMART | Value 5 | E1 | signal to suppliers on incoming leads."

## 1. Goal

Give suppliers a trustworthy "Verified buyer" signal on incoming RFQ leads, reusing Vyro's existing buyer KYC (`businesses.kycLevel`, `kycVerifiedAt`, `kycVerifiedBy`) instead of building a parallel verification system. IndiaMART parity: vetted buyer mark on leads received by sellers.

Non-goals (v1): verification expiry, auto-verify, tiered perks, BuyLeads digest marking, orders/reviews/storefront surfaces.

## 2. Definition + rule (§1 approved)

`isVerifiedBuyer(biz) = biz.kycLevel != 'none' AND biz.kycVerifiedAt IS NOT NULL`

- Level label surfaces as `basic` / `enhanced` where available.
- No expiry in v1; reject (`kycLevel='none'`) resets to unverified.
- Suppliers see a read-only badge; buyers see their own status on `BuyerKycPage` + checkout hint.
- Shared helper lives in `packages/shared/` so API + web share the exact rule:
  `isVerifiedBuyer({ kycLevel, kycVerifiedAt }) => boolean`.

## 3. Data + API (§2 approved)

No D1 migration. Single source of truth stays `businesses`.

- Extend `leadRowSchema` in `packages/validation/src/rfqCrm.ts` with:
  `buyerBusinessId: string`, `buyerName: string`, `buyerKycLevel: 'none'|'basic'|'enhanced'`,
  `buyerVerifiedAt: number|null`, derived `buyerVerified: boolean`.
- `apps/api/src/modules/rfqs/crmRepository.ts`:
  `listLeadsForSupplier` + `getLeadForSupplier` join `rfq_suppliers → rfqs → businesses`
  (batched business lookup to avoid N+1; `rfqs.businessId` is already indexed).
  Missing business → `buyerVerified:false`, never throw.
- Same enrichment for supplier RFQ inbox path (`rfqs/service.ts` listInvites) and
  quote-detail `CrmLeadCard` path (reuse `crmGet`).
- Retroactive by construction: an RFQ published before verification shows the badge
  on next fetch once the buyer verifies (benefit of derived over cached flag).

Alternatives rejected:
- B (cached flag on `rfqs`/`rfq_suppliers`): faster reads but stale + migration + backfill.
- C (new `buyer_verifications` table, tiers/expiry): E3, overkill for trust-signal v1.

## 4. UI surfaces (§3 approved)

New `VerifiedBuyerBadge` in `apps/web/src/supplier/crm/`:

- ShieldCheck icon, emerald style matching existing `KycBadge` (`BuyerKycPage.tsx:163`).
- Tooltip/title: `Verified buyer · {level} · {date}`; `aria-label="Verified buyer"`.
- Renders nothing when unverified (avoids noise on every row).

Placements (scope = CRM leads + RFQs per user choice):
1. `LeadsPage.tsx:86` row — next to RFQ id + tag.
2. `LeadDetailDrawer.tsx:42` header — next to `ConversionBadge` + new buyer name/business block.
3. `SupplierQuoteDetailPage.tsx:256` `CrmLeadCard` — same badge.
4. Supplier RFQ inbox list (invited RFQs) — same component.

Buyer side:
- `BuyerKycPage.tsx:52,83,92` — remove `isForeign` gate; any business can submit
  `basic`/`enhanced` docs. Keep copy, replace "(domestic — KYC not required)" with
  domestic-eligible messaging. Reuse `VerifiedBuyerBadge`/`KycBadge` for own status.
- `CheckoutPage.tsx:108` buyer KYC hint stays; no new blocking (badge is signal, not gate).

## 5. Error handling, privacy, testing (§4 approved)

- Missing/deleted business, null `kycVerifiedAt`, or `kycLevel='none'` → unverified, no crash.
- Rejected KYC → badge disappears on next fetch.
- Privacy: only `business.name` + `kycLevel` + `kycVerifiedAt` exposed to an already-invited
  supplier. Never expose `documentUrls`, `taxId`, reviewer id.
- Tests:
  - `crmRepository` join: verified vs unverified vs missing buyer.
  - `buyerKyc` domestic submit (after gate removal) + review approve/reject transitions.
  - `leadRowSchema` extension parses + `buyerVerified` derivation.
  - Web `VerifiedBuyerBadge` render (verified with level/date, hidden when unverified).
- Manual QA: verify buyer → supplier sees badge in Leads list + drawer + RFQ inbox;
  reject → badge clears; domestic submit works end-to-end.

## 6. Files touched (expected)

- `packages/shared/src/*` — `isVerifiedBuyer` helper.
- `packages/validation/src/rfqCrm.ts` — `leadRowSchema` extension.
- `apps/api/src/modules/rfqs/crmRepository.ts`, `crm.ts`, `crmRoutes.ts` — join + return fields.
- `apps/api/src/modules/rfqs/service.ts` — RFQ inbox enrichment.
- `apps/api/src/modules/kyc/buyerKyc.ts` — allow domestic submit (remove country gate at route/service level).
- `apps/web/src/supplier/crm/VerifiedBuyerBadge.tsx` (new), `LeadsPage.tsx`,
  `LeadDetailDrawer.tsx`, `SupplierQuoteDetailPage.tsx`, RFQ inbox component,
  `pages/BuyerKycPage.tsx`.
- Tests under `apps/api/test/` + `apps/web/test/`.

## 7. Rollout

No flag needed (additive, read-only). No backfill (derived). Docs: update CRM spec
`2026-09-15-supplier-crm-design.md` follow-up note + runbook line for admin KYC queue
now serving domestic + foreign.
