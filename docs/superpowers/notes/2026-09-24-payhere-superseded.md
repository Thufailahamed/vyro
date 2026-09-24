# PayHere integration superseded (2026-09-24)

All PayHere gateway code was removed on 2026-09-24. The active gateway is
payments.lk (see `docs/superpowers/specs/2026-09-24-payments-lk-gateway-design.md`
and `docs/superpowers/plans/2026-09-24-payments-lk-gateway.md`).

- `docs/superpowers/plans/2026-09-09-payhere-gateway.md` — superseded.
- Historical DB rows keep `provider='payhere'`; their online refunds are manual
  (admin queue) — the refund executor only auto-refunds `provider='payments_lk'`.
- New payments use `provider='payments_lk'`; the webhook endpoint is
  `POST /api/webhooks/payments-lk` (JSON + HMAC `Payments-Signature`).
- PayHere env vars (`PAYHERE_*`) no longer exist; use `PAYMENTS_LK_*` (runbook).
