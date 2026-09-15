# TrustSEAL Rollout 2026-09-15

- Migration: `0038_trust_seal.sql`. Backfill: none (derived).
- Config: PayHere sandbox merchant + `WEB_ORIGIN`/`BETTER_AUTH_URL` for return/notify URLs.
- Smoke:
  - [ ] Verify supplier → `/supplier/verification` shows TrustSEAL upsell → Pay → PayHere sandbox → return → status active.
  - [ ] Storefront `/suppliers/{slug}` shows gold TRUSTSEAL + Since year.
  - [ ] PDP with TrustSEAL + free offers: TrustSEAL ranks first with TrustSEAL reason.
  - [ ] Expire via cron (or manual DB expiresAt in past) → badge clears on next fetch.
  - [ ] Admin revoke → badge clears.
- Rollback: revert commits; table additive so old code ignores it.
