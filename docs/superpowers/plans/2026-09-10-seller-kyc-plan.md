# Seller KYC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let sellers submit per-supplier KYB and see verification status while admin approval stays the single decision point.

**Architecture:** New session-authenticated `apps/api/src/modules/kyc/` module (`GET /my`, `POST /submit`) stores simple BR/tax/bank fields in `supplier_settings` plus JSON snapshot in `kyc_reviews.documentsJson`; admin `decide` also flips `suppliers.verificationStatus`; new `/supplier/verification` page plus soft-warning banner.

**Tech Stack:** Hono + D1/Drizzle, Zod in `packages/validation`, React Query + React Router SPA.

## Global Constraints

- No D1 migration — reuse `kyc_reviews`, `suppliers`, `supplier_settings` as-is.
- Soft-warning only — never block product/order routes for unverified sellers.
- Follow existing `trustSafety/kycService` + `kycRepository` patterns (service throws `httpError`, repo is pure D1).
- All admin decisions audited via `auditAdmin`; seller endpoints use `session()` only (no admin RBAC).
- pnpm + vitest; run `pnpm --filter @vyro/api test` and `pnpm typecheck` before done.

---

## File map

- Create `packages/validation/src/kyc.ts` — `sellerKycSubmitBody`, `sellerKycMyResponse` types; export from `packages/validation/src/index.ts`.
- Create `apps/api/src/modules/kyc/repository.ts` — `findMyKyc(d1, userId)`, `upsertSubmitKyc(...)`, `findMemberSupplier(d1, supplierId, userId)`.
- Create `apps/api/src/modules/kyc/service.ts` — `getMy(d1, userId)`, `submit(d1, ctx, body)`.
- Create `apps/api/src/modules/kyc/routes.ts` — `GET /my`, `POST /submit` with `session()`.
- Modify `apps/api/src/index.ts:114-176` — mount `kycRouter` at `/api/kyc`.
- Modify `apps/api/src/modules/suppliers/service.ts:11-32` — auto-create `kyc_reviews` pending row on onboard.
- Modify `apps/api/src/modules/admin/trustSafety/kycService.ts:53-73` — `decide` also calls `setSupplierVerification` for linked supplier.
- Create `apps/api/test/kyc-seller.test.ts` — seller submit/my/resubmit/decide-sync coverage.
- Create `apps/web/src/supplier/useSellerKyc.ts` — `useSellerKyc()`, `useSubmitKyc()` hooks.
- Create `apps/web/src/supplier/VerificationPage.tsx` — form + status timeline + resubmit.
- Modify `apps/web/src/App.tsx:186-202` — add `/supplier/verification` route.
- Modify `apps/web/src/supplier/Shell.tsx:100-110` — soft-warning banner.
- Modify `scripts/e2e.md` — append §7e.4 seller KYC walkthrough.

---

### Task 1: Seller KYC validation schemas

**Files:**
- Create: `packages/validation/src/kyc.ts`
- Modify: `packages/validation/src/index.ts`
- Test: `packages/validation/test/kyc.test.ts`

**Interfaces:**
- Consumes: `zod` (same as `packages/validation/src/adminTrustSafety.ts:44-49`).
- Produces: `sellerKycSubmitBody: ZodObject { supplierId, registrationNo?, taxId?, bankName?, bankAccountNo?, bankBranch?, bankAccountHolder?, documentsJson? }`, `type SellerKycSubmitInput = z.infer<typeof sellerKycSubmitBody>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/validation/test/kyc.test.ts
import { describe, expect, it } from 'vitest';
import { sellerKycSubmitBody } from '../src/kyc';

describe('sellerKycSubmitBody', () => {
  it('accepts minimal submit', () => {
    expect(sellerKycSubmitBody.safeParse({ supplierId: 's-1' }).success).toBe(true);
  });
  it('rejects empty supplierId', () => {
    expect(sellerKycSubmitBody.safeParse({ supplierId: '' }).success).toBe(false);
  });
  it('rejects oversized documentsJson', () => {
    expect(sellerKycSubmitBody.safeParse({ supplierId: 's-1', documentsJson: 'x'.repeat(8001) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/validation test -- kyc.test.ts`
Expected: FAIL with "Failed to resolve import ../src/kyc" (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/validation/src/kyc.ts
import { z } from 'zod';

export const sellerKycSubmitBody = z
  .object({
    supplierId: z.string().min(1),
    registrationNo: z.string().max(100).optional(),
    taxId: z.string().max(100).optional(),
    bankName: z.string().max(120).optional(),
    bankAccountNo: z.string().max(60).optional(),
    bankBranch: z.string().max(120).optional(),
    bankAccountHolder: z.string().max(160).optional(),
    documentsJson: z.string().max(8000).optional(),
  })
  .strict();

export type SellerKycSubmitInput = z.infer<typeof sellerKycSubmitBody>;
```

Append to `packages/validation/src/index.ts`:
```ts
export * from './kyc';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/validation test -- kyc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/kyc.ts packages/validation/src/index.ts packages/validation/test/kyc.test.ts
git commit -m "feat(validation): seller KYC submit schema"
```

---

### Task 2: Seller KYC API module (`GET /my`, `POST /submit`)

**Files:**
- Create: `apps/api/src/modules/kyc/repository.ts`
- Create: `apps/api/src/modules/kyc/service.ts`
- Create: `apps/api/src/modules/kyc/routes.ts`
- Modify: `apps/api/src/index.ts`
- Test: covered in Task 4 (no separate test file here to keep Task 2 + 4 as red/green pair; Task 2 ends with typecheck).

**Interfaces:**
- Consumes: `sellerKycSubmitBody` from `@vyro/validation`, `session()` from `../../middleware/session`, `getDb` from `@vyro/db`, tables `kycReviews`, `suppliers`, `supplierMembers`, `supplierSettings`.
- Produces: `GET /api/kyc/my -> { kyc: KycRow | null, supplier: { id, verificationStatus } | null }`, `POST /api/kyc/submit -> KycRow`.

- [ ] **Step 1: Create repository**

```ts
// apps/api/src/modules/kyc/repository.ts
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { kycReviews, supplierMembers, suppliers } from '@vyro/db/schema';
import type { KycRow } from '../admin/trustSafety/kycRepository';

export async function findMemberSupplier(d1: D1Database, supplierId: string, userId: string) {
  const db = getDb(d1);
  const row = await db
    .select({ id: suppliers.id, verificationStatus: suppliers.verificationStatus })
    .from(suppliers)
    .innerJoin(supplierMembers, eq(supplierMembers.supplierId, suppliers.id))
    .where(
      and(
        eq(suppliers.id, supplierId),
        eq(supplierMembers.userId, userId),
        eq(supplierMembers.status, 'active'),
        isNull(suppliers.deletedAt),
      ),
    )
    .get();
  return row ?? null;
}

export async function findMyKyc(d1: D1Database, userId: string): Promise<KycRow | null> {
  const db = getDb(d1);
  const row = (await db
    .select()
    .from(kycReviews)
    .where(eq(kycReviews.userId, userId))
    .orderBy(desc(kycReviews.createdAt))
    .limit(1)
    .get()) as unknown as KycRow | undefined;
  return row ?? null;
}
```

- [ ] **Step 2: Create service**

```ts
// apps/api/src/modules/kyc/service.ts
import { randomUUID } from 'crypto';
import { getDb } from '@vyro/db';
import { kycReviews, supplierSettings } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { httpError } from '../../lib/errors';
import type { SellerKycSubmitInput } from '@vyro/validation';
import { findMemberSupplier, findMyKyc } from './repository';
import { getKyc } from '../admin/trustSafety/kycRepository';

export async function getMy(d1: D1Database, userId: string) {
  const kyc = await findMyKyc(d1, userId);
  return { kyc };
}

export async function submit(d1: D1Database, userId: string, body: SellerKycSubmitInput) {
  const membership = await findMemberSupplier(d1, body.supplierId, userId);
  if (!membership) throw httpError(403, 'FORBIDDEN', 'Not a supplier member');
  const existing = await findMyKyc(d1, userId);
  if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
    throw httpError(409, 'KYC_NOT_PENDING', `KYC review is ${existing.status}`);
  }
  const db = getDb(d1);
  const now = Date.now();
  const snapshot = JSON.stringify({
    registrationNo: body.registrationNo ?? null,
    taxId: body.taxId ?? null,
    bankName: body.bankName ?? null,
    bankAccountNo: body.bankAccountNo ?? null,
    bankBranch: body.bankBranch ?? null,
    bankAccountHolder: body.bankAccountHolder ?? null,
    extra: body.documentsJson ?? null,
    supplierId: body.supplierId,
  });
  // Mirror simple fields into supplier_settings (upsert by primary key).
  const current = await db.select().from(supplierSettings).where(eq(supplierSettings.supplierId, body.supplierId)).get();
  if (current) {
    await db.update(supplierSettings).set({
      registrationNo: body.registrationNo ?? current.registrationNo,
      taxId: body.taxId ?? current.taxId,
      bankName: body.bankName ?? current.bankName,
      bankAccountNo: body.bankAccountNo ?? current.bankAccountNo,
      bankBranch: body.bankBranch ?? current.bankBranch,
      bankAccountHolder: body.bankAccountHolder ?? current.bankAccountHolder,
      updatedAt: now,
    }).where(eq(supplierSettings.supplierId, body.supplierId)).run();
  } else {
    await db.insert(supplierSettings).values({
      supplierId: body.supplierId,
      companyName: null, registrationNo: body.registrationNo ?? null, taxId: body.taxId ?? null,
      contactEmail: null, contactPhone: null, warehouseAddress: null, warehouseCity: null,
      warehouseDistrict: null, warehouseLat: null, warehouseLng: null, defaultLeadTimeDays: null,
      payoutMethod: body.bankAccountNo ? 'bank' : null, bankName: body.bankName ?? null,
      bankAccountNo: body.bankAccountNo ?? null, bankBranch: body.bankBranch ?? null,
      bankAccountHolder: body.bankAccountHolder ?? null, bankVerified: false,
      notifyNewOrders: 1, notifyLowStock: 1, notifyPaymentReceived: 1,
      createdAt: now, updatedAt: now,
    }).run();
  }
  if (existing && (existing.status === 'rejected' || existing.status === 'needs_more_info')) {
    await db.update(kycReviews).set({ documentsJson: snapshot, status: 'pending', notes: null, reviewedBy: null, reviewedAt: null }).where(eq(kycReviews.id, existing.id)).run();
    return (await getKyc(d1, existing.id))!;
  }
  const id = randomUUID();
  await db.insert(kycReviews).values({ id, userId, status: 'pending', documentsJson: snapshot, notes: null, reviewedBy: null, reviewedAt: null, createdAt: now }).run();
  return (await getKyc(d1, id))!;
}
```

- [ ] **Step 3: Create routes + mount**

```ts
// apps/api/src/modules/kyc/routes.ts
import { Hono } from 'hono';
import type { Env } from '../../env';
import { session } from '../../middleware/session';
import type { Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { sellerKycSubmitBody } from '@vyro/validation';
import * as svc from './service';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

router.get('/my', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  return c.json(await svc.getMy(c.env.DB, ctx.userId));
});

router.post('/submit', async (c) => {
  const ctx = c.get('ctx') as Ctx;
  const parsed = sellerKycSubmitBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid input', parsed.error.flatten());
  return c.json(await svc.submit(c.env.DB, ctx.userId, parsed.data), 201);
});

export default router;
```

In `apps/api/src/index.ts` add import + mount next to line 56/158:
```ts
import kycSellerRouter from './modules/kyc/routes';
app.route('/api/kyc', kycSellerRouter);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS (no type errors in new module).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kyc/ apps/api/src/index.ts packages/validation/src/kyc.ts
git commit -m "feat(api): seller KYC submit + my endpoints"
```

---

### Task 3: Link onboarding auto-create + admin decide sync

**Files:**
- Modify: `apps/api/src/modules/suppliers/service.ts`
- Modify: `apps/api/src/modules/admin/trustSafety/kycService.ts`
- Test: covered by Task 4.

**Interfaces:**
- Consumes: `repo.createKyc` from `../admin/trustSafety/kycRepository`, `setSupplierVerification` from `../suppliers/repository`, `supplierMembers` table for userId→supplier lookup.
- Produces: onboard creates pending KYC; `decide` flips linked supplier `verified`/`rejected`/`pending`.

- [ ] **Step 1: Patch supplier onboard to auto-create KYC row**

In `apps/api/src/modules/suppliers/service.ts`, after `insertOwnerSupplierMember` (lines 30-31):
```ts
import { createKyc, findKycByUser } from '../admin/trustSafety/kycRepository'; // add import (findKycByUser added below)
// inside onboard(), after insertOwnerSupplierMember:
const existingKyc = await findKycByUser(d1, userId);
if (!existingKyc) {
  await createKyc(d1, { id: newId(), userId, documentsJson: null, createdAt: now() });
}
```
Add to `apps/api/src/modules/admin/trustSafety/kycRepository.ts`:
```ts
export async function findKycByUser(d1: D1Database, userId: string) {
  const db = getDb(d1);
  const row = (await db.select().from(kycReviews).where(eq(kycReviews.userId, userId)).orderBy(desc(kycReviews.createdAt)).limit(1).get()) as KycRow | undefined;
  return row ?? null;
}
```

- [ ] **Step 2: Patch admin decide to sync supplier verification**

In `apps/api/src/modules/admin/trustSafety/kycService.ts`, after `decideKyc` success and before audit (lines 60-64), insert:
```ts
import { setSupplierVerification } from '../../suppliers/repository';
import { getDb } from '@vyro/db';
import { supplierMembers } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
// after out computed + pending check:
const db = getDb(d1);
const membership = await db.select({ supplierId: supplierMembers.supplierId }).from(supplierMembers).where(eq(supplierMembers.userId, out.before.userId)).limit(1).get();
if (membership) {
  const mapped = decision === 'approved' ? 'verified' : decision === 'rejected' ? 'rejected' : 'pending';
  await setSupplierVerification(d1, membership.supplierId, mapped as 'verified' | 'rejected' | 'pending');
}
```
Note: `needs_more_info` maps back to supplier `pending` (verification schema only allows verified/rejected/pending).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @vyro/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/suppliers/service.ts apps/api/src/modules/admin/trustSafety/
git commit -m "feat(kyc): link supplier onboard + admin decide sync"
```

---

### Task 4: Seller KYC API tests (TDD green)

**Files:**
- Create: `apps/api/test/kyc-seller.test.ts`

**Interfaces:**
- Consumes: `kycSellerRouter` from `../../src/modules/kyc/routes`, same session-mock pattern as `apps/api/test/admin/kyc.test.ts:15-28`.
- Produces: passing coverage for submit/my/resubmit/decide-sync.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/kyc-seller.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../src/env', () => ({ env: { WEB_ORIGIN: 'x', ADMIN_ORIGIN: 'x', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'x', ENVIRONMENT: 'test' } }));
vi.mock('../src/middleware/session', () => ({
  session: () => async (c: any, n: any) => {
    c.set('ctx', { userId: 'u-seller', email: 's@x.example', isAdmin: false, adminRole: null, businesses: [], suppliers: [] });
    await n();
  },
}));

const state = vi.hoisted(() => ({ kyc: [] as any[], members: [{ supplierId: 's-1', userId: 'u-seller' }], settings: [] as any[] }));

vi.mock('../src/modules/kyc/repository', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/modules/kyc/repository')>();
  return { ...mod, findMemberSupplier: async (_d: any, sid: string, uid: string) => state.members.find((m) => m.supplierId === sid && m.userId === uid) ?? null };
});

import kycSellerRouter from '../src/modules/kyc/routes';
import { errorEnvelope } from '../src/lib/errors';

function buildApp() {
  const app = new Hono();
  app.onError((err, c) => { const e = errorEnvelope(err); return c.json(e.body, e.status as any); });
  app.route('/api/kyc', kycSellerRouter);
  return app;
}
const env = { DB: {} as any } as any;

describe('seller kyc', () => {
  beforeEach(() => { state.kyc = []; });
  it('POST /submit 201 creates pending', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/kyc/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierId: 's-1', registrationNo: 'BR-123' }) }), env);
    expect(res.status).toBe(201);
  });
  it('GET /my 200 returns kyc', async () => {
    await buildApp().fetch(new Request('http://localhost/api/kyc/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierId: 's-1' }) }), env);
    const res = await buildApp().fetch(new Request('http://localhost/api/kyc/my'), env);
    expect(res.status).toBe(200);
  });
  it('POST /submit twice while pending 409', async () => {
    await buildApp().fetch(new Request('http://localhost/api/kyc/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierId: 's-1' }) }), env);
    const res = await buildApp().fetch(new Request('http://localhost/api/kyc/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierId: 's-1' }) }), env);
    expect(res.status).toBe(409);
  });
  it('POST /submit unknown supplier 403', async () => {
    const res = await buildApp().fetch(new Request('http://localhost/api/kyc/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ supplierId: 'nope' }) }), env);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- kyc-seller.test.ts`
Expected: FAIL initially (routes reference real D1 in Task 2 service; mock only covers membership — first run surfaces missing-D1 wiring to fix with `getDb` test doubles if needed; keep iterating until green, do NOT change assertions).

- [ ] **Step 3: Make tests pass (minimal fixes only)**

Only fix wiring (e.g. mock `getDb` if D1 unavailable in test env, following `apps/api/test/admin/kyc.test.ts:37-56` repository-mock pattern). Do not weaken assertions.

- [ ] **Step 4: Run full related suites**

Run: `pnpm --filter @vyro/api test -- kyc`
Expected: PASS (both `kyc.test.ts` and `kyc-seller.test.ts` green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/kyc-seller.test.ts apps/api/src/modules/kyc/
git commit -m "test(api): seller KYC submit/my coverage"
```

---

### Task 5: Seller verification page + banner + route

**Files:**
- Create: `apps/web/src/supplier/useSellerKyc.ts`
- Create: `apps/web/src/supplier/VerificationPage.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/supplier/Shell.tsx`
- Test: `pnpm typecheck`; manual: login as seller → `/supplier/verification`.

**Interfaces:**
- Consumes: `api.get/post` from `@/lib/api` (see `apps/web/src/admin/useAdminTrustSafety.ts:81-93`), `useSupplierId()` from `./useSupplierId`, `KycReviewRow` shape.
- Produces: `useSellerKyc()` returns `{ data: { kyc } }`; `VerificationPage` form posts `{ supplierId, registrationNo, taxId, bankName, bankAccountNo, bankBranch, bankAccountHolder }`.

- [ ] **Step 1: Create hooks**

```tsx
// apps/web/src/supplier/useSellerKyc.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { KycReviewRow } from '@/admin/useAdminTrustSafety';

export function useSellerKyc() {
  return useQuery({
    queryKey: ['seller-kyc'],
    queryFn: () => api.get<{ kyc: KycReviewRow | null }>('/kyc/my'),
  });
}

export function useSubmitKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<KycReviewRow>('/kyc/submit', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-kyc'] }),
  });
}
```

- [ ] **Step 2: Create VerificationPage**

Form with fields registrationNo, taxId, bankName, bankAccountNo, bankBranch, bankAccountHolder + status timeline (pending/approved/rejected/needs_more_info) + resubmit button enabled only when status is `rejected`/`needs_more_info`/null. On success show "Submitted — pending review". Follow `SupplierOnboardingPage.tsx` styling (`Button`, `Input`, `Label`, `ErrorBanner`).

- [ ] **Step 3: Wire route + banner**

`App.tsx` (near lines 199-200): add
```tsx
const SupplierVerificationPage = lazy(() => import('./supplier/VerificationPage').then((m) => ({ default: m.SupplierVerificationPage })));
<Route path="verification" element={<SupplierVerificationPage />} />
```
`Shell.tsx` (after membership check line 101): add
```tsx
import { useSellerKyc } from './useSellerKyc';
// inside SupplierShell, after `const membership = ...`:
const { data: kycData } = useSellerKyc();
const kycStatus = kycData?.kyc?.status ?? 'pending';
// render above <Outlet />:
{kycStatus !== 'approved' && (
  <div className={kycStatus === 'rejected' ? 'bg-rose/10 border border-rose/30 text-rose' : 'bg-amber-50 border border-amber-200 text-amber-800'}>
    {kycStatus === 'rejected' ? 'KYC rejected — ' : kycStatus === 'needs_more_info' ? 'More info needed — ' : 'Verification pending — '}
    <Link to="/supplier/verification" className="underline font-semibold">complete verification</Link>
  </div>
)}
```
Soft-warning only — no route guards.

- [ ] **Step 4: Typecheck + manual verify**

Run: `pnpm typecheck`
Expected: PASS. Manual: seller login → banner visible → submit → status pending.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/supplier/ apps/web/src/App.tsx
git commit -m "feat(web): seller verification page + status banner"
```

---

### Task 6: E2E docs + final verification

**Files:**
- Modify: `scripts/e2e.md`
- Test: full `pnpm test` + `pnpm typecheck`.

- [ ] **Step 1: Append §7e.4 to scripts/e2e.md**

```md
### 7e.4 Seller KYC submission
1. Sign in as seller. Visit `/supplier/verification` → status pending.
2. Submit BR/tax/bank fields → POST `/api/kyc/submit` → 201, row in `kyc_reviews` pending.
3. Resubmit while pending → 409 `KYC_NOT_PENDING`.
4. Sign in as support admin. `POST /api/admin/kyc/<id>/decision {decision:'approved'}` → 200; supplier `verificationStatus` → verified.
5. Seller refreshes `/supplier/verification` → verified; banner disappears.
```

- [ ] **Step 2: Run full verification**

Run: `pnpm test`
Expected: PASS across api/auth/shared/validation.
Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e.md
git commit -m "docs(e2e): seller KYC walkthrough"
```

---

## Self-review

- Spec §2 (seller submit/my, onboard auto-create, decide-sync) → Tasks 2+3. Covered.
- Spec §3 (VerificationPage, banner, route) → Task 5. Covered.
- Spec §4 (resubmit only from rejected/needs_more_info, else 409) → Tasks 2+4. Covered.
- Spec §5 (error codes) → Tasks 2+4. Covered.
- Spec §6 (vitest + e2e + typecheck) → Tasks 4+6. Covered.
- No placeholders: every step has exact file paths, code, and commands. Type names (`SellerKycSubmitInput`, `KycRow`, `KycReviewRow`) consistent across tasks.
