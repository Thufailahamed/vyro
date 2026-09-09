# Migrations

This directory is the source of truth for the D1 schema. Cloudflare D1 applies
the `.sql` files in lexicographic order on first deploy.

## Filename collisions

There are two migrations sharing the `0001_` prefix:

- `0001_auth_tables.sql` — better-auth core tables (`user`, `session`,
  `account`, `verification`).
- `0001_settings.sql` — user/platform settings tables.

They create disjoint table sets so the collision is harmless operationally.
Lexicographic order (`auth_tables` < `settings`) gives the correct
apply order. If new `0001_*.sql` files are added in the future, prefix
them with `0001a_`, `0001b_`, etc. to keep deterministic ordering.

## Meta journal

`meta/_journal.json` is Drizzle Kit's view of generated migrations and is
intentionally partial. It does not enumerate every file on disk because
some migrations were authored manually outside Drizzle Kit (notably the
auth and admin feature migrations). D1 applies all `.sql` files in the
directory regardless of journal contents.

## Adding a new migration

1. Pick the next numeric prefix (`0015_`, `0016_`, …).
2. Write the SQL — use `CREATE TABLE IF NOT EXISTS` for new tables.
3. If the change is reversible, place the paired `*_down.sql` in `packages/db/migrations_down/` (NEVER in this directory, as Cloudflare Wrangler treats all `.sql` files in `migrations_dir` as forward migrations).
4. Run `pnpm db:migrate` to apply locally (or `wrangler d1 migrations apply` against remote).

