# Purchase Orders Console — Premium Redesign

**Date:** 2026-10-08
**Scope:** `apps/web/src/pages/SupplierOrdersPage.tsx` (`/supplier/orders`) only. No changes to shared components, `tailwind.config.ts`, or `index.css`.

## Goal

Elevate the existing paper/volt/ink identity of the supplier Purchase Orders Console into a dramatically more premium "ops console" experience, without touching any other page or shared brand component.

## Approach

Extract the page's inline JSX into dedicated presentational components under `apps/web/src/components/orders/console/`, used only by this page. The page file keeps all data fetching, polling, mutations, dialogs, and filtering logic, and composes the new components.

## Components

All styling uses existing design tokens (ink/volt/copper/paper/bone, Syne/IBM Plex Sans/IBM Plex Mono, `ease-vyro`, existing keyframes) plus Tailwind arbitrary values. No new CSS or tokens.

- **ConsoleHero** — bespoke ink hero (replaces generic `PageHero` on this page only): grain + volt/copper glows, large Syne title with volt accent bar, Live Sync pill, Refresh/Publish actions, footer meta upgraded to an inline mini-metric cluster (pending / in fulfillment / in transit).
- **KpiMatrix** — 4 stat cards (icon medallion, tabular metric, status chip, hover lift); the revenue card is an inverted ink card with volt metric as the row's focal point.
- **PipelineRadar** — the 4 detached stage boxes become a connected pipeline: numbered nodes joined by a hairline connector track, active stage tinted with a pulsing dot, counts + sublabels.
- **QueueToolbar** — segmented tab control (ink active pill, volt count chips) + refined search input.
- **OrderRow** — richer order card: colored status spine on the left edge, mono PO number, StatusDots + PaymentStateBadge + Action Required chip, meta line (location · timestamp), right-aligned tabular amount, action cluster (Accept CTA / icon reject / Quick View / View →). Pending rows get an amber wash. Staggered fade-in.
- **QueueEmpty** — same three scenarios as today (search miss / no published products / queue clear with 3-step lifecycle), polished.
- **OrderDrawer** — Quick View converted from centered modal to a right-side slide-over: backdrop blur, sticky spec header, line-items list, net-total bar, link to full order. Escape/backdrop click closes. Enter transition driven by mounted state (no new keyframes).

## Behavior preserved

- TanStack Query polling (30s), accept-in-full, transitions with idempotency keys, POD dialog flow, reject-with-reason dialog, toasts, search + tab filtering, loading/error states.

## Verification

- `pnpm --filter @vyro/web typecheck`
- `pnpm --filter @vyro/web build`
- Lint if configured for the web app
- Visual check of the running page
