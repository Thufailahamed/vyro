# Supplier Feature Audit — Fix Log

Audit of the supplier portal (`/supplier/*`) across the web SPA, the API
Worker and the shared packages. Every item below was **reproduced against the
running code** before being fixed, and verified afterwards.

Status: complete. `pnpm typecheck` and `pnpm test` are green.

---

## 1. Feature-killing bugs (the feature simply did not work)

| # | Issue | Fix |
|---|---|---|
| A1 | **Every supplier product create returned 400.** `createSupplierProductSchema.supplierSku` rejected `null`, but the form always sends `null` for an empty SKU. Reproduced: `{"fieldErrors":{"supplierSku":["Expected string, received null"]}}` | `packages/validation/src/supplierProduct.ts` — make the create schema nullable, matching the update schema |
| A2 | **Every supplier KYC submit returned 400.** `sellerKycSubmitBody` is `.strict()` and has no `notes`; the verification form always sends it. Reproduced: `Unrecognized key(s) in object: 'notes'` | `packages/validation/src/kyc.ts` — accept `notes`; `kyc/service.ts` stores it in the review snapshot |
| A3 | **"Add payout account" always returned 400.** The route parsed the whole body (including `supplierId`) against a `.strict()` schema | `finance/routes.ts` — parse only the declared fields |
| A4 | **Storefront slug update always 401** — the router never applied `session()` | `storefront/routes.ts` — apply `session()` to the PATCH route |
| A5 | **A delisted product could never be re-listed.** The unique index kept the archived row, and the API's 409 told the user to "restore" a listing that had no restore endpoint | `supplierProducts/routes.ts` — revive the archived offer with the new terms instead of a dead-end 409 |
| A6 | **"Assign Driver" on a failed delivery always 409** — the web mapped `failed → assigned`, which the state machine forbade | `packages/validation/src/delivery.ts` — allow `failed → assigned` for suppliers/admins |
| A7 | **Facility settings could never be cleared** — empty inputs were sent as `undefined` (= "no change") and the schema had no nullable variant | `settings.ts` (nullable fields) + `supplierRepository.ts` (`undefined` = keep, `null` = clear) + web sends `null` |
| A8 | **"Same Day" dispatch was stored as 1 day** — `Number(lead) \|\| 1` rewrote a deliberate 0 | `ProductFormPage.tsx` — validate and send the real value |
| A9 | **Optional product fields could never be cleared** on edit — the API's `nullable` support was unused | `ProductFormPage.tsx` — send explicit `null` |
| A10 | **"Change photo" never changed the photo** — the new image reused `sortOrder 0`, so the older row won every "first image" read | `products/repository.ts` + route — new uploads get a strictly lower `sortOrder`; the "Remove" button now deletes the persisted image (and the R2 object) |
| A11 | **"Revise quote" created a second, competing quote** instead of superseding the existing one | `SupplierQuoteDetailPage.tsx` — PATCH the existing quote |
| A12 | **"Revise quote" pre-filled the buyer's target price as the supplier's price** — a silent money bug on a live RFQ | `SupplierQuoteDetailPage.tsx` — seed from the supplier's own previous quote; leave the price blank for a first quote |
| A13 | **Every quote line was stored with unit `kg`** (bags, litres, … were lost) | `SupplierQuoteDetailPage.tsx` — send the RFQ item's unit |
| A14 | **The client quote total ignored the volume tier** the server applied, so the displayed total never matched the stored one | `SupplierQuoteDetailPage.tsx` — mirror `applyQuantityBreaks` |
| A15 | **The supplier's own listings showed "Standard commodity"** once the catalog passed 500 rows (the web resolved names from a truncated, unordered global read) | `supplierProducts` — resolve the product server-side and join it into the supplier's own listing response |
| A16 | **The "Availability" toggle on the inventory page was a no-op** for stock-tracked offers (the server derives the status from the count and ignored the write) | `InventoryPage.tsx` — write through the stock ledger so the chosen state sticks |
| A17 | **The catalog was browsable while an admin had deactivated it** (the AI upload path relies on `active = false` to hold a product back) | `products/repository.ts`, `search/routes.ts` — filter on `active` |
| A18 | **"Load older leads" replaced the CRM list** instead of appending | `useLeadManager.ts` — infinite query |
| A19 | **The deliveries list was hard-capped at 50** with no way to page | `deliveries/list.ts` + `DeliveriesPage.tsx` — cursor + "Load more" |
| A20 | **The quote-requests list was capped at 20 with no ordering**, so the client-side filters ran on an arbitrary subset | `rfqs/repository.ts` — order by deadline/createdAt; web requests the full page |
| A21 | **The attachments panel 403'd** before the supplier had quoted | `SupplierQuoteDetailPage.tsx` — explain and hide until there is a quote |
| A22 | **The sponsored module was unreachable** from the supplier nav | `Shell.tsx` — nav entry; `sponsored/Index.tsx` — graceful "not enabled" state |
| A23 | **A buyer's Accounts page always showed the first business** they belonged to, with no way to switch | `accounts/shared.tsx` — persisted active business + a switcher on the page |

## 2. Security / tenancy

| # | Issue | Fix |
|---|---|---|
| B1 | `GET /api/supplier-products/by-supplier/:id` was **unauthenticated** — the full price book, MOQ, lead times, stock and discount ladder of every supplier | Require a session + supplier membership; `by-product` now returns buyer-facing terms only |
| B2 | `PATCH /api/products/:id` and `POST /api/products/:id/images` had **no ownership check** — any supplier could rewrite another supplier's catalog product | `products/routes.ts` — write access requires the creator (`products.created_by_user_id`, new migration) or an existing offer |
| B3 | `active` was in the **supplier-facing** product update schema — a supplier could re-publish a product an admin had taken down | `validation/product.ts` — removed (admin uses its own schema) |
| B4 | **CSRF protection never ran.** `verifyCsrf` read `ctx` before the per-router `session()` middleware had populated it | `middleware/loadSession.ts` — resolve the session before the guard; `middleware/session.ts` reuses it |
| B5 | `POST /rfqs/counters/:id/respond` had **no authorization** — any authenticated user could accept a competitor's counter-offer | `rfqs/routes.ts` — only the counter-party may answer |
| B6 | `POST /rfqs/supplier/view` returned **any** RFQ (including private, invite-only ones with the buyer's target prices) and mutated its lifecycle state | `rfqs/routes.ts` — apply the same invite guard as the GET path |
| B7 | `requireMember` **ignored the membership status** — suspended/invited members could still publish and edit listings | `suppliers/service.ts` — require `status = 'active'` |
| B8 | `assertAccountAccess` ignored `business_members.status` — an invited/suspended member could read the business ledger | `accounts/routes.ts` — require an active membership |
| B9 | A supplier could **self-mark a sponsored invoice paid** and have the campaign approved — free paid placement | `sponsored/routes.ts` — the supplier now submits proof of payment (`submitted`); only an admin marks it paid (new migration) |
| B10 | `business_members`/`supplier_members` role checks used **six different allowlists**, several naming roles that do not exist (`manager`, `ops`, `finance`) and omitting `operations` | `@vyro/auth` — one canonical `SUPPLIER_ROLES`; facility settings keep the deliberate `owner`/`operations` restriction |

## 3. Money / data correctness

| # | Issue | Fix |
|---|---|---|
| C1 | **The platform's commission was credited twice** per payment (payment path + earnings path) — platform revenue was 2× | Keep the authoritative `COMMISSION` leg in `finance/earnings.ts` only |
| C2 | **The supplier was debited twice** for the same money (settlement *and* payout) while the sale credited the **gross** — the supplier balance went negative after being paid in full | `earnings.ts` credits the supplier their **net**; settlement completion no longer writes a debit (a settlement is not a cash movement); the payout debit stays |
| C3 | **The two payout-completion routes wrote opposite legs** (credit vs debit) for the same event | `payouts/admin.ts` — debit, matching `adminSettlements.ts` |
| C4 | **Refunds debited the buyer and the supplier the gross amount** while the earning fell by the net | `refunds/executor.ts` — debit `refund − feeShare`; the platform's fee reversal is unchanged |
| C5 | **Buyer-requested refunds were invisible to the supplier** — `refunds.purchase_order_id` was never set and the report inner-joined on it, so the pending-refund KPI was always 0 | `refunds/repository.ts` + `finance/routes.ts` — persist the PO link |
| C6 | `payouts.amountCents` equalled `netCents` while `feeCents` was non-zero | `payouts/repository.ts` — amount = net + fee |
| C7 | **The ledger statement cursor dropped entries** — a bare `createdAt` with a strict `<` skipped every row sharing that millisecond (legs are written in one transaction) | `ledger/queries.ts` — composite `(createdAt, id)` keyset cursor |
| C8 | The statement reported a **zero balance on an empty page** | `ledger/queries.ts` — the balance is computed independently of the page contents |
| C9 | The statement **CSV was malformed** (unescaped commas/quotes) and the filename interpolated an unvalidated account id | `accounts/routes.ts` — RFC 4180 escaping, sanitised filename |
| C10 | `formatLKR` **rounded to whole rupees** in notifications that state an amount due | `packages/shared` — 2dp |
| C11 | "Today" / "this month" were bucketed in **UTC** while the rows render in local time | `packages/shared` — business-timezone (Asia/Colombo) helpers |

## 4. React / cache correctness

| # | Issue | Fix |
|---|---|---|
| D1 | `['supplier', id, 'customers']` was used by **both** a `useQuery` and a `useInfiniteQuery` — the two pages read each other's cache shape | `CustomersPage.tsx` — distinct key |
| D2 | `['product', id]` was used for **two different endpoints** with two different response shapes | `ProductDetailPage.tsx` — `['product-offers', id]` |
| D3 | The product form **re-applied server values on every refetch**, silently reverting in-progress edits | `ProductFormPage.tsx` — hydrate once per offer/product |
| D4 | The Learning list and publish gate were **not invalidated** after completing a lesson | `useLearning.ts` |
| D5 | The product form showed only "Invalid input" — **field-level errors were dropped** | `ProductFormPage.tsx` — render `error.details.fieldErrors` |
| D6 | The product form did not invalidate **its own** product cache after saving | `ProductFormPage.tsx` |
| D7 | The stock-movement drawer used a **different query key** than the one invalidated | `InventoryPage.tsx` — invalidate the prefix |
| D8 | The "Refresh" button on the supplier accounts page only refetched the **header** | `supplier/AccountsPage.tsx` — invalidate all tabs |
| D9 | A failed **confirm dialog** action rejected silently (unhandled promise, no toast, dialog stuck) | `accounts/shared.tsx` — catch, show the error, keep the dialog open |
| D10 | The counter-offer accept/decline had **no error handling** | `SupplierQuoteDetailPage.tsx` |
| D11 | Editing a listing that no longer existed rendered a **blank, unsavable form** | `ProductFormPage.tsx` — explicit error state |
| D12 | Pressing Enter in a field **bypassed the publish readiness check** | `ProductFormPage.tsx` — re-check `canPublish` on submit |
| D13 | The client's tier validation was **weaker than the server's** (no non-shrinking-discount rule, allowed 90%) | `ProductFormPage.tsx` — mirrors `tierOrderOk`; inputs bounded |
| D14 | The supplier's own quotes fell off the first page of quotes **after the limit** (filtered in SQL afterwards) | `rfqs/repository.ts` — filter by supplier in SQL |
| D15 | The web's supplier-role union **did not match the database enum** (`owner \| sales \| operations`) | `lib/auth.tsx`, `useSupplierId.tsx` |

## 5. Failing tests (pre-existing)

All five were stale assertions against pre-redesign copy; the components carry
the intended design. Assertions updated to the current copy, keeping the
original intent.

- `test/learning/LessonsAdmin.test.tsx`
- `test/storefront/memberSinceHero.test.tsx` (2)
- `test/verifiedBuyerBadge.test.tsx`
- `test/conversionBadge.test.tsx`

Two API fixtures used a supplier role (`manager`) that does not exist in the
schema — updated to the real roles (`owner` / `operations`).

## 6. Migrations added

- `0057_products_created_by.sql` — `products.created_by_user_id` (+ index), so
  supplier writes to the shared catalog can be authorised.
- `0058_sponsored_invoice_proof.sql` — rebuild `sponsored_invoices` with a
  `submitted` status and a `payment_reference` column, so a supplier can
  submit proof of payment without self-approving the campaign.

Both verified with `wrangler d1 migrations apply vyro --local`.
