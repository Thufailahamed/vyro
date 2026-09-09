# Verification Documents Viewer — Design

Date: 2026-09-09
Approach: A — case-linked viewer panel (approved)
Related: `docs/superpowers/specs/2026-09-09-portal-admin-full-access-design.md`

## 1. Context

KYC reviews, abuse reports, and supplier/business verification already exist
under Trust & Safety (`apps/api/src/modules/admin/trustSafety/`,
`TrustSafetyPage.tsx`). The gap (user-confirmed): reviewers cannot see the
uploaded identity/business documents tied to a case. Documents live in R2
(keyed via `apps/api/src/modules/documents/repository.ts` `buildR2Key`).

Scope (user-confirmed): view-only. No in-viewer decisions, no annotations,
no re-request. Decisions stay in existing KYC decision and
supplier/business verification controls.

## 2. Architecture

New backend file `apps/api/src/modules/admin/trustSafety/documentsAdmin.ts`,
mounted in the existing trust-safety router serving `/api/admin/kyc`:

- `GET /api/admin/kyc/:id/documents` → file list for a case: id, filename,
  mime, size, uploadedAt. Resolved from `documents`/`invoiceUploads` rows by
  the `userId`/`businessId`/`supplierId` on the KYC record.
- `GET /api/admin/documents/:id/preview` → streams bytes from R2 with
  correct `Content-Type` and `Content-Disposition: inline` (or attachment
  with `?download=1`). Bucket stays private; Worker streams.

Frontend: `apps/web/src/admin/DocumentViewer.tsx` +
`apps/web/src/admin/useAdminDocuments.ts`, rendered as a panel inside
`TrustSafetyPage` next to decision controls. No new route, no new nav
entry, no schema changes.

## 3. Components

Case documents panel: file list with filename, type badge (NIC, BR, utility
bill, other via existing `autoByDesc` mapping), size, upload date. Empty
state: "No documents uploaded."

Preview modal: images inline, PDFs in `<iframe>`, other types download via
`?download=1`. Backdrop/Esc close, focus trapped.

Non-goals: approve/reject in viewer, annotations, re-request flow, unified
cross-entity queue (future spec).

## 4. Data flow, RBAC, audit

Panel loads via React Query on case select (`['admin-case-docs', kycId]`),
no polling. Preview fetch uses `credentials: include` (admin session
cookies). R2 never publicly exposed.

RBAC: both endpoints require `kyc:read`. Super-admin passes; others 403.

Audit: reads write no audit rows (avoid spam). Explicit download
(`?download=1`) writes one `document.view` entry with case id + document id
via `auditAdmin`.

## 5. Error handling

- R2 object missing → 404 "file not found in storage"; row kept, panel
  shows badge.
- Unknown/unsupported mime → download fallback.
- Truncated stream → client `Content-Length` check with retry prompt.

## 6. Testing

Vitest: 403 without `kyc:read`, 404 for unknown document id, list scoped to
the case's files only. Web `tsc --noEmit` for new components.
