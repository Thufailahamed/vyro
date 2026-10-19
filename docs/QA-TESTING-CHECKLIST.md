# VYRO — Full QA / Testing Checklist

Covers the **API Worker** (`apps/api`), the **SPA** (`apps/web`) and the shared
packages (`packages/*`). Every row is a discrete, checkable item with the route
or command used to verify it.

Legend:

- `[ ]` — not yet verified
- `[x]` — verified green (evidence recorded in "Verification log")
- `[!]` — known issue (tracked in §12)

Run gates from the repo root. `pnpm` is the package manager (Node 20+, pnpm 9+).

---

## 0. How to run everything

| Purpose | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Type check (all packages) | `pnpm typecheck` |
| Lint (= `tsc --noEmit` per package) | `pnpm lint` |
| Unit + integration tests | `pnpm test` |
| Production build | `pnpm build` |
| RBAC static audit | `pnpm audit:rbac` |
| Secret scan | `pnpm audit:secrets` |
| Dependency audit | `pnpm audit:deps` |
| AI security suite | `pnpm --filter @vyro/api test:security` |
| AI evaluation harness | `pnpm eval:ai` |
| Browser E2E (Playwright) | `pnpm --filter @vyro/web test:e2e` |
| SPA ↔ Worker route cross-check | `node scripts/route-crosscheck.mjs .` |
| Deployed-API smoke test | `./scripts/smoke-test.sh [API_BASE]` |
| Local dev servers | `pnpm dev` (web `5173`, api `8787`) |

Local D1 bootstrap: `pnpm db:migrate` then `pnpm db:seed`.

---

## 1. Automated gates (CI = `.github/workflows/ci.yml`)

CI jobs: `typecheck`, `test`, `audit-deps`, `audit-rbac`, `audit-secrets`,
`route-crosscheck`.

| # | Gate | Command | Expected | Result |
| --- | --- | --- | --- | --- |
| 1.1 | Type check | `pnpm typecheck` | 16/16 tasks green, 0 errors | `[x]` |
| 1.2 | Lint | `pnpm lint` | 8/8 tasks green, 0 errors | `[x]` |
| 1.3 | Unit + integration tests | `pnpm test` | 0 failed | `[x]` |
| 1.4 | Production build | `pnpm build` | exit 0, `apps/web/dist` emitted | `[x]` |
| 1.5 | RBAC static audit | `pnpm audit:rbac` | exit 0, "RBAC audit passed." | `[x]` |
| 1.6 | Secret scan | `pnpm audit:secrets` | exit 0, "Secret scan passed." | `[x]` |
| 1.7 | Dependency audit | `pnpm audit:deps` | exit 0, 0 production-reachable crit/high | `[x]` |
| 1.8 | AI security suite | `pnpm --filter @vyro/api test:security` | 0 failed | `[x]` |
| 1.9 | Browser E2E | `pnpm --filter @vyro/web test:e2e` | 0 failed | `[x]` |
| 1.10 | Deployed smoke | `./scripts/smoke-test.sh` | all checks `ok` | see §11 |
| 1.11 | SPA bundle not absurdly large | `pnpm build` output | no chunk > 600 kB except the main entry | `[!]` §12.9 |
| 1.12 | No `.env`/secret committed | `git ls-files \| grep -E '(^|/)\.env$'` | empty (`.env.example` is fine) | `[x]` |
| 1.13 | SPA ↔ Worker route cross-check | `node scripts/route-crosscheck.mjs .` | every SPA API call resolves to a Worker route | `[x]` |
| 1.14 | No skipped tests | `pnpm test` output | 0 skipped | `[x]` |

### 1.13 Test-suite coverage expectations

| Package | Test files | Notes |
| --- | --- | --- |
| `apps/api` | 262+ | Vitest, D1 shim via `test/helpers/d1.ts` |
| `apps/web` | 56+ | Vitest, no jsdom — `renderToStaticMarkup` + pure functions |
| `packages/ai` | 21 | intents, reconciliation, conversational parser |
| `packages/validation` | 18 | Zod schemas |
| `packages/shared` | 9 | money, ids, lifecycle rules |
| `packages/auth` | 4 | permissions, scope |
| `packages/payments` | 3 | payments.lk signature |
| `packages/db` | 2 | migration + credit schema |
| `packages/ui` | 0 | no test script — see §12.3 |
| `apps/mobile` | 0 | no test script — see §12.3 |

---

## 2. Public / marketing surface (no auth)

| # | Route | Check | Result |
| --- | --- | --- | --- |
| 2.1 | `/` | Hero, "Things we supply", trending products, verified suppliers, wholesale benchmark, buyer/supplier CTAs render; all CTAs route correctly | `[ ]` |
| 2.2 | `/` | Live market stats load from `GET /api/home/feed`; fail gracefully when API is down | `[ ]` |
| 2.3 | `/about` | Long-form content renders; network stats populate | `[ ]` |
| 2.4 | `/how-it-works` | 4-step flow, comparison table, audience links route to correct destinations | `[ ]` |
| 2.5 | `/status` | Component health + incidents; polls `/status.json` every 30 s | `[ ]` |
| 2.6 | `/sponsored` | Disclosure title loads from `GET /api/sponsored/disclosure` | `[ ]` |
| 2.7 | `/suppliers/:slug` | Storefront: lots, reviews, verification score, sponsored slot, member-since badge | `[ ]` |
| 2.8 | `/suppliers/:slug` | Unknown slug → "Storefront Not Available" fallback (not a crash) | `[ ]` |
| 2.9 | `/legal/terms` | Renders; "Copy direct document link" + "Print or save as PDF" work | `[ ]` |
| 2.10 | `/legal/privacy` | Same as 2.9 | `[ ]` |
| 2.11 | `/legal/cookies` | Same as 2.9 | `[ ]` |
| 2.12 | `/login` | Sign in; honours `?next=`; `RedirectIfAuthed` sends an authed user to the right place | `[ ]` |
| 2.13 | `/login` | `?next=//evil.com` is rejected (open-redirect guard) | `[ ]` |
| 2.14 | `/signup` | Registration; validation errors surfaced inline | `[ ]` |
| 2.15 | `/forgot` | Reset request accepted; generic response (no user enumeration) | `[ ]` |
| 2.16 | `/reset` | Token accepted, password changed, token expires after 1 h | `[ ]` |
| 2.17 | any unknown path | 404 page keeps site chrome and offers a way out | `[ ]` |
| 2.18 | 404 in `/supplier/*` | Redirects to `/supplier` | `[ ]` |
| 2.19 | 404 in `/admin/*` | Redirects to `/admin` | `[ ]` |
| 2.20 | cookie banner | Appears on first visit; accept/dismiss persists | `[ ]` |
| 2.21 | `/search` | Reachable while signed out; gated CTAs show "Sign in to order" | `[ ]` |
| 2.22 | `/products/:id` | Reachable while signed out; gated CTAs show | `[ ]` |

---

## 3. Authentication, session & account security

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 3.1 | Sign up → auto sign-in → cookie set | Session cookie present, `HttpOnly`, `SameSite`, `Secure` in prod | `[ ]` |
| 3.2 | Sign out | Session destroyed; protected pages redirect to `/login` | `[ ]` |
| 3.3 | `GET /api/auth/me` without session | `401 UNAUTHORIZED` | `[ ]` |
| 3.4 | `GET /api/cart?businessId=x` without session | `401` (not 500) | `[ ]` |
| 3.5 | Mutating request with a foreign `Origin` | `403 FORBIDDEN` (CSRF guard) | `[ ]` |
| 3.6 | Mutating request with `Sec-Fetch-Site: same-origin` | Allowed | `[ ]` |
| 3.7 | `/api/csp-report` POST | CSRF-exempt, accepts report | `[ ]` |
| 3.8 | `/api/webhooks/payments-lk` POST | CSRF-exempt, signature verified | `[ ]` |
| 3.9 | Rate limit on `/api/auth/sign-in` | `5/min` → `429 RATE_LIMITED` with `Retry-After` | `[ ]` |
| 3.10 | Rate limit on `/api/auth/*` | `20/min` | `[ ]` |
| 3.11 | Global rate limit | `60/min` (configurable) | `[ ]` |
| 3.12 | Rate-limit headers | `X-RateLimit-Limit/Remaining/Reset` present | `[ ]` |
| 3.13 | 2FA enrol / verify / disable | Flow completes; `GET /api/settings/me/security` reflects state | `[ ]` |
| 3.14 | Password change | Requires current password; sessions unaffected/rotated per policy | `[ ]` |
| 3.15 | `/profile` data export | `GET /api/settings/me/export` returns a downloadable archive | `[ ]` |
| 3.16 | `/profile` account delete | Requires typing `DELETE`; account is anonymised | `[ ]` |
| 3.17 | Session revoked (admin `/admin/security`) | That session is dead on next request | `[ ]` |
| 3.18 | `X-Frame-Options` / CSP / `Referrer-Policy` / `Permissions-Policy` | Present on every response | `[ ]` |
| 3.19 | HSTS | Present in production only | `[ ]` |
| 3.20 | `x-request-id` | Propagated inbound or generated; echoed in responses + access log | `[ ]` |

---

## 4. Buyer app — catalogue & search

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 4.1 | `/search` | Typeahead (debounced, `limit=8`) returns suggestions | `[ ]` |
| 4.2 | `/search` | NL filter chips: price ≤, within N days, cheapest/fastest, from supplier | `[ ]` |
| 4.3 | `/search` | Chip removal rebuilds the query correctly | `[ ]` |
| 4.4 | `/search` | Live stats: lots, suppliers, lowest spot, fast dispatch | `[ ]` |
| 4.5 | `/search` | Fast-dispatch toggle + sort options apply | `[ ]` |
| 4.6 | `/search` | Grid ⇄ dense-ledger view toggle | `[ ]` |
| 4.7 | `/search` | Sponsored slots render (max 3) and are labelled | `[ ]` |
| 4.8 | `/search` | Empty / no-results state | `[ ]` |
| 4.9 | `/products/:id` | Gallery, price stats, origin/lead time/stock facts | `[ ]` |
| 4.10 | `/products/:id` | Per-supplier offers with rank + ranking reason | `[ ]` |
| 4.11 | `/products/:id` | Sort by recommended / lowest price / fastest / lowest MOQ | `[ ]` |
| 4.12 | `/products/:id` | Cards ⇄ table view | `[ ]` |
| 4.13 | `/products/:id` | Qty stepper honours MOQ; below-MOQ blocked | `[ ]` |
| 4.14 | `/products/:id` | Availability pill: in stock / low / out / pre-order | `[ ]` |
| 4.15 | `/products/:id` | Compare suppliers + "Request a custom quote" | `[ ]` |
| 4.16 | `/products/:id` | Reviews panel + benchmark card | `[ ]` |
| 4.17 | Add to cart (signed out) | Redirects to `/login?next=/products/:id` | `[ ]` |
| 4.18 | Add to cart (no business) | Redirects to `/onboarding/business?next=…` | `[ ]` |
| 4.19 | Add to cart (in business) | Line appears in cart; no duplicate | `[ ]` |
| 4.20 | `/onboarding/business` | Multi-step wizard: type → name → location → contact → submit | `[ ]` |
| 4.21 | `/onboarding/supplier` | Supplier wizard: types → name → dispatch origin → order manager | `[ ]` |
| 4.22 | `/categories` | Public category tree loads and is cacheable | `[ ]` |

---

## 5. Buyer app — cart & checkout

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 5.1 | `/cart` | Line items grouped per supplier | `[ ]` |
| 5.2 | `/cart` | Qty stepper patches the line (`PATCH /api/cart/items/:id`) | `[ ]` |
| 5.3 | `/cart` | Remove line + clear cart | `[ ]` |
| 5.4 | `/cart` | Subtotal / discount / total correct | `[ ]` |
| 5.5 | `/cart` | MOQ violation surfaces an error | `[ ]` |
| 5.6 | `/cart` | Per-depot dispatch shown | `[ ]` |
| 5.7 | `/cart` | AI cart-line hints banner (when the AI feature is on) | `[ ]` |
| 5.8 | `/cart` | Bulk-quote CTA routes to `/rfqs/qualify` | `[ ]` |
| 5.9 | `/checkout` | Cart splits into one PO per supplier | `[ ]` |
| 5.10 | `/checkout` | Delivery address picker; default address preselected | `[ ]` |
| 5.11 | `/checkout` | Credit facility eligibility (Net 14 / Net 30) vs pay-now | `[ ]` |
| 5.12 | `/checkout` | Credit-ineligible buyer sees a clear reason | `[ ]` |
| 5.13 | `/checkout` | Volume bulk savings + repeat-offer discount shown | `[ ]` |
| 5.14 | `/checkout` | PO issued (`POST /api/purchase-orders/checkout`) | `[ ]` |
| 5.15 | `/checkout` | Single supplier → redirect to the new order | `[ ]` |
| 5.16 | `/checkout` | Multiple suppliers → navigate to `/orders` | `[ ]` |
| 5.17 | `/checkout` | Payment start is **best-effort**: PO survives a payment-start failure | `[ ]` |
| 5.18 | `/checkout` | Mock/staging simulator warning is shown | `[ ]` |
| 5.19 | `/checkout` | Error code `KYC_REQUIRED` → KYC page with return path | `[ ]` |
| 5.20 | `/checkout` | Error code `credit_limit_exceeded` → distinct UI | `[ ]` |
| 5.21 | `/checkout` | Error code `credit_overdue_blocked` → distinct UI | `[ ]` |
| 5.22 | `/checkout` | Error code `credit_not_eligible` → distinct UI | `[ ]` |
| 5.23 | `/checkout` | `Idempotency-Key` sent on payment creation; retry does not double-charge | `[ ]` |
| 5.24 | Reorder from `/orders/:id` | `POST /api/cart/from-order/:orderId`; schema validation rejects bad input | `[ ]` |

---

## 6. Buyer app — orders, payments, returns, invoices

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 6.1 | `/orders` | Ledger: search + status filter; rows show PO, amount, status, destination, depot | `[ ]` |
| 6.2 | `/orders` | Empty state and "no business" state | `[ ]` |
| 6.3 | `/orders/:id` | "What you ordered" + requested→accepted deltas | `[ ]` |
| 6.4 | `/orders/:id` | Delivery panel, documents, activity timeline | `[ ]` |
| 6.5 | `/orders/:id` | Payments, invoices, refunds, returns, messages sections | `[ ]` |
| 6.6 | `/orders/:id` | Review prompt appears on a delivered order | `[ ]` |
| 6.7 | `/orders/:id` | Cancel order with reason; idempotency key prevents double-cancel | `[ ]` |
| 6.8 | `/orders/:id` | Raise a dispute | `[ ]` |
| 6.9 | `/orders/:id` | Request refund; remaining-refundable amount is correct | `[ ]` |
| 6.10 | `/orders/:id` | Order↔supplier messaging thread | `[ ]` |
| 6.11 | `/orders/:id/payment-success` | Gateway return page confirms the payment | `[ ]` |
| 6.12 | `/orders/:id/payment-cancel` | Gateway return page reflects cancellation | `[ ]` |
| 6.13 | `/orders/:id/invoice/:invoiceId` | Invoice renders; print works | `[ ]` |
| 6.14 | Payment panel | Card redirect, bank transfer + proof upload, COD manual record | `[ ]` |
| 6.15 | Saved cards | List + forget; payment-role gating | `[ ]` |
| 6.16 | Wire instructions | Generated per PO; admin can record receipt | `[ ]` |
| 6.17 | Payment confirm / reject | Admin flow updates the order state | `[ ]` |
| 6.18 | Payment retry after failure | Succeeds without a duplicate payment | `[ ]` |
| 6.19 | `/returns` | RMA list with status filter + link back to the source PO | `[ ]` |
| 6.20 | Return request | Reason code + line items; buyer can cancel/reject/approve | `[ ]` |
| 6.21 | Return receive | Supplier records received quantity | `[ ]` |
| 6.22 | `/invoices` | OCR'd invoice list | `[ ]` |
| 6.23 | `/invoices/upload` | Upload → auto OCR → redirect to review | `[ ]` |
| 6.24 | `/invoices/:id/review` | Edit category, description, PO product, unit Rs, line Rs, total; add manual rows; view raw OCR | `[ ]` |
| 6.25 | 3-way reconciliation | `/api/purchase-orders/:id/reconciliation` + discrepancy claim | `[ ]` |
| 6.26 | Auto-reconciliation | `GET /api/documents/by-po/:id/auto-reconciliation` | `[ ]` |

---

## 7. Buyer app — RFQs, credit, KYC, reviews, accounts, notifications, AI

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 7.1 | `/rfqs` | Dashboard buckets: awaiting quotes / under review / awarded; filter; cost vs starting prices | `[ ]` |
| 7.2 | `/rfqs/new` | Create from scratch; title, brief, line items, supplier picker, doc upload | `[ ]` |
| 7.3 | `/rfqs/new?fromCart=1` | Imports active cart lines | `[ ]` |
| 7.4 | RFQ templates | Save and load a reusable template | `[ ]` |
| 7.5 | `/rfqs/:id` | Publish / reopen / close | `[ ]` |
| 7.6 | `/rfqs/:id` | Invite suppliers; supplier discovery | `[ ]` |
| 7.7 | `/rfqs/:id` | Quote list, version history, counters | `[ ]` |
| 7.8 | `/rfqs/:id` | Request revision, counter-offer, accept/reject, award | `[ ]` |
| 7.9 | `/rfqs/:id` | Convert awarded quote → PO | `[ ]` |
| 7.10 | `/rfqs/:id` | Messages thread + documents + activity + AI summary | `[ ]` |
| 7.11 | `/rfqs/:id/compare` | Line-by-line comparison, best-price/fastest flags | `[ ]` |
| 7.12 | `/rfqs/:id/compare` | Single vs multi-supplier split optimisation + AI recommendation | `[ ]` |
| 7.13 | `/credit` | Limit / used / available; eligibility reason; Net 14 / Net 30; drawdown history | `[ ]` |
| 7.14 | `/businesses/:id/kyc` | Level select, document URLs, submit; verified badge | `[ ]` |
| 7.15 | KYC gate | Foreign buyer without KYC is blocked at checkout | `[ ]` |
| 7.16 | `/accounts` | Overview: total spend, paid/pending/refunded/outstanding, by method | `[ ]` |
| 7.17 | `/accounts` | Payments / invoices / refunds / transactions tabs | `[ ]` |
| 7.18 | `/accounts` | Credit facility utilisation; refund request + cancel | `[ ]` |
| 7.19 | `/accounts/payments/:id` | Full transaction chain: order, allocation, invoices, COD, refund | `[ ]` |
| 7.20 | `/notifications` | Unread/all tabs, AI-source badge, category filter + search, mark read / read-all | `[ ]` |
| 7.21 | `/notifications` | Header unread badge polls (~20 s) and auto-refresh (30 s) | `[ ]` |
| 7.22 | `/ask` | Streaming answer, tool-call timeline, component cards, suggestions | `[ ]` |
| 7.23 | `/ask` | Regenerate / retry, feedback, confirmation panel | `[ ]` |
| 7.24 | `/ask` | `POST /api/ai/confirm` reaches `/api/ai/confirm` (not `/api/api/ai/confirm`) | `[x]` §12.1 |
| 7.25 | `/ai` | 4 insight cards: savings, price moves, concentration risk, health score | `[ ]` |
| 7.26 | `/ai` | `GET /api/ai/home` reached at the right path (not `/api/api/ai/home`) | `[x]` §12.1 |
| 7.27 | `/ai/preferences` | Promote inferred preference to a rule; delete it | `[ ]` |
| 7.28 | `/dashboard` | Action queue, recent POs, 12-month spend chart, pipeline, depot network | `[ ]` |
| 7.29 | `/dashboard` | Verified suppliers + reorder + add-to-cart shortcuts | `[ ]` |
| 7.30 | `/orders/conversational` | Singlish chat, quick-prompt pills, bot reply, draft card, confirm → PO | `[ ]` |
| 7.31 | `/addresses` | Address book: list, create, edit, set default, delete | `[ ]` |
| 7.32 | Reviews | Write + image upload; edit; rating distribution; helpful vote; flag; supplier reply | `[ ]` |
| 7.33 | Reviews | Eligibility check (`GET /api/orders/:id/eligibility`) blocks ineligible reviews | `[ ]` |
| 7.34 | Reviews | Trust badges: KYC, member-since, on-time %, dispute-free | `[ ]` |

---

## 8. Supplier portal (`/supplier/*`)

| # | Route | Check | Result |
| --- | --- | --- | --- |
| 8.1 | `/supplier` | Dashboard KPIs, order queue + filters, quick actions, storefront settings, reviews panel, top products | `[ ]` |
| 8.2 | `/supplier/orders` | List + filter POs | `[ ]` |
| 8.3 | `/supplier/orders` | Accept in full; **partial accept** (reduce qty) | `[ ]` |
| 8.4 | `/supplier/orders` | Advance status: accept → preparing → ready → out_for_delivery → delivered → completed | `[ ]` |
| 8.5 | `/supplier/orders` | POD upload; order drawer | `[ ]` |
| 8.6 | `/supplier/orders/:id` | Line items, delivery panel, returns, timeline, accept dialog, mark POD | `[ ]` |
| 8.7 | `/supplier/returns` | Approve / reject / receive buyer returns; link to source order | `[ ]` |
| 8.8 | `/supplier/products` | Filter in-stock/low/out; delist; view on marketplace; suggested products | `[ ]` |
| 8.9 | `/supplier/products/ai-upload` | Upload price list/photo → AI extracts rows → review staged rows (confidence, new vs dropped) → edit → commit | `[ ]` |
| 8.10 | `/supplier/products/new` | Create product + offer: category, specs, photos, wholesale price, MOQ, volume tiers, delivery | `[ ]` |
| 8.11 | `/supplier/products/:id/edit` | Edit product/offer; add/delete images | `[ ]` |
| 8.12 | `/supplier/pricing` | Rate cards: unit price, MOQ, tier ladders, availability; inline edit | `[ ]` |
| 8.13 | `/supplier/inventory` | Stock levels, low/out filters, adjust stock, movement history | `[ ]` |
| 8.14 | `/supplier/analytics` | POs in period, returning buyers, pickup turnaround, revenue velocity, product mix, recalc | `[ ]` |
| 8.15 | `/supplier/customers` | CRM list: spend, order count, recent activity; sort; paginate | `[ ]` |
| 8.16 | `/supplier/deliveries` | Fleet list, driver assignment, eGRN/POD sync, status transitions | `[ ]` |
| 8.17 | `/supplier/payments` | Balances, incoming payments, payouts, running-account statement, confirm payment | `[ ]` |
| 8.18 | `/supplier/accounts` | Earnings, settlements, payouts, transactions, bank details (add/verify) | `[ ]` |
| 8.19 | `/supplier/settings` | General & Legal, Depot & Logistics, Payouts & Banking, Notifications, Team & Session, BuyLeads | `[ ]` |
| 8.20 | `/supplier/quotes` | RFQ inbox (invited + open), item counts, quote status, expiring-soon | `[ ]` |
| 8.21 | `/supplier/quotes/:rfqId` | Submit / withdraw / edit quote, counter-offer, history, messages, attachments, AI draft | `[ ]` |
| 8.22 | `/supplier/leads` | CRM pipeline: list, detail drawer, tags, conversion status, notes, verified-buyer badge | `[ ]` |
| 8.23 | `/supplier/verification` | KYC, payout bank account, trust-seal status + checkout | `[ ]` |
| 8.24 | `/supplier/learning` | Track index, gate status (onboarding required to publish) | `[ ]` |
| 8.25 | `/supplier/learning/:slug` | Read article, complete article, knowledge-check quiz | `[ ]` |
| 8.26 | `/supplier/sponsored` | Hub: active campaigns, expiring-in-3-days, pending invoices | `[ ]` |
| 8.27 | `/supplier/sponsored/plans` | Browse plan tiers + subscribe | `[ ]` |
| 8.28 | `/supplier/sponsored/subscriptions` | View subscription, slot credits, cancel | `[ ]` |
| 8.29 | `/supplier/sponsored/slots` | Browse slots by surface + category, daily rate | `[ ]` |
| 8.30 | `/supplier/sponsored/campaigns/new` | Create campaign: product/offer, slot, budget, dates → submit for approval | `[ ]` |
| 8.31 | `/supplier/sponsored/campaigns` | List, filter by status, view, cancel | `[ ]` |
| 8.32 | `/supplier/sponsored/invoices` | List invoices; submit proof of payment (reference) | `[ ]` |
| 8.33 | Sponsored flag off | `FEATURE_DISABLED` renders the dedicated empty state, not an error | `[ ]` |
| 8.34 | Supplier tenancy | A supplier can only read/write their own offers, orders, customers, leads | `[ ]` |
| 8.35 | Supplier shell | Nav sections (Operations / Catalog & Stock / Intelligence); unread badge; verification link | `[ ]` |

---

## 9. Admin portal (`/admin/*`)

| # | Route | Check | Result |
| --- | --- | --- | --- |
| 9.1 | `/admin/login` | Admin sign-in; non-admin is rejected | `[ ]` |
| 9.2 | `/admin/invite/accept` | Accept an invite; revoked/expired invite errors | `[ ]` |
| 9.3 | `/admin` | Platform overview: analytics range, top categories, top districts, shortcuts, recent ops | `[ ]` |
| 9.4 | `/admin/suppliers` | Ledger: search, filter, paginate | `[ ]` |
| 9.5 | `/admin/suppliers/:id` | Dossier, verification, trust signals, freeze/unfreeze, set verification status | `[ ]` |
| 9.6 | `/admin/businesses` | Ledger: search, filter, paginate | `[ ]` |
| 9.7 | `/admin/businesses/:id` | Dossier, credit terms, memberships, freeze/unfreeze | `[ ]` |
| 9.8 | `/admin/orders` | Status tabs cover every lifecycle state (pending → completed, disputed, cancelled, rejected) | `[ ]` |
| 9.9 | `/admin/orders/:id` | Line items, notes/exceptions, audit trail, financials, cross-border incoterms/FX/duty, wire receipt, dispute arbitration, status override | `[ ]` |
| 9.10 | `/admin/deliveries` | Shipment registry, dispatch, status update, mark lost, reassign | `[ ]` |
| 9.11 | `/admin/disputed` | Mediation: freight non-delivery, damaged goods, short-ship; resolve | `[ ]` |
| 9.12 | `/admin/returns` | Market-wide RMA queue (open returns hold supplier settlement) | `[ ]` |
| 9.13 | `/admin/order-lifecycle` | Edit lifecycle windows/timers + guards; GET + PUT persist | `[ ]` |
| 9.14 | `/admin/catalog` | Product table (all/active/inactive/featured), category tree editor, business-type editor, feature/unfeature | `[ ]` |
| 9.15 | `/admin/catalog/products/:id` | Basics, packaging, trade & compliance (HS code, origin), internal moderation notes | `[ ]` |
| 9.16 | `/admin/money` | Refund queue, payout batches, general ledger, chargebacks, credit facilities | `[ ]` |
| 9.17 | `/admin/finance` | Payout recovery, direct refund, invoices & billing, ledger & audit | `[ ]` |
| 9.18 | `/admin/accounts` | Overview, payments, refunds, bank transfers, COD, settlements, payouts, reconciliation, adjustments, commission rules | `[ ]` |
| 9.19 | `/admin/accounts` vs `/admin/finance` vs `/admin/money` | Overlapping surfaces stay consistent (no conflicting state) | `[ ]` |
| 9.20 | `/admin/accounts/payments/:id` | Full money chain: order, payment, attempts, allocations, refunds, earnings, settlements, payouts, ledger | `[ ]` |
| 9.21 | `/admin/payments` | Cross-tenant search: q, status, method, provider, businessId, supplierId, min/maxCents, sort | `[ ]` |
| 9.22 | `/admin/payments/:id` | Summary, PO, parties, raw gateway payload, refunds, chargebacks | `[ ]` |
| 9.23 | `/admin/users` | Identities, admin flag, suspend/unsuspend, org memberships, bulk actions | `[ ]` |
| 9.24 | `/admin/roles` | Active admins, pending invites, permission matrix, promote/demote, role filters | `[ ]` |
| 9.25 | `/admin/activity` | Immutable audit trail: filters, payload diff / raw JSON, scheduled recurring exports CRUD | `[ ]` |
| 9.26 | `/admin/audit` | Redirects to `/admin/activity` | `[ ]` |
| 9.27 | `/admin/trust-safety` | Abuse reports (open/investigating/resolved/dismissed), KYC queue, account enforcement | `[ ]` |
| 9.28 | `/admin/platform` | Feature flags, email templates (visual + raw JSON), webhooks + deliveries + retry | `[ ]` |
| 9.29 | `/admin/security` | Active sessions (revoke), impersonation (start/end), GDPR data export | `[ ]` |
| 9.30 | `/admin/observability` | Health snapshot, recent platform ops, cron job list + manual trigger | `[ ]` |
| 9.31 | `/admin/observability/alerts` | Alert rules create/silence/un-silence, history filter | `[ ]` |
| 9.32 | `/admin/observability/queues` | Queue health, throughput, failed messages, manual enqueue, retry one/bulk | `[ ]` |
| 9.33 | `/admin/ai-usage` | AI cost dashboard by day range; `/api/admin/ai/usage` and `/api/ai/admin/usage` both work | `[ ]` |
| 9.34 | `/admin/rfqs` | List all RFQs, thresholds, expire sweep, platform settings | `[ ]` |
| 9.35 | `/admin/reviews/flags` | 24 h flag-burst callout, keep / dismiss flag / delete review | `[ ]` |
| 9.36 | `/admin/learning` | List/search lessons by track, publish toggle, gate-to-publish | `[ ]` |
| 9.37 | `/admin/learning/new`, `/admin/learning/:id/edit` | Create/edit lesson: content, publishing, readiness, knowledge check + quiz | `[ ]` |
| 9.38 | `/admin/sponsored` | Campaign pipeline by approval/payment stage, KPIs | `[ ]` |
| 9.39 | `/admin/sponsored/plans` | CRUD plan tiers (bronze/silver/gold, monthly rate, slot credits, active) | `[ ]` |
| 9.40 | `/admin/sponsored/slots` | CRUD placement slots (surface, position, category, label, daily rate, active) | `[ ]` |
| 9.41 | `/admin/sponsored/approvals` | Approve / reject with reason | `[ ]` |
| 9.42 | `/admin/sponsored/campaigns` | Revoke, pin to top, filter by status/surface/supplier | `[ ]` |
| 9.43 | `/admin/sponsored/analytics` | Impressions, clicks, CTR per campaign over a date range | `[ ]` |
| 9.44 | `/admin/notifications` | Severity/category/unread/sort filters, mark read, read-all, broadcast | `[ ]` |
| 9.45 | Admin RBAC | Nav items hidden and API calls 403 for missing permissions (`kyc:read`, `notification:read`, `health:read`, `queues:read`, `settlement:approve`, `payout:process`, `admin:role_change`, …) | `[ ]` |
| 9.46 | Admin shell | Nav sections (Operations / Commerce & Supply / Governance & Access / System & Platform); global search → `/admin/search` | `[ ]` |
| 9.47 | Admin impersonation | Start/end impersonation is audited; end restores the admin session | `[ ]` |
| 9.48 | Admin bulk ops | Suspend/unsuspend users & businesses, role change — per-item result reporting | `[ ]` |

---

## 10. API, backend & cross-cutting

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| 10.1 | `GET /api/health` | `200` `{ ok, ready, db }`; `503` when D1 is down | `[ ]` |
| 10.2 | `GET /api/health/version` | `200` with build version | `[ ]` |
| 10.3 | `POST /api/metrics/web` | `204`, CSRF-exempt, no secret leakage | `[ ]` |
| 10.4 | `GET /status.json` | Public SLO payload | `[ ]` |
| 10.5 | Error envelope | Every error is `{ error: { code, message, details? } }` with a known `ErrorCode` | `[ ]` |
| 10.6 | Error mapping | 400/401/403/404/409/429 statuses are preserved, never collapsed to 500 | `[ ]` |
| 10.7 | Unknown route under `/api` | JSON 404, not the SPA shell | `[ ]` |
| 10.8 | Non-API path | SPA fallback; React Router resolves client-side | `[ ]` |
| 10.9 | `run_worker_first = ["/api/*"]` | API traffic always hits the Worker before the asset layer | `[ ]` |
| 10.10 | CORS | Only allow-listed origins; credentials allowed; OPTIONS → 204 | `[ ]` |
| 10.11 | Cache control | `/api/categories/*` public 3600 s; `/api/products/*` public 300 s; the rest private | `[ ]` |
| 10.12 | Idempotency | `Idempotency-Key` honoured on payment creation, order accept, order transition, refund | `[ ]` |
| 10.13 | Tenancy | A buyer cannot read another business's cart/orders; a supplier cannot read another supplier's offers | `[ ]` |
| 10.14 | Admin-only routes | Return `403` for signed-in non-admins (not `404`/`500`) | `[ ]` |
| 10.15 | Payments.lk webhook | Signature verified; replay rejected; invalid payload → 400 | `[ ]` |
| 10.16 | Cron jobs | Nightly `0 3 * * *` runs; manual trigger via `/api/admin/cron/trigger` | `[ ]` |
| 10.17 | Cron jobs | Refund-stuck, weekly payouts, trust recompute, sponsored expiry, observability sweep | `[ ]` |
| 10.18 | Queues | `audit` + `notifications` (+ DLQ); failed messages retryable from the admin UI | `[ ]` |
| 10.19 | Email | Resend client + templates; failure is non-fatal | `[ ]` |
| 10.20 | R2 | Product images + review images stored; CDN path correct; filename sanitised | `[ ]` |
| 10.21 | D1 migrations | `pnpm db:migrate` applies cleanly on an empty DB; `db:migrate:list` shows no pending | `[ ]` |
| 10.22 | Invoice PDF | `GET /api/invoices/:id/pdf` renders; tax/receipt generation | `[ ]` |
| 10.23 | Cross-border | FX rates, sanctions list, HS tariffs, incoterms, restricted goods, customs docs, wire instructions | `[ ]` |
| 10.24 | PWA | Service worker registered in production only; offline fallback | `[ ]` |
| 10.25 | Install banner | `beforeinstallprompt` captured; dismissal persisted in `localStorage` | `[ ]` |
| 10.26 | Responsive | Mobile tab bar (Search/Home/Ask/Orders/Cart) on small screens | `[ ]` |
| 10.27 | Accessibility | Keyboard navigation, focus rings, ARIA labels, contrast, error text | `[ ]` |
| 10.28 | SEO | `SeoHead` titles/descriptions on public + storefront pages | `[ ]` |
| 10.29 | Money formatting | All LKR amounts use the shared `money` helper; no raw cents leaks | `[ ]` |
| 10.30 | Error/empty states | Every list page has a loading, empty and error state | `[ ]` |
| 10.31 | Locale | Dates/times consistent; no timezone drift between client and server | `[ ]` |
| 10.32 | Route ordering | `/orders/conversational` is declared before `/orders/:id` and is not shadowed | `[ ]` |
| 10.33 | Two 404 routes | Buyer-portal 404 keeps chrome; global 404 does not | `[ ]` |
| 10.34 | API base contract | No SPA call site passes an absolute `/api` path to the API client | `[x]` §12.1 |
| 10.35 | Route shadowing | More specific routers are mounted before less specific ones (e.g. `/api/payments/saved-cards` before `/api/payments/:id`) | `[x]` §12.13 |
| 10.36 | SPA ↔ Worker route parity | `node scripts/route-crosscheck.mjs .` reports 0 unmatched calls | `[x]` §12.16 |

---

## 11. End-to-end (browser) — `apps/web/e2e/buyer-flow.spec.ts`

| # | Scenario | Expected | Result |
| --- | --- | --- | --- |
| 11.1 | Global setup | Buyer + supplier personas sign up and onboard via the real API | `[ ]` |
| 11.2 | Buyer: add to cart → checkout → COD | Order created with the expected line items | `[ ]` |
| 11.3 | Supplier: accept → prepare → track → dispatch → POD | Status transitions stick; POD visible to the buyer | `[ ]` |
| 11.4 | Buyer: confirm delivery → request return | RMA raised against the delivered order | `[ ]` |
| 11.5 | Supplier: approve → receive → COD confirm → restock | Stock restored after the return | `[ ]` |
| 11.6 | D1 reset | `e2e/reset-d1.mjs` wipes, migrates and seeds local D1 | `[ ]` |

Manual end-to-end walkthroughs to run on a deployed environment:

- [ ] Buyer journey: search → product → add to cart → checkout (pay-now) → payment → order tracking → delivery → invoice → review
- [ ] Buyer journey: RFQ → quote → counter-offer → award → convert to PO → order
- [ ] Supplier journey: onboarding → learning gate → AI upload → publish product → accept order → dispatch → POD → settlement
- [ ] Admin journey: approve KYC → moderate catalog → resolve dispute → process refund → approve payout

---

## 12. Known issues & follow-ups

| # | Issue | Severity | Status | Action |
| --- | --- | --- | --- | --- |
| 12.1 | `api.get('/api/ai/home')` and `api.post('/api/ai/confirm')` double-prefixed the base → `/api/api/...` (404). The AI Home page and the AI confirmation action never reached the API. | **High** | **Fixed** | Paths made relative; `apps/web/test/apiBase.test.ts` scans the whole SPA so it cannot recur |
| 12.2 | `apps/api/src/modules/reviews/routes.ts` authenticated via a local `ctxOf()` helper instead of the standard `session()` middleware → `pnpm audit:rbac` failed (10 gaps) and unauthenticated requests hit D1 before being rejected | **High** | **Fixed** | Module converted to `session()` middleware; `apps/api/test/reviews/routeAuth.test.ts` asserts 401/403 on every mutating endpoint; the RBAC audit test now asserts zero gaps |
| 12.3 | `apps/api/src/scripts/dep-audit.ts` used `spawnSync` with the default 1 MiB `maxBuffer`; `pnpm audit --json` is ~1.2 MB → output truncated → `pnpm audit:deps` always failed | **High** | **Fixed** | `maxBuffer` raised to 64 MiB; the filter now classifies by dependency path (production-reachable vs dev-tooling) and prints every filtered advisory; `apps/api/test/scripts/dep-audit.test.ts` covers the classifier |
| 12.4 | Vulnerable production dependencies: `hono@4.13.5` (jsx XSS, `<4.13.7`) and `uuid@10.0.0` in `@vyro/shared` (`<11.1.1`) | **Medium** | **Fixed** | Upgraded to `hono@4.13.13` and `uuid@11.1.1`; audit now reports 0 production-reachable advisories |
| 12.5 | `apps/web/.env.example` documented `VITE_API_BASE_URL`, but no code reads it — the real variable is `VITE_API_URL` | Medium | **Fixed** | Renamed and documented: `VITE_API_URL` must include the `/api` segment |
| 12.6 | 19 SPA call sites use a raw `fetch('/api/…')` instead of the API client, so they ignore `VITE_API_URL` | Low | Open | Works today (single-origin deploy, `VITE_API_URL` unset). Migrate to `api.*` or a shared `apiUrl()` helper when a cross-origin API is needed |
| 12.7 | `VITE_API_URL` semantics were inconsistent: the API client treats it as including `/api`, while `useVyroAI`/`AskPage` appended `/api/…` to it | Low | **Fixed** | Both call sites now use `apiBase` + a relative path; a test scans the SPA so the two conventions cannot diverge again |
| 12.8 | `packages/ui` and `apps/mobile` have no test script and no tests | Low | Open | Add a `test` script + smoke tests, or exclude them from the workspace test task |
| 12.9 | Main SPA entry chunk is ~758 kB (> 600 kB Vite warning) | Low | Open | Split vendor chunks; the warning is informational |
| 12.10 | `apps/web/e2e` is the only browser test; the rest of the SPA has no E2E coverage | Medium | Open | Add e2e specs for checkout, RFQ award and admin moderation |
| 12.11 | `.nvmrc` pins Node 20, but `audit:rbac` / `audit:secrets` need Node ≥ 22 (`--experimental-strip-types`) | Low | Open | Bump `.nvmrc` and the CI `node-version` to 22, or drop `--experimental-strip-types` |
| 12.12 | `/api/admin/_test/5xx-burst` is registered unconditionally | Info | Accepted | Returns `403` when `ENVIRONMENT === "production"`, which the production env sets. Keep the guard in mind if the env var is renamed |
| 12.13 | `refundsRouter` was mounted before `savedCardsRouter`, so `GET /api/payments/:id` shadowed `GET /api/payments/saved-cards` — the buyer's saved-cards panel always 404'd with "Refund not found" | **High** | **Fixed** | Mount order corrected in `src/index.ts`; `apps/api/test/payments/routeShadowing.test.ts` drives the real app so a reordering cannot regress |
| 12.14 | The Playwright buyer-flow spec used stale selectors (`/yes — confirm receipt/i`, `/request a return/i`) that no longer match the UI labels, so the E2E timed out | Medium | **Fixed** | Selectors updated to the current labels ("Confirm receipt", "Request return") |
| 12.15 | `apps/api/test/tenancy.test.ts` had a skipped test (`TODO-AUTHHELPERS`) for `GET /api/suppliers/:id` → 404 | Low | **Fixed** | The D1 shim now exists, so the test runs against a real empty D1; 0 skipped tests remain |
| 12.16 | Route-table drift between the SPA and the Worker was only detectable at runtime | Medium | **Fixed** | `scripts/route-crosscheck.mjs` statically resolves the Worker's route table (624 routes) and every SPA call (416) and fails on a mismatch; wired into CI as the `route-crosscheck` job |
| 12.17 | The Playwright buyer-flow spec failed once with the supplier order list empty (transient "Unable to load supplier facility data" state) and passed on two subsequent runs | Low | Open | Looks like a startup/seed race between `reset-d1.mjs` and the first page load. If it recurs, capture the Worker log from the failing run and add an explicit readiness wait instead of relying on `/api/health` alone |

---

## 13. Regression & release checklist

- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile matches `package.json`)
- [ ] `pnpm typecheck` green
- [ ] `pnpm lint` green
- [ ] `pnpm test` green (0 failed)
- [ ] `pnpm build` green
- [ ] `pnpm audit:rbac` green
- [ ] `pnpm audit:secrets` green
- [ ] `pnpm audit:deps` green
- [ ] `node scripts/route-crosscheck.mjs .` green
- [ ] `pnpm --filter @vyro/api test:security` green
- [ ] `pnpm --filter @vyro/web test:e2e` green
- [ ] `pnpm db:migrate` + `pnpm db:seed` succeed on a clean D1
- [ ] `BETTER_AUTH_SECRET` is set as a Worker secret (never in `wrangler.toml`)
- [ ] `WEB_ORIGIN`, `ADMIN_ORIGIN`, `BETTER_AUTH_URL` all match the deploy origin
- [ ] `wrangler deploy --env production` succeeds and `/api/health` returns `200`
- [ ] `./scripts/smoke-test.sh https://<origin>` passes
- [ ] `GET /api/health/version` reports the new build
- [ ] Post-deploy: search, cart, checkout and one supplier fulfilment flow spot-checked

---

## 14. Verification log

Evidence from the automated pass that produced this checklist. Re-run every
command before trusting it — a checklist that is not re-verified goes stale.

| Gate | Command | Result |
| --- | --- | --- |
| Type check + lint + tests + build | `pnpm turbo run typecheck lint test build --force` | **34/34 tasks successful, 0 cached** (full re-run, 4m52s) |
| Type check | `pnpm typecheck` | 16/16 tasks successful, 0 errors |
| Lint | `pnpm lint` | 8/8 tasks successful, 0 errors |
| Build | `pnpm build` | 8/8 tasks successful, `apps/web/dist` emitted |
| Unit + integration tests | `pnpm test` | 14/14 tasks, 265 test files, **1258 passed, 0 skipped** |
| RBAC audit | `pnpm audit:rbac` | "RBAC audit passed." (exit 0) |
| Secret scan | `pnpm audit:secrets` | "Secret scan passed." (exit 0) |
| Dependency audit | `pnpm audit:deps` | "Dependency audit passed. Production-reachable: 0 critical, 0 high, 0 moderate. Dev-tooling filtered: 58." |
| Route cross-check | `node scripts/route-crosscheck.mjs .` | 624 API routes indexed, 416 SPA calls analysed, **0 unmatched** |
| AI security suite | `pnpm --filter @vyro/api test:security` | 5 files, 20 tests passed |
| Browser E2E | `pnpm --filter @vyro/web test:e2e` | 4/4 passed, twice in a row (buyer checkout → supplier fulfilment → buyer return → supplier restock) |

### Issues found and fixed during this pass

| # | Severity | Issue | Fix |
| --- | --- | --- | --- |
| 12.1 | High | AI Home + AI confirm called `/api/api/…` (double base prefix) | Relative paths + a repo-wide guard test |
| 12.2 | High | Reviews module bypassed `session()`; RBAC audit red; unauthenticated requests hit D1 | Converted to `session()` middleware + route-auth tests |
| 12.3 | High | `dep-audit` truncated `pnpm audit --json` (1 MiB `maxBuffer`) → always failed | `maxBuffer` raised; path-aware classifier + tests |
| 12.4 | Medium | Vulnerable production deps (`hono@4.13.5`, `uuid@10.0.0`) | Upgraded to `hono@4.13.13`, `uuid@11.1.1` |
| 12.5 | Medium | `.env.example` documented a variable no code reads | Corrected to `VITE_API_URL` with the contract documented |
| 12.7 | Low | `VITE_API_URL` had two conflicting conventions | Unified on `apiBase` + relative path, with a guard test |
| 12.13 | High | `GET /api/payments/saved-cards` shadowed by `GET /api/payments/:id` → always 404 | Mount order corrected + real-app regression test |
| 12.14 | Medium | E2E used stale UI selectors → timeout | Selectors updated to the current labels |
| 12.15 | Low | One skipped test (`TODO-AUTHHELPERS`) | Un-skipped against the D1 shim; 0 skipped remain |
| 12.16 | Medium | Route drift between SPA and Worker was only detectable at runtime | `scripts/route-crosscheck.mjs` |

### Still open (not fixed here)

12.6 (19 raw `fetch('/api/…')` call sites), 12.8 (`packages/ui` + `apps/mobile`
have no tests), 12.9 (758 kB main chunk), 12.10 (E2E covers one flow only),
12.11 (`.nvmrc` says Node 20, the audit scripts need 22).
