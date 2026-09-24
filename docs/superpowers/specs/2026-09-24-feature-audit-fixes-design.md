# Vyro Feature Audit & Fix Plan — 2026-09-24

## Scope
Full audit of API (`apps/api/src/modules/**`), Web (`apps/web/src/**`), Mobile (`apps/mobile/src/**`). Audit + spec only; implementation deferred to next session per user delivery choice.

## Method
3 parallel `caveman:cavecrew-investigator` agents — one per surface. Each returned findings in standardised line-format. Triage rules: severity-desc, dedup `file:line`, group `contract-drift`, separate `incomplete` from `bug`. Cap at 30/surface; below-`low` (=`low`) dropped when cap hit.

## Totals
- API: 50 raw → 35 kept. 15 `low` dropped.
- Mobile: 33 raw → 22 kept. 11 dropped (1 iPad share + 2 perf + 8 low-severity misc/contract-drift/test).
- Web: 30 raw → 23 kept. 7 `low` dropped.
- **Kept total: 80 findings.** Dropped-`low` noted in Future Work.

## Severity distribution (kept)
- Blocker: 2 (mobile).
- High: 21 (api 2 + mobile 8 + web 11).
- Medium: 57 (api 32 + mobile 12 + web 12).

## Triage decisions

### `incomplete` findings → option chosen
| ID | Choice | Rationale |
|---|---|---|
| api-031 sanctions refresh | (a) implement fetcher | Compliance critical; cron weekly, no manual fallback |
| api-032 audit export runner | (a) implement | Owner hook already exists (audit queue); trivial |
| api-033 sponsored scheduled state | (a) emit metric + add `approved_pending` view | Existing cron sweep is the activation path; metric surfaces queue |
| api-034 buyLeads partial-failure | (a) per-supplier try/catch + report counter | Operational hygiene |
| mobile-021 observability queue+alerts | (a) create routes | UI refs them; one-screen stub is small |
| mobile-022 admin learning route | (a) create stub | Already has `learning/` feature, route wiring trivial |
| mobile-023 kit/hooks verify | (a) verify+export if missing | Triage to existing repo |
| mobile-024 CSV export iPad | (a) cache-file + share URL | One-file fix |
| web-021 ReturnsPage empty state | (a) explain no-business UI | Small |
| web-022 OrderLifecycleSettings error banner | (a) banner+dirty guard | Standard |
| web-023 SupplierOrderDetail skeleton | (a) skeleton | Standard |
| web-024 phone pattern | (a) allow `.` | Tiny |
| web-025 admin home staleTime | (a) set 30s | Tiny |

### `bug` vs `feature` boundary
- web-002 `businessId: 'default'` + web-027: dead-until-wired conversational surface. Fix to existing membership lookup — does not add a feature.
- mobile-007/008/019 deep-link `toast.error('Page not found')` for invalid routes — diagnostic only.

### Out of scope (would need design)
- Anything that picks a new product direction.
- Per-question learning analytics (deferred roadmap item).
- Sponsored placement re-rank algorithmic changes.

## Findings table (kept)

### API
| ID | Sev | Type | File:Line | Summary | Fix |
|---|---|---|---|---|---|
| api-001 | high | bug | trust/service.ts:37 | on-time metric ORDER BY/LIMIT on aggregate returns one row; window filter missing | subquery `WHERE delivered_at IS NOT NULL ORDER BY delivered_at DESC LIMIT 30` then aggregate |
| api-002 | high | bug | finance/reconciliation.ts:113-122 | section #4 amount-mismatch check has no body | add `if (effective != payment.amount) raiseException(...)` |
| api-003 | med | bug | reviews/service.ts:197 | deleteReviewByBuyer writes `removed_by_admin` | pass `removed_by_buyer` constant |
| api-004 | med | bug | repeatOffers/service.ts:82-93 | missing terminal `.all()` | append `.all()` |
| api-005 | med | bug | suppliers/service.ts:25-44 | supplier + member + KYC not transactional | `db.transaction` wrap |
| api-006 | med | bug | businesses/service.ts:19-33 | business + owner-member not transactional | `db.transaction` wrap |
| api-007 | med | bug | payments/routes.ts:155-178 | companion writes outside `db.transaction` | move recordAttempt + ensureCodCollection/createBankTransfer inside |
| api-008 | med | bug | finance/adminSettlements.ts:158-180 | prior-check outside txn | move prior-check inside txn |
| api-009 | med | bug | finance/earnings.ts:99-141 | SALE/COMMISSION prior-check outside txn | move inside |
| api-010 | med | bug | finance/admin.ts:185-186 | cancel ternary collapses both branches to `failed` | map cancelled → `cancelled` |
| api-011 | med | bug | cross-border/docs.ts:36-38 | hardcoded R2 URL, env ignored via `void r2` | read `env.R2_PUBLIC_BASE` |
| api-012 | med | bug | notifications/dispatcher.ts:179-190 | insert error swallowed | log + emit metric |
| api-013 | med | bug | buyLeads/service.ts:69-82 | matcher+queue errors swallowed | log per-supplier + continue |
| api-014 | med | bug | inventory/service.ts:101-103 | audit insert error swallowed | `console.error` minimum |
| api-015 | med | bug | auth/routes.ts:42 | `passwordHash: 'better-auth'` literal stored | set `null` + drop column |
| api-016 | med | bug | cron/handlers.ts:91-114 | per-job try/catch missing around `notifyAdmins` loop | wrap each iteration |
| api-017 | med | bug | cross-border/fx.ts:32 | `crypto.randomUUID()` instead of `newId()` | import + use `newId()` |
| api-018 | med | bug | cross-border/repository.ts:9 | same — customs docs | same |
| api-019 | med | bug | credit/service.ts:132-189 | releaseDrawdown 3 writes non-transactional | `db.transaction` |
| api-020 | med | bug | orders/lifecycle.ts:351-368 | `delivery_promised_at` write lacks status guard | add `AND status='preparing'` |
| api-021 | med | bug | orders/lifecycle.ts:316-321 | payment-void write lacks status guard | scope to `status='pending'` + check rowsAffected |
| api-022 | med | bug | orders/create.ts:58 | dynamic `import('../purchaseOrders/service')` in hot path | hoist to module top |
| api-023 | med | bug | payments/routes.ts:142-148 | catch-all swallows commission resolver errors → silent platform-rate fallback | only swallow `categoryForPo` not-found |
| api-024 | med | bug | payments/routes.ts:419 | `GET /payments/by-po/:poId` missing membership guard | add `requireBusinessRole`/`requireSupplierRole` |
| api-025 | med | bug | rfqs/routes.ts:165 | PATCH /rfqs/:id missing `.run()` | append `.run()` |
| api-026 | med | bug | rfqs/routes.ts:548 | POST /quotes/:quoteId/submit missing `.run()` | append `.run()` |
| api-027 | med | bug | rfqs/routes.ts:615 | POST /quotes/:quoteId/withdraw missing `.run()` | append `.run()` |
| api-028 | med | bug | orders/lifecycle.ts:405-406 | cancelled-supplier copy ternary drops admin branch | drop ternary |
| api-029 | med | bug | auth/routes.ts:42 | duplicate of api-015 (consolidate in plan) | covered by api-015 fix |
| api-030 | med | bug | payments/routes.ts:182-189 | `recordAttempt().catch(()=>null)` swallows | log+rethrow |
| api-031 | med | incomplete | cross-border/sanctions.ts:28-39 | refresh fetcher only returns seed | implement fetcher with OFAC/UN HTTP fetch + fail-loud |
| api-032 | med | incomplete | cron/handlers.ts:79-83 | auditExportRunner no-op | implement pull from `audit` queue + R2 upload |
| api-033 | med | incomplete | sponsored/cron.ts:11-19 | approved_campaigns > now silently skipped | add `approved_pending` view + emit counter |
| api-034 | med | incomplete | buyLeads/service.ts:56-85 | no partial-failure semantics | per-supplier try/catch + count |
| api-035 | med | contract-drift | finance/adminSettlements.ts:568-589 | verify needs `payout:approve` | rename permission (or split action) |
| api-036 | med | perf | admin/lib/audit.ts:73-83 | per-request audit insert hot path | coalesce via existing audit queue |

### Mobile
| ID | Sev | Type | File:Line | Summary | Fix |
|---|---|---|---|---|---|
| mobile-001 | blocker | bug | admin/catalog/CatalogScreen.tsx:129 | Feature button shared spinner for all rows | pending per-id gate `feature.variables?.id === p.id` |
| mobile-002 | blocker | bug | buyer/orders/components/ReorderSheet.tsx:29 | RadioCards bound to effective not state | bind to `mode` state; disable cards instead |
| mobile-003 | high | bug | admin/learning/LearningScreen.tsx:339 | setState during render (LessonEditorSheet) | `useEffect` keyed on `[visible, lesson?.id]` |
| mobile-004 | high | bug | admin/learning/LearningScreen.tsx:454 | same anti-pattern (QuizSheet) | same |
| mobile-005 | high | bug | admin/ops/kit/components.tsx:187 | ReasonSheet setState during render | `useEffect(() => { if (!visible) setReason('') }, [visible])` |
| mobile-006 | high | bug | admin/observability/ObservabilityScreen.tsx:128 | `key={i}` on recent-errors list | stable key `e.action + e.createdAt` |
| mobile-007 | high | bug | common/NotificationsScreen.tsx:258 | deep-link goes raw `go(n.link)` | route through `mobileHref()` shared helper |
| mobile-008 | high | bug | buyer/ai/AskScreen.tsx:23 | mobileHref manual string replace | consolidate with NotificationsScreen |
| mobile-009 | high | bug | buyer/ai/useVyroAI.ts:299 | empty-deps useCallback reads `history.current` stale | convert to `useRef` or include deps |
| mobile-010 | high | bug | buyer/orders/OrderDetailScreen.tsx:807 | `refetchInterval: 8000` unconditional | gate `enabled: messagesSheetOpen && isFocused` |
| mobile-011 | high | bug | buyer/commerce/CatalogScreen.tsx:57 | nav-params sync to state during render | `useEffect` |
| mobile-012 | med | bug | admin/accounts/AccountsScreen.tsx:411 | confirmKind `'unsuspend'` vs `'Reinstate'` mismatch | rename state to `'reinstate'` |
| mobile-013 | med | bug | buyer/commerce/PaymentReturnScreen.tsx:34 | poll continues after success | `shouldPoll = outcome==='success' && status!=='confirmed' && !timedOut` |
| mobile-014 | med | bug | admin/learning/LearningScreen.tsx:540 | SaveOrder Promise.all rejects first 403 → orphan writes | per-row try/catch + partial-failure surface |
| mobile-015 | med | bug | admin/accounts/TransactionScreen.tsx:102,122,128 | `key={i}` on transactions/refunds/earnings | stable id keys |
| mobile-016 | med | bug | admin/ai/AiUsageScreen.tsx:89,103 | same | same |
| mobile-017 | med | bug | admin/platform/kit.tsx:203 | skeleton `key={i}` | acceptable (count-only) — document |
| mobile-018 | med | bug | app/welcome.tsx | ScrollView missing `keyboardShouldPersistTaps="handled"` | add prop |
| mobile-019 | med | bug | buyer/orders/kit.tsx | `go()` silently 404s | catch + `toast.error` |
| mobile-020 | med | bug | admin/ops/kit/components.tsx:201 | no minLength hint on reason input | add `hint` to Field |
| mobile-021 | med | incomplete | app/admin/observability/ | queue+alert routes missing | create queues.tsx + alerts.tsx stubs |
| mobile-022 | med | incomplete | app/admin/learning | route stub missing | create stub |
| mobile-023 | med | incomplete | admin/ops/kit/hooks.ts | verify exports | verify `useAdminList`/`useBulk` exported |
| mobile-024 | low | incomplete | buyer/finance/AccountsScreen.tsx | CSV export iPad share | cache file + share URL — **dropped to Future Work per cap rule** |
| mobile-025 | low | perf | buyer/ai/AskScreen.tsx:72 | FlatList no getItemLayout | **dropped** |
| mobile-026 | low | perf | buyer/orders/OrderDetailScreen.tsx | 962-line screen | **dropped** |

### Web
| ID | Sev | Type | File:Line | Summary | Fix |
|---|---|---|---|---|---|
| web-001 | high | bug | pages/OrderDetailPage.tsx:1012 | `/support` route missing → 404 | point to `/help` or remove card |
| web-002 | high | bug | pages/ConversationalOrderPage.tsx:76 | hardcoded `businessId: 'default'` | source from active membership |
| web-003 | high | bug | ask/AskPage.tsx:184 | useEffect fetch no AbortController | add controller + cancelled flag |
| web-004 | high | bug | ai/AiHomePage.tsx:20 | raw fetch bypasses `api` wrapper | use `api.get` |
| web-005 | high | bug | admin/ReviewsPage.tsx:11 | same | same |
| web-006 | high | bug | reviews/AdminReviewQueue.tsx:38 | mutations ignore `!res.ok` | throw + toast |
| web-007 | high | bug | storefront/StorefrontPage.tsx:51 | raw fetch | use `api.get` |
| web-008 | high | bug | pages/ProfilePage.tsx:41 | raw fetch (DataPrivacyTab) | use `api.delete` / `api.post` |
| web-009 | high | bug | components/Layout.tsx:337 | signOut swallow | async + try/catch |
| web-010 | high | bug | components/SiteHeader.tsx:264 | same (OnboardingHeader) | same |
| web-011 | high | bug | pages/ProfilePage.tsx:192 | same | same |
| web-012 | med | bug | admin/PlatformPage.tsx:806 | native `window.confirm` for destructive delete | ConfirmDialog |
| web-013 | med | bug | supplier/InventoryPage.tsx:789 | AdjustStock double-submit possible | `submitting` gate |
| web-014 | med | bug | pages/SponsoredDisclosure.tsx:9 | no retry CTA on error | add retry button |
| web-015 | med | bug | components/Layout.tsx:455 | mobile nav signOut not awaited | async + try/catch |
| web-016 | med | bug | ask/useVyroAI.ts:36 | raw fetch in hook | use `api.post` |
| web-017 | med | bug | ask/ConfirmationPanel.tsx:185 | same | same |
| web-018 | med | bug | ask/FeedbackButtons.tsx:178 | same | same |
| web-019 | med | bug | supplier/DeliveryTransitionButtons.tsx:172 | POD retry double-fire | local submitting state |
| web-020 | med | bug | 8 sites | native `confirm()` | swap to ConfirmDialog |
| web-021 | med | incomplete | pages/ReturnsPage.tsx:8 | silent empty on no-membership | render empty state |
| web-022 | med | incomplete | admin/OrderLifecycleSettingsPage.tsx:0 | no error banner, no dirty guard | add ErrorBanner + dirty |
| web-023 | med | incomplete | supplier/SupplierOrderDetailPage.tsx:0 | missing skeleton | add skeleton |

## Implementation order (grouped by category — actual task list in plan doc)

Categories in execution order (each = 1 plan task):

1. **Trust SQL fix** (api-001) — must come first; trust cron runs hourly and consumes this output.
2. **Finance reconciliation branch** (api-002) — money-path bug, nightly cron.
3. **Missing `.run()` on Drizzle updates** (api-025..027) — three-line fixes; one PR.
4. **Missing db.transactions** (api-005..009, 019) — five files; one PR.
5. **Race-condition status guards** (api-020, 021, api-037-deferred-low) — one PR.
6. **Swallowed errors → log+rethrow** (api-012, 013, 014, 016, 030, also mobile-019 toast) — one PR.
7. **ID drift → newId()** (api-017, 018) — one PR; tiny.
8. **Auth passwordHash column drop** (api-015, 029) — one migration + code; needs scratch schema.
9. **Cross-border docs URL** (api-011) — one-line config-driven fix.
10. **Refund cancel ternary** (api-010) — one-line enum fix.
11. **Inventory audit** (api-014) — log line.
12. **Commission resolver rethrow** (api-023) — narrow catch.
13. **PO payments membership guard** (api-024) — one check.
14. **Dynamic import hoist** (api-022) — edit + move import.
15. **Cross-border sanctions fetcher** (api-031) — full feature, scoped block.
16. **Audit export runner** (api-032) — full feature, scoped.
17. **Sponsored approved_pending metric** (api-033) — view + counter.
18. **buyLeads partial-failure** (api-034) — counter + log.
19. **Audit coalesce** (api-036) — leverage existing queue.
20. **Permission split (verify vs approve)** (api-035) — schema amend.
21. **Mobile: 2 blockers** (mobile-001, 002) — fix first; PR1.
22. **Mobile: state-during-render sweep** (mobile-003, 004, 005, 011) — PR2.
23. **Mobile: deep-link rewrite helper consolidation** (mobile-007, 008) — single helper file.
24. **Mobile: missing routes** (mobile-021, 022, 023) — stubs.
25. **Mobile: polling gating** (mobile-010, 013).
26. **Mobile: index-as-key sweep** (mobile-006, 015, 016) — mechanical.
27. **Mobile: misc polish** (mobile-009, 012, 014, 018, 019, 020).
28. **Web: raw fetch → api wrapper** (web-004..008, 016..018) — 9 sites, PR.
29. **Web: signOut async/await** (web-009, 010, 011, 015) — 4 sites, PR.
30. **Web: native confirm → ConfirmDialog** (web-012, 020).
31. **Web: AbortController, retry CTA, skeletons, empty states** (web-001..003, 013, 014, 019, 021..023).
32. **Web: complete-tab small fixes** (web-024, 025).

## Test gate
- All `bug` fixes: regression test next to existing module tests (`apps/api/test/<module>.test.ts` mirrors service tests; `apps/web/test/<page>.test.tsx` RTL; `apps/mobile/test/<feature>.test.tsx`).
- All `incomplete` fixes that add wiring: smoke test that the route/handler returns 200 with seed.
- All `perf` fixes: before/after metric if measurable.
- Required test counts at merge:
  - API: `pnpm test` (target: keep current 1001+ passing, no regressions).
  - Web: `pnpm test` (target: ≥142 passing).
  - Mobile: `pnpm test` (target: new tests pass).
- Run `pnpm build` for all three apps.
- Manual smoke: dev server + happy-path click-through for each changed screen.

## Future work
- `low`-severity findings dropped per cap rule: api-037..050, mobile-024..033, web-026..030.
- Cross-surface contract test harness (api contracts vs web+zod schemas) — would prevent api-024/web-021 class.
- `learn-quiz` analytics per-question (roadmap deferred item).
- Sponsored placement re-rank algorithms (roadmap deferred item).
- Mobile `getItemLayout` perf sweep (mobile-025, 026).
- Add Drizzle lint rule: every `update()` chain must end in `.run()` or `.all()`.

## Risks / notes
- api-015 schema amend: dropping `passwordHash` requires verifying better-auth doesn't read it; defer to next session if better-auth contract unknown.
- api-035 permission rename: touches every module that calls `verifySupplierBankAccount`; broad blast radius; small diff but many call-sites.
- Cross-border fetcher (api-031): needs network egress in Worker — verify outbound allowed in `wrangler.toml`.
- Spec deferred-action contract: **user will review and approve before plan is written**. Implementation not in this session.
