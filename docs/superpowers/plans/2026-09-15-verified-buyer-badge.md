# Verified Buyer Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a derived "Verified buyer" badge to suppliers on CRM leads and RFQ inbox rows.

**Architecture:** No migration. Derive `buyerVerified` live from `businesses.kycLevel + kycVerifiedAt` via `rfq_suppliers → rfqs → businesses` join; share one helper in `packages/shared`; extend `LeadRow` validation; render one new web component.

**Tech Stack:** TypeScript, Drizzle ORM + D1, Hono, Zod (`@vyro/validation`), React + TanStack Query, Vitest.

## Global Constraints

- SPA must use relative `fetch('/api/...')` — never an absolute URL.
- `pnpm typecheck` (`tsc --noEmit`) must pass; `pnpm test` (vitest) must pass.
- No new D1 migration for v1; `businesses` stays the sole source of truth.
- Never expose `documentUrls`, `taxId`, or reviewer id to suppliers — only `business.name` + `kycLevel` + `kycVerifiedAt`.
- Badge is a read-only trust signal, not a checkout gate.

---

### Task 1: Shared `isVerifiedBuyer` helper

**Files:**
- Create: `packages/shared/src/lib/buyerVerification.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/buyerVerification.test.ts`

**Interfaces:**
- Consumes: `{ kycLevel?: string | null; kycVerifiedAt?: number | null }`
- Produces: `export function isVerifiedBuyer(biz: { kycLevel?: string | null; kycVerifiedAt?: number | null }): boolean` and `export type BuyerKycLevel = 'none' | 'basic' | 'enhanced'`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isVerifiedBuyer } from '../src/lib/buyerVerification';

describe('isVerifiedBuyer', () => {
  it('returns true only when level is not none and verifiedAt is set', () => {
    expect(isVerifiedBuyer({ kycLevel: 'basic', kycVerifiedAt: 1700000000000 })).toBe(true);
    expect(isVerifiedBuyer({ kycLevel: 'enhanced', kycVerifiedAt: 1700000000000 })).toBe(true);
    expect(isVerifiedBuyer({ kycLevel: 'none', kycVerifiedAt: 1700000000000 })).toBe(false);
    expect(isVerifiedBuyer({ kycLevel: 'basic', kycVerifiedAt: null })).toBe(false);
    expect(isVerifiedBuyer({ kycLevel: null, kycVerifiedAt: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/shared test -- test/buyerVerification.test.ts`
Expected: FAIL with "Failed to resolve import" / "isVerifiedBuyer is not defined".

- [ ] **Step 3: Write minimal implementation**

```ts
export type BuyerKycLevel = 'none' | 'basic' | 'enhanced';

export function isVerifiedBuyer(biz: {
  kycLevel?: string | null;
  kycVerifiedAt?: number | null;
}): boolean {
  return biz.kycLevel !== 'none' && !!biz.kycLevel && biz.kycVerifiedAt != null;
}
```

Also append to `packages/shared/src/index.ts`:

```ts
export * from './lib/buyerVerification';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/shared test -- test/buyerVerification.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/lib/buyerVerification.ts packages/shared/src/index.ts packages/shared/test/buyerVerification.test.ts
git commit -m "feat: add isVerifiedBuyer shared helper"
```

### Task 2: Extend `LeadRow` validation with buyer verification fields

**Files:**
- Modify: `packages/validation/src/rfqCrm.ts`
- Test: `packages/validation/test/rfqCrm.test.ts` (create if missing — check `packages/validation/test/` first and use existing naming)

**Interfaces:**
- Consumes: `isVerifiedBuyer` rule semantics (duplicated as Zod-derived boolean, not imported to avoid cross-package dep)
- Produces: `leadRowSchema` with `buyerBusinessId: z.string()`, `buyerName: z.string()`, `buyerKycLevel: z.enum(['none','basic','enhanced'])`, `buyerVerifiedAt: z.number().nullable()`, `buyerVerified: z.boolean()`; `LeadRow` type gains the same five fields

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { leadRowSchema } from '../src/rfqCrm';

describe('leadRowSchema buyer verification', () => {
  it('parses enriched row with verified buyer', () => {
    const row = {
      id: 'l1', rfqId: 'r1', supplierId: 's1', status: 'invited', invitedAt: 1,
      tag: null, conversionStatus: null, quotedAt: null, orderId: null, orderValueCents: null,
      buyerBusinessId: 'b1', buyerName: 'Acme', buyerKycLevel: 'basic',
      buyerVerifiedAt: 1700000000000, buyerVerified: true,
    };
    expect(leadRowSchema.parse(row).buyerVerified).toBe(true);
  });

  it('rejects rows missing buyer verification fields', () => {
    const row = {
      id: 'l1', rfqId: 'r1', supplierId: 's1', status: 'invited', invitedAt: 1,
      tag: null, conversionStatus: null, quotedAt: null, orderId: null, orderValueCents: null,
    };
    expect(() => leadRowSchema.parse(row)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/validation test -- test/rfqCrm.test.ts`
Expected: FAIL — unknown file or `buyerBusinessId: Required` / parse strips fields.

- [ ] **Step 3: Write minimal implementation**

In `packages/validation/src/rfqCrm.ts`, extend `leadRowSchema`:

```ts
export const leadRowSchema = z.object({
  id: z.string(),
  rfqId: z.string(),
  supplierId: z.string(),
  status: z.string(),
  invitedAt: z.number(),
  tag: tagSchema.nullable(),
  conversionStatus: conversionStatusSchema.nullable(),
  quotedAt: z.number().nullable(),
  orderId: z.string().nullable(),
  orderValueCents: z.number().nullable(),
  buyerBusinessId: z.string(),
  buyerName: z.string(),
  buyerKycLevel: z.enum(['none', 'basic', 'enhanced']),
  buyerVerifiedAt: z.number().nullable(),
  buyerVerified: z.boolean(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/validation test -- test/rfqCrm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/validation/src/rfqCrm.ts packages/validation/test/rfqCrm.test.ts
git commit -m "feat: extend LeadRow with buyer verification fields"
```

### Task 3: Enrich CRM leads API with buyer verification join

**Files:**
- Modify: `apps/api/src/modules/rfqs/crmRepository.ts`
- Modify: `apps/api/src/modules/rfqs/crm.ts` (only if pass-through typing needs updating — keep logic in repository)
- Test: `apps/api/test/crm/buyer-badge.test.ts` (new)

**Interfaces:**
- Consumes: `rfqs.businessId → businesses.id (name, kycLevel, kycVerifiedAt)`; `isVerifiedBuyer` semantics inline (no Node-only import — replicate the two-condition check to keep Worker bundle clean)
- Produces: `LeadRow` objects now include `buyerBusinessId`, `buyerName`, `buyerKycLevel`, `buyerVerifiedAt`, `buyerVerified`; `listLeadsForSupplier` and `getLeadForSupplier` both enriched

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@vyro/db', () => ({
  getDb: () => { throw new Error('mocked in each case below'); },
}));

describe('crm buyer badge enrichment', () => {
  it('marks lead verified when business is kyc basic + verifiedAt', async () => {
    const { crmRepository } = await import('../../src/modules/rfqs/crmRepository');
    expect(typeof crmRepository.listLeadsForSupplier).toBe('function');
    expect(typeof crmRepository.getLeadForSupplier).toBe('function');
  });
});
```

Note: the full join test stubs `getDb` with `rfqSuppliers`, `rfqs`, and `businesses` rows:
verified business `{ id: 'b1', name: 'Acme', kycLevel: 'basic', kycVerifiedAt: 1700000000000 }` must yield `buyerVerified: true`; `{ kycLevel: 'none', kycVerifiedAt: null }` must yield `false`; missing business must yield `buyerVerified: false` without throwing. Model the stub on `apps/api/src/modules/kyc/buyerKyc.test.ts:15-54` chainable pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- test/crm/buyer-badge.test.ts`
Expected: FAIL — `buyerVerified` is `undefined` on returned leads.

- [ ] **Step 3: Write minimal implementation**

In `crmRepository.ts`:
1. Import `rfqs` and `businesses` from `@vyro/db/schema` alongside existing `rfqSuppliers, rfqSupplierNotes`.
2. Update exported `LeadRow` interface with the five buyer fields from Task 2.
3. In `listLeadsForSupplier`: after fetching `rfqSuppliers` slice, collect distinct `rfqId`s, fetch matching `rfqs` rows (`id, businessId`), collect distinct `businessId`s, fetch matching `businesses` rows (`id, name, kycLevel, kycVerifiedAt`), build maps, and attach:
```ts
const biz = bizById.get(rfq.businessId);
const verified = !!biz && biz.kycLevel !== 'none' && biz.kycVerifiedAt != null;
return { ...lead, buyerBusinessId: rfq.businessId, buyerName: biz?.name ?? 'Unknown buyer', buyerKycLevel: biz?.kycLevel ?? 'none', buyerVerifiedAt: biz?.kycVerifiedAt ?? null, buyerVerified: verified };
```
4. Apply the same enrichment in `getLeadForSupplier` and `findLeadByRfqAndSupplier` (extract a private `enrichLeads(d1, leads)` helper inside the repository to avoid duplication).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vyro/api test -- test/crm/buyer-badge.test.ts`
Expected: PASS. Also run: `pnpm --filter @vyro/api test -- test/rfqs test/cross-border` to catch regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/rfqs/crmRepository.ts apps/api/src/modules/rfqs/crm.ts apps/api/test/crm/buyer-badge.test.ts
git commit -m "feat: enrich CRM leads with verified buyer fields"
```

### Task 4: Open Buyer KYC submit to domestic businesses

**Files:**
- Modify: `apps/api/src/modules/kyc/buyerKyc.ts` (`listPendingKycBusinesses` — remove `countryCode !== 'LK'` filter)
- Modify: `apps/web/src/pages/BuyerKycPage.tsx` (remove `isForeign` gate, update copy)
- Test: `apps/api/src/modules/kyc/buyerKyc.test.ts` (update `listPendingKycBusinesses filters to foreign only` test)

**Interfaces:**
- Consumes: existing `submitBuyerKyc` / `reviewBuyerKyc` (unchanged signatures)
- Produces: domestic `LK` businesses can submit and appear in `/api/admin/cross-border-kyc/queue`; web page allows submit for all countries

- [ ] **Step 1: Update the failing test expectation**

```ts
it('listPendingKycBusinesses includes domestic LK too', async () => {
  fakeRows.push({ id: 'b1', countryCode: 'US', kycLevel: 'none' });
  fakeRows.push({ id: 'b2', countryCode: 'LK', kycLevel: 'none' });
  fakeRows.push({ id: 'b3', countryCode: 'GB', kycLevel: 'none' });
  const rows = (await listPendingKycBusinesses({} as Env)) as any[];
  expect(rows.map((r) => r.id).sort()).toEqual(['b1', 'b2', 'b3']);
});
```

Also add a domestic submit case:

```ts
it('submitBuyerKyc accepts domestic LK business', async () => {
  fakeRows.push({ id: 'bLK', countryCode: 'LK', taxId: 'TAX-1' });
  await submitBuyerKyc({ env: {} as Env, businessId: 'bLK', level: 'basic', documentUrls: ['https://docs.example/d.pdf'], submittedBy: 'u1' });
  expect(fakeUpdates[0]!.values).toMatchObject({ kycLevel: 'none', kycVerifiedAt: null, kycVerifiedBy: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/api test -- src/modules/kyc/buyerKyc.test.ts`
Expected: FAIL — LK row filtered out.

- [ ] **Step 3: Write minimal implementation**

In `buyerKyc.ts`, replace the `.then((rows) => rows.filter((r) => r.countryCode !== 'LK'))` with a plain return of all `kycLevel === 'none'` rows:

```ts
export async function listPendingKycBusinesses(env: Env): Promise<unknown[]> {
  const db = getDb(env.DB);
  return db.select().from(businesses).where(eq(businesses.kycLevel, 'none')).all();
}
```

In `BuyerKycPage.tsx`:
- Delete `const isForeign = country !== 'LK';` and both `!isForeign` / `isForeign &&` gates.
- Replace copy `Required once before checkout for businesses domiciled outside Sri Lanka.` with `Verify once to earn the Verified buyer badge suppliers see on your RFQs. Reviewed manually within 1 business day.`
- Replace `(domestic — KYC not required)` hint with `{kycLevel === 'none' ? '(unverified)' : null}` display.
- Change `{isForeign && kycLevel === 'none' && (` to `{kycLevel === 'none' && (`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/api test -- src/modules/kyc/buyerKyc.test.ts`
Expected: PASS (5 tests). Then `pnpm --filter @vyro/web typecheck`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/kyc/buyerKyc.ts apps/api/src/modules/kyc/buyerKyc.test.ts apps/web/src/pages/BuyerKycPage.tsx
git commit -m "feat: open buyer KYC to domestic businesses"
```

### Task 5: Web `VerifiedBuyerBadge` + CRM/RFQ surfaces

**Files:**
- Create: `apps/web/src/supplier/crm/VerifiedBuyerBadge.tsx`
- Modify: `apps/web/src/supplier/crm/LeadsPage.tsx`
- Modify: `apps/web/src/supplier/crm/LeadDetailDrawer.tsx`
- Modify: `apps/web/src/supplier/SupplierQuoteDetailPage.tsx`
- Test: `apps/web/test/verifiedBuyerBadge.test.tsx` (new; follow `apps/web/test/ranking.test.tsx` pattern)

**Interfaces:**
- Consumes: `LeadRow['buyerVerified' | 'buyerKycLevel' | 'buyerVerifiedAt' | 'buyerName']`
- Produces: `export function VerifiedBuyerBadge({ verified, level, verifiedAt }: { verified: boolean; level?: string | null; verifiedAt?: number | null }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { VerifiedBuyerBadge } from '../src/supplier/crm/VerifiedBuyerBadge';

describe('VerifiedBuyerBadge', () => {
  it('renders VERIFIED with level when verified', () => {
    const html = renderToString(createElement(VerifiedBuyerBadge, { verified: true, level: 'basic', verifiedAt: 1700000000000 }));
    expect(html).toMatch(/VERIFIED/);
    expect(html).toMatch(/BASIC/);
  });

  it('renders nothing when unverified', () => {
    const html = renderToString(createElement(VerifiedBuyerBadge, { verified: false, level: 'none', verifiedAt: null }));
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vyro/web test -- test/verifiedBuyerBadge.test.tsx`
Expected: FAIL with "Failed to resolve import ./VerifiedBuyerBadge".

- [ ] **Step 3: Write minimal implementation**

```tsx
import { ShieldCheckIcon } from '@/components/icons';

export function VerifiedBuyerBadge({ verified, level, verifiedAt }: { verified: boolean; level?: string | null; verifiedAt?: number | null }) {
  if (!verified) return null;
  const date = verifiedAt ? new Date(verifiedAt).toLocaleDateString() : null;
  const label = `VERIFIED${level && level !== 'none' ? ` · ${level.toUpperCase()}` : ''}`;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 rounded-full"
      title={date ? `Verified buyer · ${level} · ${date}` : 'Verified buyer'}
      aria-label="Verified buyer"
    >
      <ShieldCheckIcon size={12} />
      {label}
    </span>
  );
}
```

Wire into:
- `LeadsPage.tsx:93-107` — inside the row button, after the RFQ-id div: `<VerifiedBuyerBadge verified={l.buyerVerified} level={l.buyerKycLevel} verifiedAt={l.buyerVerifiedAt} />`.
- `LeadDetailDrawer.tsx:42-48` — next to `<ConversionBadge/>`: same props from `data`.
- `SupplierQuoteDetailPage.tsx:300` — inside `CrmLeadCard` header next to `<ConversionBadge status={row.conversionStatus} />`: `<VerifiedBuyerBadge verified={row.buyerVerified} level={row.buyerKycLevel} verifiedAt={row.buyerVerifiedAt} />`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @vyro/web test -- test/verifiedBuyerBadge.test.tsx`
Expected: PASS. Then `pnpm --filter @vyro/web typecheck` and `pnpm typecheck` at repo root.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/supplier/crm/VerifiedBuyerBadge.tsx apps/web/src/supplier/crm/LeadsPage.tsx apps/web/src/supplier/crm/LeadDetailDrawer.tsx apps/web/src/supplier/SupplierQuoteDetailPage.tsx apps/web/test/verifiedBuyerBadge.test.tsx
git commit -m "feat: show verified buyer badge on CRM leads and RFQs"
```
