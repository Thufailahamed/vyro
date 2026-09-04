# VYRO Profile Settings — Sub-project D Design

**Date:** 2026-09-05
**Status:** Approved
**Predecessor:** sub-projects A (foundations), B (supplier), C (admin)

## Goal

Make the existing `/profile` page actionable: wire the 3 already-built user-settings endpoints (profile / notifications / security) into the page as editable forms with save buttons and toast feedback.

## Scope

3 new form components nested into the existing `ProfilePage`:

| Section | Endpoint pair | Fields |
|---|---|---|
| Profile | `GET` / `PATCH /api/settings/me` | displayName, avatarUrl, phone |
| Notifications | `GET` / `PATCH /api/settings/me/notifications` | orderUpdates, messages, marketing (booleans) |
| Security | `GET` / `PATCH /api/settings/me/security` | twoFactorEnabled (bool), sessionTimeoutMin (15 / 30 / 60 / 240 / 1440) |

Each form lives inside a shared `<ProfileSettingsSection>` chrome with title + sub + save button.

## Files

Create:
- `apps/web/src/pages/profile/ProfileSettingsSection.tsx`
- `apps/web/src/pages/profile/ProfileForm.tsx`
- `apps/web/src/pages/profile/NotificationsForm.tsx`
- `apps/web/src/pages/profile/SecurityForm.tsx`

Modify:
- `apps/web/src/pages/ProfilePage.tsx` — render 3 new sections below existing business/supplier panels

No API changes. No schema changes. No new tests.

## Architecture

- Each form owns its own `useQuery` for hydration + `useMutation` for save
- `ProfileSettingsSection` provides chrome only (title, sub, save trigger, disabled state)
- Mutations invalidate only their own queryKey
- All errors via `useToast()`; inline validation surfaced as plain text under the offending field

## Data flow

Mount → GET endpoint → form draft populated → user edits → Save → PATCH → invalidate → toast. Save button disabled while `draft === initial` or while `isPending`.

## Error handling

- 401: handled by existing AuthProvider
- 400: extract `details.fieldErrors` from envelope; render under first field
- Network: toast error
- Optimistic state never assumed — always wait for PATCH response

## Verification

- Backend: `pnpm exec vitest run` — existing 89 + 1 skip stays green
- Frontend: `pnpm typecheck` + `pnpm --filter @vyro/web build`
- Manual: edit profile, save, reload, see updated value

## Out of scope

- Password change (no backend endpoint)
- Account deletion
- Real MFA enrollment (2FA toggle is data-only)
- Avatar upload (URL field only)
