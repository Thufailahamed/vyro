# VYRO

Everything your business needs.

## Local dev

```
nvm use
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Apps
- `apps/web` — business + supplier SPA
- `apps/admin` — platform admin SPA
- `apps/api` — Hono API on Cloudflare Workers

## Packages
- `packages/db` — Drizzle schema + migrations
- `packages/auth` — better-auth
- `packages/validation` — Zod schemas
- `packages/shared` — types, constants, branding
- `packages/ui` — shared React components
- `packages/ai` — placeholder for future AI
