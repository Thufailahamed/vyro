# VYRO Mobile

Native iOS and Android app for VYRO, built with Expo. It covers all three
portals of the web app — **buyer**, **supplier** and **admin** — in one binary,
and it uses the same Worker API as `apps/web`, with no backend changes.

## Run it

```sh
cd apps/mobile
npm install
cp .env.example .env        # optional: point at a different API
npx expo start              # press a (Android) / i (iOS), or scan with Expo Go
```

This app installs with **npm on its own**. It is excluded from the pnpm
workspace (`pnpm-workspace.yaml`), because Metro and pnpm's isolated
`node_modules` layout don't work well together.

By default the app talks to production
(`https://vyro-api.thufailahamed627.workers.dev/api`). To use a local
`wrangler dev` Worker from a phone, set `EXPO_PUBLIC_API_URL` to your
machine's LAN IP, for example `http://192.168.1.20:8787/api`.

## Checks

```sh
npm run typecheck           # tsc --noEmit
npx expo-doctor             # dependency / config sanity
npx expo export --platform android   # full Metro bundle, no device needed
```

## Build and ship

```sh
npx eas-cli@latest build --profile preview --platform android   # installable APK
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
```

Bundle id / package: `lk.vyro.app`. Deep-link scheme: `vyro://`
(for example `vyro://reset?token=…` and `vyro://admin-invite?token=…`).

## How auth works on native

The Worker authenticates with better-auth session cookies and checks the
`Origin` header on state-changing requests (`apps/api/src/middleware/verifyCsrf.ts`).
`src/lib/api.ts` handles both:

- It reads `Set-Cookie` itself and stores the session cookie in the device
  keychain/keystore (`expo-secure-store`, see `src/lib/cookieJar.ts`). It then
  sends the cookie back as a `Cookie` header.
- It sends `Origin: <API origin>`. That is the Worker's own origin, which both
  the CSRF check and better-auth accept.

Sessions last 30 days, the same as on the web. Sign-out clears the stored cookie.

## Structure

See [CONVENTIONS.md](./CONVENTIONS.md) for the full route map and the design
rules. In short:

```
src/app/         expo-router routes (buyer/, supplier/, admin/, auth, shared)
src/features/    screens grouped by portal and area
src/ui/          design system — Screen, Card, Button, Stat, charts, sheets, tab bar
src/lib/         api client, auth/session, formatting, status tones, pickers
src/theme/       tokens mirrored from apps/web/tailwind.config.ts
```

Users with more than one role switch between portals, or between businesses
and supplier orgs, from the workspace chip in each portal header. The app
remembers the last portal used on the device.
