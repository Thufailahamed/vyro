# Vyro Platform Audit — Revenue Gaps & Roadmap Synthesis

**Date:** 2026-09-17
**Type:** Research companion (not a feature spec)
**Owner:** Platform

## Why this doc exists

Three research streams ran on 2026-09-17 in response to a "what's left + what to do next + what makes this revenue-ready" question:

1. **Codebase audit** — read every revenue-touching module in `apps/api/src/modules/` to identify built / partial / missing / deferred work, with revenue-impact tags.
2. **Roadmap audit** — evaluated the five remaining growth sub-projects (#3 Promotions, #4 Saved carts, #5 Subscriptions, #6 Recommendations, #8 Referrals) plus the flagged WhatsApp commerce variant against the patterns set by the three shipped sub-projects (Reviews, Sponsored, Trust).
3. **Market research** — external research on SL B2B wholesale distribution: competitor map (Ceyspace, Kapruka, traditional distributors), payment-provider landscape (PayHere vs WebXPay), net-30 credit norms, FX/sanctions regulation (CBSL), VAT/SSCL/NBT tax obligations, mobile-first buyer behavior, global take-rate benchmarks (Faire Direct + 3-15% SL sales-agent band).

This doc captures the synthesis. Findings are split into **ranked priority buckets** (P0 → P3) so readers can sequence work without re-reading the three raw streams.

## Headline findings

### Three live revenue blockers (P0)

1. **PayHere commission hardcoded to 0%** — every online paid order currently bypasses the platform commission path (`apps/api/src/modules/payments/routes.ts:141` literal `online: 0`). Live revenue leak on every PayHere order. Default precedence chain (`finance/commission.ts`) sets 250 bps.
2. **Tax hardcoded to 0** — invoice generation has no VAT/SSCL/NBT line items (`apps/api/src/modules/invoices/generate.ts:52`). Effective Apr 1 2026, the SL VAT/SSCL registration threshold dropped from LKR 60M to LKR 36M annual turnover, pulling mid-tier suppliers into the formal tax net. Invoices are legally non-compliant today for any supplier in that band.
3. **Payout cron missing** — supplier payouts are admin-triggered only (`apps/api/src/modules/payouts/admin.ts`). No recurring run means suppliers get paid only when someone clicks. There's no `payout_runs` table, no schedule, no ledger tie-out.

Two of these (A + C) are addressable in days and ship together as the "P0 Revenue Bug Sweep" spec. The third (B — tax line items) needs a supplier revenue-band data source decision (self-declared at KYC? ROC integration? user input at signup?) and warrants its own follow-up spec.

### Platform-readiness gaps at scale (P2)

- Supplier KYC doc upload — only a 24-line stub; no document infra, no review queue.
- OFAC real fetcher (SEED-only) — sanctions checks on cross-border flows fail silently in production.
- AML/STR generation — required for FIU; missing.
- PayHere refund REST (`returns 'payhere-refund-rest-not-configured'`) — blocks any refund on PayHere-paid orders.
- Buyer dunning — Net14/Net30 collections only notify admins, not buyers. Collection rate will crater without buyer-side email cadence.
- CSV bulk-import — supplier onboarding blocks at >5 products without JSON knowledge.
- PostHog / funnel / cohort dashboard — no product growth visibility. Cannot answer "what's our search→checkout conversion rate?".
- Sponsored auto-renew — `sponsored/routes.ts:107` create-subscription, no renewal loop. Bronze/Silver/Gold stop at expiry.
- PayHere recurring — `packages/payments/src/index.ts` has no recurring export. Blocks all subscription-class revenue (P1).
- Marketing campaigns — Resend is transactional-only; broadcast email/WhatsApp doesn't exist.

### Roadmap sub-projects ranked (P3 — growth surface)

| # | Item | Revenue | Effort | SL B2B fit |
|---|------|---------|--------|-----------|
| + | WhatsApp deep-link | MED-HIGH | **S (days)** | **Very strong** |
| #3 | Promotions + coupons | HIGH | M | Strong — 60% of tier math already shipped |
| #4 | Saved carts / reorder | HIGH | M (lean S) | Strong — reorder shortcut only |
| #5 | Standing POs (rescoped) | LOW rev / MED retention | M | Partial — true subs is misfit |
| #6 | Recommendations / trending | MED | M | Partial — co-occurrence + trending in 2 SQL queries |
| #8 | Referral + rewards | MED | M | Medium — overlaps existing `repeatOffers/` loyalty program |

Specific notes:

- **#3 (Promotions + coupons)** is partially done. Per-offer volume tiers (`supplierProducts.tier1MinQty/tier1DiscountPct`) plus auto loyalty (90-day trailing LKR 15k → 10% off) are live in `repeatOffers/`. What's missing is admin-issued site-wide promotions + coupon redemption at checkout. One new endpoint + one admin CRUD.
- **#4 (Saved carts / reorder)** is "reorder shortcut only" — copy a past PO into the current cart with one click. No named lists, no sharing. Floor is 1 endpoint + 1 button on `OrderDetailPage`. Maps directly to SL small retailers' weekly staple-reorder behavior.
- **#5 (Subscriptions)** is **wrong-listed**. SL small retailers don't buy "subscriptions" — they buy **standing POs** with cadence + edit window. Rescope before build. True subscriptions (Stripe-style) are a B2C pattern; the B2B analogue is closer to Net14/30 + reorder shortcuts than to recurring billing.
- **#6 (Recommendations)** is "2 SQL queries + 2 UI components". Co-occurrence on `purchase_order_items` gives "frequently bought together"; 7-day `count(*)` on POs gives trending. Cold-start fallback (items with <5 orders): "newest in category". Personalization deferred to v2.
- **#8 (Referrals)** overlaps with the already-shipped `repeatOffers/` module (auto 10% off when trailing spend > LKR 15,000 in 90 days). Floor policy: **stack** referral credits on top of the loyalty discount. Needs explicit policy decision in the spec.
- **WhatsApp deep-link** is the smallest build (S = days). No new schema. Inbound Meta webhook (`apps/api/src/modules/whatsapp/routes.ts`) already exists for the bot-to-Vyro direction; the deep-link variant is the **Vyro-to-WhatsApp** direction (generate a `wa.me/<phone>?text=...` link from the buyer's cart). Sidesteps Meta template-approval friction entirely. Highest SL behavior-fit of all items.

### Cross-cutting risks

- **Flag proliferation.** Each new feature adds another `*_ENABLED` flag string with no central registry. With 6 more roadmap items, an audit is advisable. Suggest adding a `KNOWN_FLAGS` set in `apps/api/src/lib/featureFlags.ts` that warns on unknown reads.
- **Shadow discount stacks.** Both #3 promotions and #8 referrals risk building "another discount system" on top of existing `cart/pricing.ts` and `repeatOffers/` logic. Plans must explicitly reference those modules to avoid stacking bugs.
- **Buyer-side concentration.** Of the 6 remaining items, 5 concentrate UI work in `apps/web/src/pages/{CartPage, CheckoutPage, ProductDetailPage, OrderDetailPage}.tsx`. Plan teams need parallel buyer-page work.
- **AI touchpoints.** `apps/web/src/ai/CartHintsBanner.tsx` already touches CartPage. New cart-touching features should coordinate with this banner.

## Market context (cited)

These are the external anchors used to evaluate take-rate, payment margin, and tax gaps. Confidence rated per claim.

| Claim | Confidence | Source |
|-------|------------|--------|
| SSCL = 2.5% on liable turnover under Act No. 25 of 2022, accruing quarterly from Oct 1, 2022 | high | IRD primary; KPMG/Deloitte 2026 budget summaries |
| VAT/SSCL registration threshold cut from LKR 60M → LKR 36M effective Apr 1, 2026 (already in force as of 2026-09-17) | high | KPMG (Nov 2025) + Deloitte SL budget |
| WebXPay card tiers: Starter 3.80% / Economy 3.10% / Business 2.60%; subscription fees LKR 10k–107.9k | high | webxpay.com/pricing primary |
| WebXPay XSPLIT (consumer BNPL) requires LKR 10,000 minimum across banks; LKR 25,000 with Commercial Bank | high | webxpay.com/pricing primary |
| Local SL sales-agent commissions 3–15%; FMCG wholesale sits in 3–10%, pure wholesale in 2–5% | high | US ITA Country Commercial Guide (Sri Lanka) |
| Faire Direct: 0% commission on orders from buyers the vendor directly invites; ~3.5% + $0.30 processing on Faire-sourced; no joining/listing/monthly fees | medium | Contrary Research + Faire Help Center primary |
| Ceyspace: 39 active suppliers, only 2 marked Verified Supplier (~5%); trust-signal differentiation is unclaimed | high | Direct enumeration of ceyspace.com/b2b-all-suppliers |
| B2B marketplaces globally fund net-30 credit by self-insurance or partner-bank lines (Faire Net60 from late 2017) | medium | Contrary Research |

### Implication for take-rate

Vyro's blended take-rate must come under the lower bound of traditional agent commissions (≤3%) for self-serve catalog ordering to win on price. Margin recovery levers:

- Sponsored tiers (Bronze/Silver/Gold) — already shipped.
- FX/cross-border margin — built into the cross-border module.
- Late-payment recovery — not yet built; cheap win once dunning exists.

### Implication for tax

Supplier-tier-aware tax classification needs to land before any SL supplier passes LKR 36M annual turnover. Open question for the tax spec: what is the supplier turnover data source? Self-declared on KYC, ROC integration, or signup-time freeform input?

### Implication for credit

Neither card-network installments (XSPLIT < LKR 10k floor) nor consumer BNPL works for B2B small-ticket orders. Vyro's Net14/Net30 must self-fund or use a partner-bank line. Existing implementation grants Net14/30 after 3 paid orders — that gating is correct in spirit. Add buyer dunning before scaling.

## Suggested sequence

**30 days (P0):** Fix A (PayHere commission) + Fix B (tax lines, after supplier-turnover data decision) + Fix C (payout cron).

**60 days (P1):** PayHere recurring API + sponsored auto-renew + WhatsApp deep-link.

**90 days (P2 partial):** Buyer dunning + supplier KYC doc upload + CSV import + PostHog + funnel endpoints + cohort dashboard.

**Next quarter (P3 + remaining P2):** #3 promotions + #4 reorder + sponsor-invoice→payout reconciliation + standing POs (rescoped) + OFAC real fetcher + AML/STR + recommendations + referrals (locked policy).

## Status of this doc

Companion to `docs/superpowers/specs/2026-09-17-p0-revenue-bug-sweep-design.md`, which addresses Fixes A and C. Fix B (tax line items) and the rest of the sequence above remain to be spec'd.
