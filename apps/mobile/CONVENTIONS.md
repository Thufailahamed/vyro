# VYRO Mobile — conventions

The Expo app is a native port of `apps/web`. It talks to the same Worker API
(`apps/api`) with **no backend changes**. Read this before adding a screen.

## Stack

- Expo SDK 57, React Native 0.86, React 19, TypeScript strict
- Expo Router (file routes under `src/app/`)
- TanStack Query v5 for all server state
- `react-native-svg` for charts/brand art, `react-native-reanimated` 4 for motion
- `lucide-react-native` icons (same icon family as the web)
- Fonts: Syne (display), IBM Plex Sans (UI), IBM Plex Mono (numbers)

Every needed dependency is already installed. Do not add packages.

## Layout of the code

```
src/
  app/                 routes only — keep these files thin
  features/<area>/     screens, hooks, API types and area-specific components
  ui/                  shared design system (import from '@/ui')
  lib/                 api, auth, format, status, files, haptics
  theme/tokens.ts      colors, fonts, type scale, radii, shadows, tones
```

A route file should usually be two lines:

```tsx
import { SupplierOrdersScreen } from '@/features/supplier/orders/SupplierOrdersScreen';
export default SupplierOrdersScreen;
```

## Talking to the API

```ts
import { api, qs, errorMessage, assetUrl } from '@/lib/api';
import { useAuth, useBusinessId, useSupplierId } from '@/lib/auth';

api.get<T>('/cart' + qs({ businessId }));
api.post<T>('/purchase-orders', body, { idempotencyKey: true });
api.patch / api.put / api.del
api.upload<T>('/documents', formData);           // multipart; build with appendFile() from '@/lib/files'
```

- Paths are relative to `/api` — identical to the web's `api.get('/…')` calls,
  so copy endpoints straight from the web page you are porting.
- Session cookies, the `Origin` header and CSRF are handled inside `lib/api.ts`.
- **Money is integer cents (LKR).** Display with `formatLKR`, `formatCompactLKR`, `formatRs`.
- Dates: `formatDate`, `formatDateTime`, `timeAgo`. Enums: `humanize()`.
- Status strings → badge: `<StatusBadge status={o.status} />` (tone via `lib/status.ts`).
- Active org: the web always uses `memberships[0]`; mobile lets the user switch,
  so always use `useBusinessId()` / `useSupplierId()` rather than indexing memberships.
- Use `useQuery` / `useMutation`; after a mutation `invalidateQueries` the keys
  it affects, and show `useToast().success(...)` / `.error(title, errorMessage(e))`.
- Wrap query rendering in `<QueryView query={q} empty={...}>` for consistent
  loading / error / empty states, or use `SkeletonList` / `ErrorState` directly.
- Pickers: `pickImage({ camera })`, `pickDocument()` from `@/lib/files`.
  Opening a document URL: `openDocument(path)`.

## Design rules (match the web)

The web brand is editorial and warm: bone/paper grounds, near-black ink,
one electric **volt** accent, a **copper** counter-accent, Syne headlines,
mono numerals. Premium comes from restraint, rhythm and motion — not colour.

- Every screen renders inside `<Screen>` (scrolling) or `<ListScreen>` (FlatList).
  Tab screens pass `tabBar` so content clears the floating tab bar.
- Headers: `<Screen kicker="Operations" title="Orders" subtitle="…" back right={…}>`.
  Kickers are short uppercase section labels, copper on light / volt on dark.
- Surfaces: `<Card kind="flat|elevated|ink|volt|bone|copper|outline">`.
  Use **one** ink hero (`<InkHero seed=…>` or `<Card kind="ink" flow="seed">`) at
  the top of dashboards for the signature look; keep the rest flat/paper.
- KPIs: `<StatGrid><Stat label value hint delta icon /></StatGrid>`; money in mono.
- Lists: `<ListCard>` + `<ListRow>`; for long lists, `<ListScreen data renderItem>`
  with each item a `<Card onPress>`.
- Filters: `<ChipRow>` (horizontal) or `<Segmented>` (2–4 options).
- Forms: `<Field label hint error><Input/></Field>`, `<Select>`, `<Stepper>`,
  `<ToggleRow>`, `<RadioCards>`, `<Checkbox>`. Put the primary CTA in the
  `<Screen footer={…}>` so it sticks above the home indicator.
- Sheets: `<Sheet visible onClose title>` for secondary forms/filters,
  `<ConfirmSheet>` for destructive/irreversible actions (always confirm those).
- Charts: `AreaChart`, `BarChart`, `RankBars`, `Donut`, `Sparkline` from `@/ui`.
- Progress: `<Timeline steps>` (vertical) for order/delivery/RFQ lifecycles,
  `<Steps>` for multi-step forms, `<ProgressBar>`.
- Images: `<ProductImage src seed>` (falls back to seeded ink art).
- Pull-to-refresh on every data screen: `onRefresh={() => q.refetch()}`.
- Never hard-code hex values in features; use `colors.*` from `@/theme/tokens`.
- Copy: short, confident, specific ("Dispatch order", not "Submit").
- Keep every web feature. When a web page has tabs/sections, use a
  `Segmented`/`ChipRow` or a hub screen that links to sub-screens.

## Access control

Wrap screens that need a session with `Gate` from `@/features/common/Gate`:
`<Gate need="auth|business|supplier|admin">`. The supplier and admin portal
layouts already gate on membership / admin. Admin permission checks use the
same role → permission map as the web (`packages/auth/src/rolePermissions.ts`);
hide actions the role cannot perform.

## Route map

Every route below is owned by one area. Link to other areas' routes freely —
they will exist.

### Shared
| Route | Screen |
| --- | --- |
| `/welcome`, `/login`, `/signup`, `/forgot`, `/reset`, `/two-factor` | auth (done) |
| `/onboarding/business`, `/onboarding/supplier` | onboarding |
| `/notifications` | notification inbox |
| `/settings` | settings hub → `/settings/profile`, `/settings/security`, `/settings/notifications`, `/settings/ai`, `/settings/data` |
| `/legal/[kind]` (`terms`/`privacy`/`cookies`), `/status`, `/about`, `/how-it-works`, `/sponsored-disclosure` | info pages |

### Buyer — `/buyer`
| Route | Screen |
| --- | --- |
| `/buyer` (tab) | home: dashboard for signed-in buyers, discovery for guests |
| `/buyer/catalog` (tab) | search + browse (`?q=`, `?category=`) |
| `/buyer/orders` (tab) | orders list |
| `/buyer/cart` (tab) | cart |
| `/buyer/account` (tab) | account hub (links to everything below + settings) |
| `/buyer/product/[id]` | product detail with supplier offers |
| `/buyer/store/[slug]` | supplier storefront |
| `/buyer/checkout` | checkout |
| `/buyer/payment-return` (`?orderId=&outcome=success|cancel`) | payment result |
| `/buyer/kyc` | buyer KYC |
| `/buyer/order/[id]` | order detail |
| `/buyer/order/[id]/invoice/[invoiceId]` | invoice |
| `/buyer/order/conversational` | conversational ordering |
| `/buyer/rfqs`, `/buyer/rfqs/new`, `/buyer/rfqs/[id]`, `/buyer/rfqs/[id]/compare` | RFQs |
| `/buyer/accounts`, `/buyer/accounts/payment/[id]` | accounts & transactions |
| `/buyer/credit` | trade credit |
| `/buyer/invoices`, `/buyer/invoices/upload`, `/buyer/invoices/[id]/review` | invoice capture |
| `/buyer/ask`, `/buyer/ai` | Ask VYRO AI chat, AI insights home |

### Supplier — `/supplier`
| Route | Screen |
| --- | --- |
| `/supplier` (tab) | dashboard |
| `/supplier/orders` (tab) | orders; `/supplier/order/[id]` detail |
| `/supplier/products` (tab) | products; `/supplier/products/new`, `/supplier/products/[id]/edit` |
| `/supplier/quotes` (tab) | quote requests; `/supplier/quotes/[rfqId]` |
| `/supplier/more` (tab) | hub linking every screen below |
| `/supplier/deliveries`, `/supplier/payments`, `/supplier/accounts` | fulfilment & money |
| `/supplier/customers`, `/supplier/leads`, `/supplier/analytics` | CRM & intelligence |
| `/supplier/pricing`, `/supplier/inventory` | catalog & stock |
| `/supplier/settings`, `/supplier/verification` | facility settings, KYC |
| `/supplier/learning`, `/supplier/learning/[slug]` | training centre |
| `/supplier/sponsored` + `/plans`, `/subscriptions`, `/slots`, `/campaigns`, `/campaigns/new`, `/invoices` | sponsored listings |

### Admin — `/admin`
| Route | Screen |
| --- | --- |
| `/admin` (tab) | overview / command centre |
| `/admin/orders` (tab) | orders; `/admin/order/[id]` |
| `/admin/directory` (tab) | suppliers / businesses / users segments |
| `/admin/suppliers/[id]`, `/admin/businesses/[id]`, `/admin/users` | detail + users list |
| `/admin/money` (tab) | money & orders |
| `/admin/more` (tab) | hub linking every screen below |
| `/admin/search` | global search |
| `/admin/deliveries`, `/admin/disputes`, `/admin/rfqs`, `/admin/reviews` | operations |
| `/admin/roles`, `/admin/activity` | roles & invites, audit |
| `/admin/catalog`, `/admin/catalog/product/[id]` | catalog |
| `/admin/trust-safety` | KYC, documents, abuse reports |
| `/admin/payments`, `/admin/payments/[id]`, `/admin/finance`, `/admin/accounts`, `/admin/accounts/payment/[id]` | money |
| `/admin/platform`, `/admin/security` | platform config, security & 2FA |
| `/admin/observability`, `/admin/observability/alerts`, `/admin/observability/queues`, `/admin/ai-usage` | observability |
| `/admin/notifications` | admin notifications |
| `/admin/learning`, `/admin/learning/new`, `/admin/learning/[id]/edit` | training content |
| `/admin/sponsored` + `/plans`, `/slots`, `/approvals`, `/campaigns`, `/analytics` | sponsored admin |

## Before you call a screen done

- `npx tsc --noEmit` passes for your files.
- Loading, empty, error and refresh states all render.
- Every action on the matching web page exists here and invalidates the right queries.
