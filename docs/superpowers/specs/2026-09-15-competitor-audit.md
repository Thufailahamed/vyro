# Vyro Competitor Feature Audit — 2026-09-15

**Status:** Draft (awaiting user review)
**Author:** Competitor audit brainstorm session
**Scope:** Identify gaps between Vyro (SL wholesale distribution marketplace) and 4 reference B2B platforms. Locked picks for next feature to follow in a subsequent brainstorm → spec → plan cycle.

## 1. Scope & Method

### 1.1 Why this audit

Vyro roadmap (`docs/superpowers/specs/2026-09-13-supplier-reviews-design.md` + 8-sub-project list in memory) was brainstormed from internal instinct rather than external parity data. This audit grounds the roadmap in observed competitor practice and surfaces features the 8-project list may have missed.

### 1.2 Competitor cohort

| Site | Why picked | Role in audit |
|---|---|---|
| IndiaMART | Closest regional analog (South-Asian B2B marketplace, RFQ-led, SMB-tilted) | Buyer-pulls + supplier-CRM pattern |
| Alibaba | Global wholesale giant, monetization reference | Trust infrastructure + paid membership + agentic AI |
| Faire | Curated B2B wholesale-to-retailers (US) | Trade-terms + curation + retailer-loyalty pattern |
| Ankorstore | Curated B2B wholesale-to-retailers (EU) | EU regulatory + API + analytics depth |

### 1.3 Method

- Public-site walkthrough (homepage, main nav, footer, help center, onboarding, buyer flows, supplier flows, mobile app store listings).
- Cross-check via 1-2 G2 / Capterra comparison articles per site.
- Per-site inventory: 15–25 features with 1-line note + source URL.
- Diff: Vyro modules (`apps/api/src/modules/`) + web pages (`apps/web/src/{pages,supplier}/`) + roadmap (memory `vyro-roadmap.md`).
- Categorize each competitor feature: **Have** / **Partial** / **Planned-roadmap** / **Missing**.
- Rank missing features by 2-axis value/effort.

### 1.4 Vyro baseline snapshot

**Modules (`apps/api/src/modules/`):** accounts, admin, ai, analytics, auth, businessTypes, businesses, cart, categories, credit, cross-border, cspReport, deliveries, documents, finance, health, home, inventory, invoices, kyc, ledger, notifications, payments, payouts, products, purchaseOrders, reconciliation, refunds, reviews, rfqs, search, searchRanking, settings, storefront, supplierProducts, supplierTypes, suppliers, webhooks, whatsapp.

**Recent shipped (commits):** ranking field on PDP offers + best-match badge, conversational order (AI module), PayHere gateway, supplier reviews spec, credit Net 14/30, cross-border (FX/customs/KYC), observability + status page, alerting engine, three-way reconciliation, RFQ gap closure.

**Roadmap (from `vyro-roadmap.md`):** (1) supplier ratings & reviews — spec written; (2) supplier verification & trust badges; (3) promotions, coupons & volume pricing; (4) saved carts, lists & reorder shortcuts; (5) subscriptions / recurring orders; (6) recommendations, trending, related; (7) featured / sponsored listings; (8) referral + rewards. Plus **WhatsApp commerce** in its own spec.

## 2. Per-Competitor Feature Inventories

### 2.1 IndiaMART (indiamart.com) — 25 features

| # | Feature | Category | Note |
|---|---|---|---|
| 1 | Post Buy Requirement (RFQ) | buyer | 3-step form, mobile-verified; sellers receive qualified leads. |
| 2 | Search Products & Suppliers | search | Keyword search across 21Cr+ listings; industry/city/trending drill-downs. |
| 3 | Get Best Price (quote aggregator) | buyer | Single-form quote aggregator from multiple suppliers. |
| 4 | IndiaMART Lens (AI visual search) | search | Reverse image search; upload photo → matching SKUs. |
| 5 | IndiaMART Tenders | buyer | Aggregator of 50K+ live gov/corp/global tenders filterable by state/product. |
| 6 | Direct Seller Contact (Call/SMS/Email) | buyer | Masked phone + SMS + email on every listing. |
| 7 | WhatsApp Support / Chat / Video Meeting | buyer | Multi-channel help; video-meeting requests. |
| 8 | Verified Business Buyer badge | trust | Vetted buyer mark on leads received by sellers. |
| 9 | Seller Ratings & Reviews | trust | Star ratings on supplier profiles + listings. |
| 10 | Free Supplier Registration | onboarding | 3-step: account → business → products. |
| 11 | TrustSEAL Verification | trust | Subscription package verifying phone/email/address/GST/PAN; priority ranking. |
| 12 | Verified Company Details Badge | trust | "Member Since N yrs" + verified seal on storefront. |
| 13 | Lead Manager (built-in CRM) | supplier | Consolidated enquiry dashboard: tagging (Hot/Warm/Cold), tasks, notes, conversion analytics. |
| 14 | BuyLeads | supplier | Daily inbound buyer-requirement feed matched to seller categories; 25 free for new sellers. |
| 15 | Free Business Website & Catalog | supplier | Hosted mini-site + product catalog at no cost. |
| 16 | Catalog Manager | supplier | Bulk upload/edit/organize listings with images, specs, pricing. |
| 17 | Seller Performance Dashboard | analytics | Listing views, enquiry conversion, lead source, revenue attribution. |
| 18 | Learning Centre (Seller Training) | onboarding | In-platform training content for new and growing sellers. |
| 19 | Ship With IndiaMART (logistics) | payments | Integrated shipping/courier partner solution. |
| 20 | Pay with IndiaMART (escrow) | payments | Escrow on select categories; funds held until buyer confirms delivery. |
| 21 | IndiaMART Export | supplier | Dedicated cross-border marketplace (export.indiamart.com). |
| 22 | IndiaMART Mobile Apps | mobile | iOS/Android: search, RFQ, contact sellers, push, lens. |
| 23 | IndiaMART Videos | supplier | YouTube + Meta video catalog integration on listings. |
| 24 | Hindi & Regional Localization | other | Full Hindi site for non-English SMB buyers. |
| 25 | Complaint & Feedback System | trust | Public complaint registration, grievance escalation. |

Sources: indiamart.com, trust.indiamart.com, help.indiamart.com, G2 reviews, Play Store listing.

### 2.2 Alibaba (alibaba.com) — 22 features

| # | Feature | Category | Note |
|---|---|---|---|
| 1 | Trade Assurance (escrow) | trust | Funds held until buyer confirms delivery; coverage tier ($10K–$20K+). |
| 2 | RFQ Marketplace | buyer | Sourcing requests; tiers include Industry-selected, Trial order, Private pairing, Directed recommend. |
| 3 | Gold Supplier Membership | onboarding | Paid annual ($1.4K–$6.9K); unlocks RFQ quotas, ad credits, mini-storefront. |
| 4 | Verified Supplier (A&V Check) | trust | Third-party on-site inspection by SGS/Intertek/TÜV/Bureau Veritas. |
| 5 | Sample Center | buyer | Suppliers list low-cost sample SKUs; combine with Trade Assurance. |
| 6 | Inspection Service (pre-shipment) | inspection | Tiered inspection (Basic/Standard/Comprehensive); reports in 3–7 days. |
| 7 | Alibaba.com Logistics Service | logistics | Freight forwarding (sea/air/rail/express); calculator, tracking, customs docs. |
| 8 | Alibaba Mobile App | mobile | Search, RFQ, in-app chat, video factory tours, order tracking, AI deals. |
| 9 | Accio AI Sourcing Agent | search | Agentic AI launched Aug 2025; plans sourcing, generates RFQs, negotiates with suppliers. |
| 10 | Alibaba Lens | search | Reverse image search via Chrome extension + app. |
| 11 | Online Trade Show | buyer | Virtual expo halls with live-streamed product demos. |
| 12 | CoCreate Pitch | supplier | Product pitch competition; $1M total prize pool. |
| 13 | Dropshipping Center | buyer | Curated dropship catalog with Wix/Mercado Libre integrations. |
| 14 | Tax Exemption & Compliance | payments | VAT/customs exemption program for US/EU buyers. |
| 15 | Business Edge Credit Card | payments | Mastercard co-brand; $199/yr; 3% cash back or 60-day interest-free. |
| 16 | Buyers Club (membership) | buyer | Tiered membership with deals, dedicated support, sourcing benefits. |
| 17 | Logistics Concierge & Production Monitoring | logistics | White-glove shipping + production-status checks during manufacturing. |
| 18 | AI Mode (homepage sourcing) | search | Top-nav entry point to Accio-style conversational sourcing. |
| 19 | Letter of Credit & Secure Payments | payments | T/T, Letter of Credit, credit card, platform-guaranteed escrow. |
| 20 | Seller Central | supplier | Back-office for verified/Gold suppliers; RFQ quotas, analytics, ad credits. |
| 21 | Source in Europe | buyer | Curated 650K+ European suppliers for buyers seeking non-China sourcing. |
| 22 | Partner Stores | other | Wix / Mercado Libre integrations for storefront builders. |

Sources: alibaba.com, sourcing.alibaba.com, inspection.alibaba.com, logistics.alibaba.com, accio.com, G2, Cardless.

### 2.3 Faire (faire.com) — 25 features

| # | Feature | Category | Note |
|---|---|---|---|
| 1 | Net 60 Payment Terms | payments | Eligible retailers pay 60 days later; zero fees. |
| 2 | Free Returns on First Order | trust | Retailers return unsold merchandise from brand's first order. |
| 3 | Curated Brand Marketplace | discovery | Brands apply; Faire reviews for supply/demand balance, location, SKUs, wholesale readiness. |
| 4 | Faire Direct (0% commission link) | supplier | Brand-driven orders carry 0% commission vs 15% marketplace rate. |
| 5 | Marketplace Commission + New-Customer Fee | supplier | 15% + $10 on opening orders; reorders commission-free. |
| 6 | Geographic Exclusivity Program | trust | Retailer exclusivity in postcode in exchange for annual spend commitment. |
| 7 | Region Blocking for Sales Reps | supplier | Brands block regions where they already have reps. |
| 8 | Faire Credit + 2% Reorder Rebate | payments | Approved retailers auto-extended Net 60 + ~2% reorder rebate. |
| 9 | Faire Insider Tiered Loyalty | buyer | Free tiered program: $5K/$10K/$25K trailing-12-mo; up to $149 free shipping, 25% margin floor. |
| 10 | Faire Markets Bi-Annual Event | discovery | Twice-yearly buying event; 30K+ brands, 75K+ retailers; Faire matches discounts up to 5%. |
| 11 | Values & Diversity Brand Filters | discovery | Women/AAPI/Black/Latino/LGBTQI-owned, eco/organic/handmade, Not on Amazon, Gives back. |
| 12 | International Edit / Geographic Discovery | discovery | Curated regional collections (EU/UK/FR/DE/Nordics/Made-in-Italy). |
| 13 | Multi-Location Retailer Management | buyer | Single signup centralizes insurance, payments; per-location independence. |
| 14 | Faire Mobile App | mobile | Browse, message brands, reorder, track shipments; team message read/unread sync. |
| 15 | In-App Brand Messaging with Attachments | buyer | Messenger with PDF/JPEG/PNG/GIF/WEBP attachments; "Needs Reply" priority. |
| 16 | Low/No Minimum Order Quantities | buyer | Many brands offer low or no minimums; reduces trial barrier. |
| 17 | Shopify Catalog & Inventory Sync | supplier | Sync catalog/inventory from Shopify, spreadsheet, or own site. |
| 18 | Negotiated Shipping Rates w/ Pre-Paid Labels | supplier | Print packing slips, ship via pre-paid labels at Faire rates, or self-ship + reimbursement. |
| 19 | Flexible Payout Speed (Faire Pay) | payments | Next-day (3.5%+$0.30), 30-day (2.4%+$0.30), 60-day (1.9%+$0.30); deposits after shipping. |
| 20 | Brand Analytics Dashboard | analytics | Order volume, conversion, growth, returns (rate + items). |
| 21 | POS Integration | buyer | Connect retailer POS to marketplace for inventory + ordering. |
| 22 | 24-Hour Order Cancellation Window | trust | Cancel within 24h with brand approval; issue window 14d post-delivery. |
| 23 | Seasonal & Gift-Guide Curation | discovery | Halloween, Holiday, Mother's/Father's Day; gift guides (eco, pet, kids). |
| 24 | Store-Type Discovery Filters | discovery | Grocery, bakery, florist, plant nursery, candy store. |
| 25 | Help Center & Support Articles | onboarding | 24 FAQ, 21 getting-started, 58 orders/shipping, 37 payments/taxes. |

Sources: faire.com, faire.com/how-faire-works, faire.com/markets, faire.com/help, App Store.

### 2.4 Ankorstore (ankorstore.com) — 25 features

| # | Feature | Category | Note |
|---|---|---|---|
| 1 | Curated brand marketplace (30K+ vetted) | discovery | Applied/vetted European brands across fashion/home/beauty/food/kids/gifts. |
| 2 | Net 60 deferred payment | payments | Ankorstore funds the gap; runs credit assessment on buyers. |
| 3 | Net 30/60/90 tiered terms | payments | Longer terms (up to Net 90 via Ankorstore Plus) by account standing. |
| 4 | "Pay upfront" vs "Net terms" choice | payments | Brand chooses immediate or Net (~1% surcharge). |
| 5 | Ankorstore Plus paid membership | buyer | Free shipping, up to 90-day terms, 5-20% Repeat Offer discounts, 3-day FR delivery. |
| 6 | Ankorstart for emerging retailers | onboarding | Events, market studies, business plan help for new retailers. |
| 7 | Local shopping filters | search | Filter by brand country/region for proximity. |
| 8 | Multi-country EU coverage | other | Live in DE/FR/UK/IT/ES/NL/BE/AT/PT/IE/SE/DK/FI/PL/CH; localized registration (SIREN). |
| 9 | Reorder tab & one-click reordering | buyer | Past brands + per-order Reorder button with quantity adjustment. |
| 10 | Prepared orders from brands | buyer | Brands email/stage pre-built carts under "Prepared by brand" tab. |
| 11 | Personalized + promo discounts at checkout | buyer | Trade discounts auto-apply; manual promo codes; VAT + shipping auto-calc. |
| 12 | Five-criteria retailer reviews | trust | Reviews on overall, accuracy, condition, communication, value; 90-day window. |
| 13 | Report brand / product buttons | trust | Retailer flags IP/quality/policy issues on listings + brand pages. |
| 14 | Retailer eligibility verification (~24h) | onboarding | Local business registration check (e.g. SIREN); orders allowed during pending. |
| 15 | iOS + Android wholesale mobile app | mobile | Browse 30K+ brands, place orders, manage accounts. |
| 16 | Zero-commission brand pricing (Dec 2025) | supplier | 0% commission; only 3% payment fee (guarantee + delivery). |
| 17 | Ankorstore public API for brands | supplier | REST API for ERP/PIM/inventory integration. |
| 18 | Brand Setup AI onboarding | onboarding | AI assistant generates descriptions, taglines, attributes. |
| 19 | Unified Brand Dashboard w/ forecasting | analytics | Sales/traffic/product performance + trending-SKU + stock-out risk alerts. |
| 20 | Cohort & repeat-buyer analytics | analytics | LTV, repeat-purchase rate, behavioral cohorts of retailer customers. |
| 21 | Featured brand slots & sponsored | discovery | Paid visibility in search + category pages. |
| 22 | Brand Stories & rich storefront content | supplier | Editorial content: lookbooks, founder story, sustainability reports. |
| 23 | Impact Score sustainability rating (beta) | trust | Storefront badge from certifications, materials, supply-chain signals. |
| 24 | Verified Reviews v2 | trust | Reviews tied to transactions; photo uploads; brand response. |
| 25 | Repeat Offer auto-discount | supplier | 5-20% off catalog after retailer crosses €500/3mo; brand-funded. |

Sources: ankorstore.com/en, support.ankorstore.com, blog.ankorstore.com (June 2025), App Store, ResolvePay blog.

## 3. Presence Matrix

Matrix axes: **Feature × Competitor presence × Vyro status**. Status legend:
- **Have** — shipped in `apps/api` or `apps/web`.
- **Partial** — adjacent module exists, gap is meaningful.
- **Planned** — on the 8-project roadmap (or WhatsApp spec).
- **Missing** — not present and not on roadmap.

| # | Feature | IM | Alibaba | Faire | Ankorstore | Vyro status |
|---|---|---|---|---|---|---|
| 1 | RFQ marketplace | ✓ | ✓ | — | — | Have (`rfqs/`) |
| 2 | Quote aggregator (multi-supplier) | ✓ | — | — | — | Have (RFQ compare) |
| 3 | Keyword search + filters | ✓ | ✓ | ✓ | ✓ | Have (`search/` + `searchRanking/`) |
| 4 | AI visual search / Lens | ✓ | ✓ | — | — | **Missing** |
| 5 | Tenders / public procurement aggregation | ✓ | — | — | — | **Missing** (out of scope; flag) |
| 6 | Direct seller contact (call/SMS/email) | ✓ | — | — | — | Partial (`notifications/` + `whatsapp/`) |
| 7 | Multi-channel buyer support (WhatsApp/chat/video) | ✓ | ✓ | ✓ | ✓ | Partial (`whatsapp/` separate spec) |
| 8 | Verified buyer badge | ✓ | — | — | — | **Missing** |
| 9 | Seller ratings & reviews | ✓ | ✓ | (curated) | ✓ | Planned (roadmap #1, spec written) |
| 10 | Free supplier onboarding | ✓ | — | — | — | Have (`auth/` + `suppliers/`) |
| 11 | Paid supplier membership tier | — | ✓ | ✓ | — | **Missing** (adjacent to roadmap #7) |
| 12 | Third-party verified supplier (A&V inspection) | — | ✓ | — | — | **Missing** (`kyc/` is internal-only) |
| 13 | TrustSEAL / paid verification badge | ✓ | ✓ | — | — | Planned (roadmap #2) |
| 14 | "Member since" badge on storefront | ✓ | ✓ | ✓ | ✓ | Partial (`suppliers/`, `storefront/`) |
| 15 | Built-in lead manager (CRM) | ✓ | — | — | — | **Missing** |
| 16 | Daily inbound leads feed (BuyLeads) | ✓ | — | — | — | **Missing** |
| 17 | Free hosted storefront / catalog | ✓ | — | ✓ | ✓ | Have (`storefront/`) |
| 18 | Catalog manager (bulk upload + edit) | ✓ | ✓ | ✓ | ✓ | Have (`supplierProducts/`) |
| 19 | Seller analytics dashboard | ✓ | ✓ | ✓ | ✓ | Have (`analytics/`) |
| 20 | Supplier learning / training center | ✓ | ✓ | ✓ | ✓ | **Missing** |
| 21 | Integrated logistics / shipping partner | ✓ | ✓ | ✓ | — | Partial (`deliveries/` + `cross-border/`) |
| 22 | Escrow / payment protection | ✓ | ✓ | — | — | Have (`payments/` PayHere + `reconciliation/`) |
| 23 | Cross-border export marketplace | ✓ | ✓ | — | — | Have (`cross-border/`) |
| 24 | Native mobile app | ✓ | ✓ | ✓ | ✓ | **Missing** (PWA only — `vyro-f3-pwa-design`) |
| 25 | Video on listings | ✓ | — | — | — | **Missing** |
| 26 | Local / regional localization | ✓ | — | — | ✓ | **Missing** (English-only) |
| 27 | Complaint / feedback system | ✓ | ✓ | ✓ | ✓ | Have (`admin/` moderation + dispute flow) |
| 28 | RFQ sourcing tiers (industry / trial / private) | — | ✓ | — | — | Partial (single RFQ tier) |
| 29 | Sample center (low-cost sample SKUs) | — | ✓ | — | — | **Missing** |
| 30 | Pre-shipment third-party inspection | — | ✓ | — | — | **Missing** |
| 31 | Logistics concierge + production monitoring | — | ✓ | — | — | **Missing** |
| 32 | Online trade show / live-stream demos | — | ✓ | — | — | **Missing** |
| 33 | Accio-style agentic AI sourcing | — | ✓ | — | — | **Missing** (Vyro `ai/` = order copilot only) |
| 34 | Dropshipping center | — | ✓ | — | — | **Missing** (B2B, out of scope) |
| 35 | Tax exemption / compliance program | — | ✓ | — | — | **Missing** (`cross-border/` has customs only) |
| 36 | Co-branded buyer credit card | — | ✓ | — | — | **Missing** (out of scope; PayHere + Net 14/30) |
| 37 | Tiered buyer membership program | — | ✓ | — | ✓ | **Missing** |
| 38 | Curated brand vetting (application-gated) | — | — | ✓ | ✓ | **Missing** (`kyc/` is post-application, not pre-gating) |
| 39 | Net 60 / Net 90 tiered terms | — | — | ✓ | ✓ | Partial (`credit/` has Net 14/30 only) |
| 40 | Free returns on first order | — | — | ✓ | — | **Missing** |
| 41 | Faire Direct (0% commission brand link) | — | — | ✓ | — | **Missing** |
| 42 | Geographic exclusivity program | — | — | ✓ | — | **Missing** |
| 43 | Region blocking for sales reps | — | — | ✓ | — | **Missing** (out of scope; Vyro has no rep model) |
| 44 | Faire Credit / 2% reorder rebate | — | — | ✓ | — | **Missing** |
| 45 | Faire Insider tiered loyalty | — | — | ✓ | — | **Missing** (adjacent to roadmap #8) |
| 46 | Faire Markets bi-annual buying event | — | — | ✓ | — | **Missing** |
| 47 | Values & diversity filters | — | — | ✓ | — | **Missing** |
| 48 | International / regional edit collections | — | — | ✓ | — | **Missing** |
| 49 | Multi-location retailer management | — | — | ✓ | — | **Missing** |
| 50 | In-app buyer↔supplier messaging (rich attachments) | — | — | ✓ | — | **Missing** (`whatsapp/` is buyer↔Vyro, not buyer↔supplier) |
| 51 | Low/no minimum order quantities | — | — | ✓ | — | Partial (`cart/` `minOrderQty` exists per gap spec) |
| 52 | Shopify catalog & inventory sync | — | — | ✓ | — | **Missing** |
| 53 | Pre-paid shipping labels (negotiated rates) | — | — | ✓ | — | **Missing** |
| 54 | Flexible payout speed (next/30/60 day) | — | — | ✓ | — | **Missing** (`payouts/` is fixed schedule) |
| 55 | POS integration | — | — | ✓ | — | **Missing** |
| 56 | 24-hour order cancellation window | — | — | ✓ | — | **Missing** |
| 57 | Seasonal & gift-guide curation | — | — | ✓ | — | **Missing** |
| 58 | Store-type discovery filters | — | — | ✓ | — | **Missing** |
| 59 | Ankorstore Plus paid membership | — | — | — | ✓ | **Missing** |
| 60 | Ankorstart new-retailer program | — | — | — | ✓ | **Missing** |
| 61 | Local shopping filters (by brand region) | — | — | — | ✓ | **Missing** |
| 62 | Multi-country EU coverage | — | — | — | ✓ | **Missing** (SL-only; cross-border exists) |
| 63 | One-click reorder | — | — | — | ✓ | Planned (roadmap #4) |
| 64 | Prepared orders from brands (pre-built carts) | — | — | — | ✓ | **Missing** |
| 65 | Personalized trade discounts at checkout | — | — | — | ✓ | Planned (roadmap #3) |
| 66 | Five-criteria structured reviews | — | — | — | ✓ | Planned (roadmap #1, single 1-5 per MVP floor) |
| 67 | Report brand / product buttons | — | — | — | ✓ | Partial (`admin/` moderation exists) |
| 68 | Public API for brands (ERP/PIM/inventory) | — | — | — | ✓ | **Missing** |
| 69 | Brand Setup AI onboarding assistant | — | — | — | ✓ | Partial (`ai/` has some helpers) |
| 70 | Cohort & repeat-buyer analytics | — | — | — | ✓ | **Missing** (planned overlap with roadmap #6) |
| 71 | Featured / sponsored brand slots | — | — | — | ✓ | Planned (roadmap #7) |
| 72 | Brand Stories rich content (lookbooks) | — | — | — | ✓ | **Missing** (extends `storefront/`) |
| 73 | Impact Score sustainability rating | — | — | — | ✓ | **Missing** |
| 74 | Verified Reviews v2 (photos, brand replies) | — | — | — | ✓ | Planned (roadmap #1 — supplier reply planned; photos deferred) |
| 75 | Repeat Offer auto-discount | — | — | — | ✓ | **Missing** |

## 4. Gap Categorization

### 4.1 Already-have (matrix rows "Have")

See matrix rows 1, 2, 3, 10, 17, 18, 19, 22, 23, 27. Vyro covers the foundational layer (RFQ, search, cart, payments/escrow, analytics, moderation, cross-border, storefront).

### 4.2 On roadmap (matrix rows "Planned")

See rows 9, 13, 63, 65, 66, 71, 74. The 8-project list captures:
- Supplier reviews (spec written, plan ready, not started).
- Trust badges (surface existing KYC + delivery + dispute signals).
- Promotions / volume pricing.
- Saved carts + reorder.
- Recommendations.
- Sponsored listings.

Plus WhatsApp commerce (separate spec 2026-09-12).

### 4.3 Missing — not on roadmap

75 → 75 minus (have + planned) = **41 distinct missing features** (per §5 below). The bulk of these are either curation-specific (Faire/Ankorstore), trade-terms extensions, supplier-side tooling (CRM/learning/AI/video), or marketplace mechanics (cancellation window, curation tiers, prepopulated carts).

### 4.4 Out-of-scope flag

The audit surfaced **5 features with weak SL fit**, listed for transparency but not ranked:

- Multi-country EU coverage (Ankorstore) — geographically irrelevant.
- Dropshipping center (Alibaba) — model mismatch; Vyro is wholesale, not DTC.
- Region blocking for sales reps — no rep model.
- Tax exemption / compliance program — out of Vyro's scope; handled by buyers' accountants.

**Note:** Tenders / public procurement aggregation was initially flagged here but is kept in §5.3 strategic — SL government + corporate procurement is a real vertical, even if outside today's wholesale core.

## 5. Missing Features Ranked (Value × Effort)

### 5.1 Ranking rubric

Each missing feature scored 1–3 on three value axes (buyer-pull, supplier-pull, retention; max 9) and 1–3 on effort:

| Effort | Meaning |
|---|---|
| E1 | Schema + API only (no UI) |
| E2 | E1 + UI surfaces |
| E3 | E1 + UI + cross-module / third-party (mobile, payments, AI, forwarder, KYC vendor) |

Quadrant buckets:

| Bucket | Criteria |
|---|---|
| **Quick-win** | Value ≥ 6, Effort ≤ 2 |
| **Strategic** | Value ≥ 6, Effort = 3 |
| **Defer** | Value 3–5 (any effort) |
| **Skip** | Value ≤ 2 or out of scope |

### 5.2 Quick-wins (high value, low effort)

| Feature | Source | Buyer | Supplier | Retention | Value | Effort | Notes |
|---|---|---|---|---|---|---|---|
| **AI Visual Search / Lens** | IM, Alibaba | 3 | 1 | 2 | **6** | E2 | Reuse `ai/` + `search/`; image embed → product match. High differentiation, no infra. |
| **In-app buyer↔supplier messaging** | Faire | 3 | 2 | 2 | **7** | E2 | Distinct from `whatsapp/` (which is buyer↔Vyro). New `messaging/` module or buyer/supplier chat. |
| **Built-in lead manager (CRM)** | IndiaMART | 1 | 3 | 3 | **7** | E2 | Tags (Hot/Warm/Cold), notes, conversion funnel. Reuses RFQ data. |
| **Daily inbound leads feed (BuyLeads)** | IndiaMART | 1 | 3 | 2 | **6** | E1 | Scheduled job that surfaces fresh RFQs to matching suppliers. |
| **Repeat Offer auto-discount** | Ankorstore | 1 | 3 | 2 | **6** | E1 | Brand-funded: when retailer crosses threshold, auto-discount 5-20%. |
| **24-hour order cancellation window** | Faire | 2 | 2 | 1 | 5 | E1 | Borderline; surfaces in `cart/` + `orders/`. |
| **Brand Stories (lookbooks, sustainability report)** | Ankorstore | 2 | 2 | 2 | **6** | E2 | Extends `storefront/`; CMS blocks + media. |
| **Verified buyer badge** | IndiaMART | 1 | 2 | 2 | 5 | E1 | Borderline; signal to suppliers on incoming leads. |
| **Report brand / product buttons** | Ankorstore | 1 | 2 | 2 | 5 | E1 | Borderline; partial via `admin/` moderation. |
| **Free returns on first order** | Faire | 3 | 2 | 2 | **7** | E2 | Extends `refunds/` + `credit/`; high buyer-pull. |
| **Sample center** | Alibaba | 2 | 1 | 1 | 4 | E2 | Defer; low SL fit (wholesale already at low unit cost). |

### 5.3 Strategic (high value, high effort)

| Feature | Source | Buyer | Supplier | Retention | Value | Effort | Notes |
|---|---|---|---|---|---|---|---|
| **Ankorstore Plus-style paid buyer membership** | Ankorstore | 2 | 3 | 3 | **8** | E3 | Subscription billing + free-shipping rules + extended Net terms. New `memberships/` module. |
| **Sinhala + Tamil + English localization** | IndiaMART | 3 | 1 | 3 | **7** | E3 | String extraction, RTL-free but content-heavy. Critical for tier-2/3 SL cities. |
| **Native mobile app (iOS + Android)** | all 4 | 3 | 2 | 2 | **7** | E3 | Beyond PWA. App Store + Play Store release pipeline. |
| **Gold Supplier-style paid membership tier** | Alibaba | 1 | 3 | 3 | **7** | E3 | Subscription + RFQ quote quotas + verified badge + ad credits. |
| **Accio-style agentic AI sourcing** | Alibaba | 3 | 1 | 2 | **6** | E3 | Conversational sourcing agent on top of `ai/`. Higher ambition than current copilot. |
| **Third-party verified supplier (A&V inspection)** | Alibaba | 2 | 2 | 2 | **6** | E3 | Inspector network (SGS/Intertek local partner); KYC → inspection → badge. |
| **Pre-shipment third-party inspection** | Alibaba | 2 | 2 | 2 | **6** | E3 | Inspection tier flow + report attachment. |
| **Logistics forwarder integration (with pre-paid labels)** | Alibaba, Faire | 2 | 2 | 2 | **6** | E3 | Negotiated rates + label printing via `cross-border/` + `deliveries/`. |
| **Geographic exclusivity program** | Faire | 1 | 2 | 3 | **6** | E3 | Retailer exclusivity in exchange for annual spend commitment. |
| **Multi-location retailer management** | Faire | 3 | 1 | 2 | **6** | E3 | Per-location sub-accounts under one buyer business. |
| **POS integration (retailer-side)** | Faire | 3 | 1 | 2 | **6** | E3 | Connect retail POS to marketplace for inventory + reorder. |
| **Public API for brands (ERP/PIM/inventory)** | Ankorstore | 1 | 3 | 2 | **6** | E3 | REST API; complements `supplierProducts/`. |
| **Ankorstart-style new-retailer program** | Ankorstore | 3 | 1 | 2 | **6** | E3 | Events, market studies, business plan help for new retailers. |
| **Online trade show / live-stream demos** | Alibaba | 2 | 2 | 2 | **6** | E3 | Live commerce + scheduled event framework. |
| **Net 60 / 90 tiered terms** | Faire, Ankorstore | 3 | 2 | 1 | 6 | E3 | Extends `credit/` past Net 30; risk-model integration. |
| **Curated brand vetting (application-gated)** | Faire, Ankorstore | 2 | 2 | 2 | **6** | E3 | Application review pre-listing; supply/demand balance. |
| **Faire Markets-style bi-annual buying event** | Faire | 2 | 1 | 2 | 5 | E3 | Time-bound campaign + matching-discount engine. Borderline strategic. |
| **Faire Direct 0% commission link** | Faire | 1 | 3 | 2 | **6** | E3 | Brand-driven traffic bypass; requires commission-engine refactor. |
| **Faire Credit 2% reorder rebate** | Faire | 1 | 3 | 2 | **6** | E3 | Tied to `payouts/` + `credit/`. |
| **Cohort & repeat-buyer analytics** | Ankorstore | 1 | 3 | 2 | **6** | E2 | Buyer cohorts + LTV in `analytics/`. Adjacent to roadmap #6 recommendations. |
| **Tenders / public procurement aggregation** | IndiaMART | 3 | 1 | 2 | **6** | E3 | New vertical; gov-tender scraping + buyer-side portal. |
| **Free returns on first order** | Faire | 3 | 2 | 2 | **7** | E2 | Extends `refunds/` + `credit/`. High buyer-pull. |

### 5.4 Defer (value 3–5)

| Feature | Value | Effort | Defer reason |
|---|---|---|---|
| Five-criteria structured reviews | 5 | E2 | Roadmap #1 chose MVP single 1-5. Reconsider after rollout. |
| 24-hour cancellation | 5 | E1 | Borderline; surfaces in `cart/` + `orders/`. |
| Verified buyer badge | 5 | E1 | Borderline; signal to suppliers on incoming leads. |
| Report brand / product buttons | 5 | E1 | Partial via `admin/` moderation. |
| Impact Score sustainability rating | 5 | E3 | ESG demand in SL B2B wholesale still low; revisit in 6-12 mo. |
| Shopify catalog sync | 4 | E3 | No Shopify ecosystem on supplier side; defer. |
| Pre-paid shipping labels | 4 | E3 | Defer until logistics forwarder partnership signed. |
| Flexible payout speed | 5 | E3 | Tied to `payouts/`; defer. |
| Values & diversity filters | 4 | E2 | Low SL relevance; defer. |
| Seasonal & gift-guide curation | 4 | E2 | Defer until buyer traffic supports it. |
| Store-type discovery filters | 4 | E2 | Defer; "category" search mostly sufficient. |
| Local shopping filters (by brand region) | 4 | E2 | Defer; SL is small enough to ship fast everywhere. |
| International edit / geographic discovery | 4 | E2 | Defer; cross-border covers most cases. |
| Faire Insider tiered loyalty | 5 | E3 | Adjacent to roadmap #8 referral/rewards. |
| Ankorstore Plus-tier free shipping rules | 4 | E3 | Subset of Plus membership; defer if Plus picked. |
| Prepared orders from brands (pre-built carts) | 5 | E2 | Useful but adjacent to roadmap #4 saved carts. |
| Buyer membership tiers (non-Plus) | 5 | E3 | Bundled with strategic picks if Ankorstore-Plus-style membership selected. |
| Brand Setup AI onboarding assistant | 4 | E2 | Extend `ai/` later. |
| Sample center | 4 | E2 | Low SL fit (wholesale already at low unit cost). |

### 5.5 Skip / out of scope

- Dropshipping center (model mismatch).
- Tax exemption program (out of Vyro scope).
- Business Edge co-branded credit card (out of scope; PayHere + Net covers).
- Faire Direct 0% commission link (no rep model).
- Region blocking for sales reps (no rep model).
- Multi-country EU coverage (SL only).
- Logistics concierge / production monitoring (out of scope).
- CoCreate Pitch (low SL fit).
- Dropshipping / CoCreate / business-edge card (see above).
- Tenders / public procurement aggregation — actually strategic, listed above; remove from skip.

## 6. Top 3–5 Quick Wins — Called Out

These five are the **recommended next features** for a follow-on brainstorm → spec → plan cycle, ordered by impact × effort:

1. **In-app buyer↔supplier messaging** (Faire model) — distinct from WhatsApp (which is buyer↔Vyro). High buyer-pull, high supplier-pull, raises retention. E2.
2. **Built-in lead manager / CRM for suppliers** (IndiaMART model) — Vyro suppliers currently have RFQ inbox but no tagging, notes, or conversion tracking. E2.
3. **AI visual search / Lens** (IndiaMART + Alibaba) — leverages existing `ai/` + `search/` infra; high buyer-pull, low supplier-pull. E2.
4. **Repeat Offer auto-discount** (Ankorstore model) — brand-funded incentive that crosses roadmap #3 boundaries; supplier-pulls, retention-positive. E1.
5. **Daily inbound leads feed (BuyLeads)** (IndiaMART model) — pair with the CRM above; scheduled job that matches new RFQs to supplier categories. E1.

A reasonable alternative top-5 swap: drop #5 for **Free returns on first order** (V=7 E=2) if you want max buyer-pull, or **Brand Stories rich content** for higher early-engagement supplier surface.

## 7. Future Research

This audit covered public-surface features. Natural next cycles:

- **Workflow deep-dive** on 1-2 sites (recommend Faire for buyer-side RFQ-to-reorder + Ankorstore for supplier-side onboarding). Already scope-able from this audit.
- **Logged-in UX walkthroughs** for the four sites — gated features may surface (e.g., Faire's Faire Pay settings, Ankorstore's Plus dashboard). Re-fetch after auth.
- **G2 / Capterra review-mining** for buyer complaints → feed into roadmap #6 (recommendations) and roadmap #8 (referral).
- **3rd-party comparison articles** (G2 Grid, Capterra Shortlist) for cross-site feature normalization.
- **Mobile-app-only features** — PWA gaps only become visible after native-app launch.
- **Cross-border layer** — Faire + Ankorstore go deep on EU VAT/SIREN; Vyro cross-border could use a separate deep-dive against TradeLens / Flexport / SriLankan customs portal.
- **Year-over-year delta** — re-run this audit in 6-12 months to catch new gaps (Faire Pay tiers, Accio, Ankorstore's 0%-commission pivot).

## 8. Open Questions

These are not blockers but should be settled before spec'ing the next feature:

1. **Mobile-native vs PWA-first?** Roadmap #6 (recommendations) currently PWA-only. The competitor 4/4 ships native apps. Decide before picking a quick-win.
2. **Curation model?** Faire + Ankorstore both curate. Vyro KYC is post-application. If we want a curated vertical (e.g., "verified wholesale" sub-marketplace), this is its own strategic spec.
3. **Buyer subscription program?** Ankorstore Plus is the highest-value strategic gap (V=8, E=3). If prioritized, it bundles multiple deferred items.
4. **Trust badge surface area?** Roadmap #2 plans to surface existing KYC + delivery + dispute signals. Consider folding in third-party inspection (V=6, E=3) into the same spec rather than treating as separate.

## 9. Handoff

**Next step (per user's chosen flow):**
- Browse §6 quick-wins.
- Pick one for the next brainstorm session.
- That session will produce a spec at `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md` and a follow-on implementation plan.

**Files referenced:**
- `docs/superpowers/specs/2026-09-13-supplier-reviews-design.md` (roadmap #1, spec written).
- `docs/superpowers/specs/2026-09-12-whatsapp-conversational-ordering-design.md` (WhatsApp commerce, separate).
- `docs/superpowers/specs/2026-09-05-vyro-feature-gaps-design.md` (prior internal gap audit, different scope).
- `apps/api/src/modules/` (39 modules — see §1.4).
- Memory: `vyro-project.md`, `vyro-roadmap.md`, `feedback-mvp-floor.md`.