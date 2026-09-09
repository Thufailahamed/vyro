# Verification Documents Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let reviewers preview the uploaded documents tied to a KYC case, view-only, inside Trust & Safety.

**Architecture:** Case file list added to `kycRoutes.ts`; R2 streaming preview in new `documentsAdmin.ts` mounted at `/api/admin/documents` in `apps/api/src/index.ts`; viewer panel replaces the raw `documentsJson` dump in the KYC detail modal in `TrustSafetyPage.tsx`.

**Tech Stack:** Hono + Drizzle (D1) + R2 + Zod + React Query + Vitest. Commands run from repo root with pnpm.

## Global Constraints

- Node 20+, pnpm 9+.
- SPA must use relative `fetch('/api/...')` via `@/lib/api` — never absolute URLs.
- R2 bucket stays private; browser never gets direct bucket access.
- Both endpoints require `kyc:read`; others get 403.
- Reads write no audit rows; explicit download writes one `document.view` entry.
- `pnpm typecheck` must pass; touched vitest suites must pass.

---

## Scope note

Single focused spec (`docs/superpowers/specs/2026-09-09-verification-documents-viewer-design.md`). Two independently shippable tasks: Task 1 (backend) → Task 2 (frontend).

### Task 1: Case documents API + R2 preview

**Files:**
- Modify: `apps/api/src/modules/admin/trustSafety/kycRoutes.ts`
- Create: `apps/api/src/modules/admin/trustSafety/documentsAdmin.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/test/admin/kycDocuments.test.ts`

**Interfaces:**
- Consumes: `getKyc` from `./kycRepository`; `invoiceUploads` table from `@vyro/db/schema`; `c.env.INVOICES` R2Bucket; `auditAdmin` from `../lib/audit`; `adminKycIdParam` from `@vyro/validation`.
- Produces: `GET /api/admin/kyc/:id/documents` → `{ documents: Array<{ id: string; filename: string; mimeType: string; sizeBytes: number; createdAt: number }> }`; `GET /api/admin/documents/:id/preview[?download=1]` → file bytes with `Content-Type`, `Content-Disposition`.

Resolution rule (exact): parse the case's `documentsJson` as a JSON string array of `invoiceUploads` ids (tolerate null/non-JSON → empty set); union with `invoiceUploads` rows where `uploadedByUserId` equals the case `userId`. Return rows the requester may see (all, under `kyc:read`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/test/admin/kycDocuments.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { AdminRole } from '@vyro/auth';

vi.mock('../../src/env', () => ({
  env: {
    WEB_ORIGIN: 'http://localhost:5173',
    ADMIN_ORIGIN: 'http://localhost:5174',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'http://localhost:8787',
    ENVIRONMENT: 'test',
  },
}));

import kycRouter from '../../src/modules/admin/trustSafety/kycRoutes';
import documentsAdmin from '../../src/modules/admin/trustSafety/documentsAdmin';
import { errorEnvelope } from '../../src/lib/errors';

function appWith(router: any, adminRole: AdminRole | null) {
  const app = new Hono();
  app.onError((err, c) => {
    const e = errorEnvelope(err);
    return c.json(e.body, e.status as any);
  });
  app.use('*', async (c, next) => {
    c.set('ctx', {
      userId: 'u1',
      email: 'a@x.example',
      isAdmin: adminRole !== null,
      adminRole,
      businesses: [],
      suppliers: [],
    } as any);
    await next();
  });
  app.route('/', router);
  return app;
}

describe('kyc case documents', () => {
  it('403 without kyc:read on documents list', async () => {
    const res = await appWith(kycRouter, null).request('/some-id/documents');
    expect([401, 403]).toContain(res.status);
  });

  it('403 without kyc:read on preview', async () => {
    const res = await appWith(documentsAdmin, null).request('/some-id/preview');
    expect([401, 403]).toContain(res.status);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/kycDocuments.test.ts`
Expected: FAIL with "Cannot find module '../../src/modules/admin/trustSafety/documentsAdmin'"

- [ ] **Step 3: Implement case documents list in kycRoutes.ts**

Append to `apps/api/src/modules/admin/trustSafety/kycRoutes.ts` (add imports for `getDb`, `invoiceUploads`, `eq`/`inArray` from drizzle-orm):

```ts
import { getDb } from '@vyro/db';
import { invoiceUploads } from '@vyro/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getKyc } from './kycRepository';

router.get('/:id/documents', requirePermission('kyc:read'), async (c) => {
  const parsed = adminKycIdParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const row = await getKyc(c.env.DB, parsed.data.id);
  if (!row) throw httpError(404, 'NOT_FOUND', 'KYC review not found');
  let refIds: string[] = [];
  if (row.documentsJson) {
    try {
      const v: unknown = JSON.parse(row.documentsJson);
      if (Array.isArray(v)) refIds = v.filter((x): x is string => typeof x === 'string');
    } catch {
      refIds = [];
    }
  }
  const db = getDb(c.env.DB);
  const byRef = refIds.length
    ? await db.select().from(invoiceUploads).where(inArray(invoiceUploads.id, refIds)).all()
    : [];
  const byUser = await db
    .select()
    .from(invoiceUploads)
    .where(eq(invoiceUploads.uploadedByUserId, row.userId))
    .all();
  const seen = new Map(byRef.concat(byUser).map((r) => [r.id, r]));
  return c.json({
    documents: [...seen.values()].map((r) => ({
      id: r.id,
      filename: r.originalFilename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      createdAt: r.createdAt,
    })),
  });
});
```

- [ ] **Step 4: Implement documentsAdmin.ts preview router**

```ts
// apps/api/src/modules/admin/trustSafety/documentsAdmin.ts
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../../../env';
import { session } from '../../../middleware/session';
import { requirePermission } from '../../../middleware/rbac';
import { httpError } from '../../../lib/errors';
import { getDb } from '@vyro/db';
import { invoiceUploads } from '@vyro/db/schema';
import { eq } from 'drizzle-orm';
import { auditAdmin } from '../lib/audit';

const router = new Hono<{ Bindings: Env }>();
router.use('*', session());

const idParam = z.object({ id: z.string().min(1) }).strict();

router.get('/:id/preview', requirePermission('kyc:read'), async (c) => {
  const parsed = idParam.safeParse(c.req.param());
  if (!parsed.success) throw httpError(400, 'VALIDATION_ERROR', 'Invalid id');
  const db = getDb(c.env.DB);
  const row = await db.select().from(invoiceUploads).where(eq(invoiceUploads.id, parsed.data.id)).get();
  if (!row) throw httpError(404, 'NOT_FOUND', 'Document not found');
  const obj = await c.env.INVOICES.get(row.r2Key);
  if (!obj) throw httpError(404, 'NOT_FOUND', 'File not found in storage');
  const download = c.req.query('download') === '1';
  if (download) {
    await auditAdmin({
      ctx: c,
      action: 'document.view',
      target: { type: 'document', id: row.id },
      after: { filename: row.originalFilename },
    });
  }
  return new Response(obj.body as ReadableStream, {
    headers: {
      'content-type': obj.httpMetadata?.contentType ?? row.mimeType,
      'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${row.originalFilename}"`,
    },
  });
});

export default router;
```

Mount in `apps/api/src/index.ts` next to the existing KYC mount:

```ts
import adminDocumentsRouter from './modules/admin/trustSafety/documentsAdmin';
app.route('/api/admin/documents', adminDocumentsRouter);
```

Run: `pnpm --filter @vyro/api exec vitest run test/admin/kycDocuments.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/trustSafety/kycRoutes.ts apps/api/src/modules/admin/trustSafety/documentsAdmin.ts apps/api/src/index.ts apps/api/test/admin/kycDocuments.test.ts
git commit -m "feat(api): kyc case documents list + R2 preview"
```

### Task 2: Viewer panel in Trust & Safety

**Files:**
- Create: `apps/web/src/admin/useAdminDocuments.ts`, `apps/web/src/admin/DocumentViewer.tsx`
- Modify: `apps/web/src/admin/TrustSafetyPage.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/kyc/:id/documents` and `GET /api/admin/documents/:id/preview` from Task 1.
- Produces: `useCaseDocuments(kycId)` hook; `DocumentViewer({ kycId })` component rendering file list + preview modal; replaces the raw `documentsJson` dump in the KYC detail modal.

- [ ] **Step 1: Write the hook**

```ts
// apps/web/src/admin/useAdminDocuments.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CaseDocument = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
};

export function useCaseDocuments(kycId: string | null) {
  return useQuery({
    queryKey: ['admin-case-docs', kycId],
    queryFn: () => api.get<{ documents: CaseDocument[] }>(`/admin/kyc/${kycId}/documents`),
    enabled: Boolean(kycId),
  });
}

export function previewUrl(id: string, download = false) {
  return `/api/admin/documents/${id}/preview${download ? '?download=1' : ''}`;
}
```

- [ ] **Step 2: Write the viewer component**

```tsx
// apps/web/src/admin/DocumentViewer.tsx
import { useState } from 'react';
import { useCaseDocuments, previewUrl, type CaseDocument } from './useAdminDocuments';

function kindOf(mime: string): 'image' | 'pdf' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  return 'other';
}

export function DocumentViewer({ kycId }: { kycId: string }) {
  const { data, isLoading, isError } = useCaseDocuments(kycId);
  const [open, setOpen] = useState<CaseDocument | null>(null);
  if (isLoading) return <p className="text-sm text-ink-500">Loading documents…</p>;
  if (isError) return <p className="text-sm text-rose">Could not load documents.</p>;
  const docs = data?.documents ?? [];
  if (!docs.length) return <p className="text-sm text-ink-500">No documents on file.</p>;
  const kind = open ? kindOf(open.mimeType) : null;
  return (
    <div className="space-y-1">
      {docs.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => setOpen(d)}
          className="w-full text-left font-mono text-xs underline"
        >
          {d.filename} <span className="text-ink-500">({Math.round(d.sizeBytes / 1024)} KB)</span>
        </button>
      ))}
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(null)}
        >
          <div className="bg-paper border border-ink/10 max-w-3xl w-full p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-mono text-xs break-all">{open.filename}</h4>
              <div className="flex gap-2">
                <a href={previewUrl(open.id, true)} className="text-xs underline">Download</a>
                <button type="button" onClick={() => setOpen(null)} className="text-xs underline">Close</button>
              </div>
            </div>
            {kind === 'image' ? (
              <img src={previewUrl(open.id)} alt={open.filename} className="max-h-[70vh] mx-auto" />
            ) : kind === 'pdf' ? (
              <iframe src={previewUrl(open.id)} title={open.filename} className="w-full h-[70vh]" />
            ) : (
              <p className="text-sm">Preview not available — use Download.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Wire into the KYC detail modal**

In `apps/web/src/admin/TrustSafetyPage.tsx`, import `DocumentViewer` and replace the raw dump:

```tsx
import { DocumentViewer } from './DocumentViewer';
```

```tsx
<dt className="text-ink-500">Documents</dt>
<dd><DocumentViewer kycId={detail.data.id} /></dd>
```

replacing:

```tsx
<dt className="text-ink-500">Documents</dt>
<dd className="font-mono text-xs whitespace-pre-wrap break-all">
  {detail.data.documentsJson ?? 'No documents on file.'}
</dd>
```

Verify: `pnpm --filter @vyro/web exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Full verification**

Run: `pnpm --filter @vyro/api exec vitest run test/admin/kycDocuments.test.ts test/admin/kyc.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/admin/useAdminDocuments.ts apps/web/src/admin/DocumentViewer.tsx apps/web/src/admin/TrustSafetyPage.tsx
git commit -m "feat(admin): documents viewer panel in trust-safety"
```
