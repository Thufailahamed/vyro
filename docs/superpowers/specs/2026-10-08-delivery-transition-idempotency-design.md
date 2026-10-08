# Delivery Transition Idempotency — Design

2026-10-08

## Scope

Final deferred piece of supplier-side idempotency: an optional
`Idempotency-Key` on `POST /api/deliveries/:poId/transitions`, plus client keys
at the two web call sites. Mobile has no call sites for this endpoint.

User decision (2026-10-08): cover the delivery transition route (server) and
the supplier web buttons; leave POD upload and tracking PATCH as-is.

## Design

### Server

File: `apps/api/src/modules/deliveries/routes.ts`, `POST /:poId/transitions`
(line 67-225).

After the auth/role checks and schema parse, and before `ensureDelivery`
(line 80), add the same pattern already shipped for order transitions and
accept:

```ts
const idemKey = c.req.header('Idempotency-Key');
const requestHash = hashRequestBody({ poId: c.req.param('poId'), body: parsed.data });
if (idemKey) {
  const hit = await getIdempotencyResponse(c.env.DB, ctx.userId, idemKey);
  if (hit) {
    await assertIdempotencyMatch(c.env.DB, ctx.userId, idemKey, requestHash);
    c.status(hit.statusCode as 200);
    return c.json(JSON.parse(hit.responseJson));
  }
}
```

and before the final `return c.json({ ok: true })`:

```ts
if (idemKey) {
  await storeIdempotencyResponse(c.env.DB, ctx.userId, idemKey, requestHash, 200, JSON.stringify({ ok: true }));
}
```

Imports: `assertIdempotencyMatch`, `getIdempotencyResponse`, `hashRequestBody`,
`storeIdempotencyResponse` from `../../lib/idempotency` (new import for this
module).

Semantics: only successful transitions are stored; keyless requests behave
exactly as today (the `canTransitionDelivery` guard at line 85 still rejects
repeats). Note that `requestHash` is computed before the replay branch so both
paths share it.

### Web

File: `apps/web/src/supplier/DeliveryTransitionButtons.tsx`:

- Line 47 (status/driver transition `api.post`): add third argument
  `{ idempotencyKey: crypto.randomUUID() }`.
- Line 172 (delivered transition): same.

Mobile: unchanged (no call sites).

## Test gate

New `apps/api/test/deliveries/transitionsIdempotency.test.ts` (real D1 via
`makeD1`/`applyMigrations`, session mock, seed user + supplierMembers):

1. `pending -> assigned` with a key → 200 `{ ok: true }`; replay with the same
   key returns the identical body and the order timeline has exactly one
   delivery event for the transition (metadata `kind: 'delivery'`).
2. Same key + different body (`failed`) → 409 (idempotency mismatch, evaluated
   before the state machine).
3. Keyless second assign → 409 from the delivery state machine (unchanged
   behaviour).
4. 401 without a session.

Verification: `pnpm --filter @vyro/api exec vitest run test/deliveries/transitionsIdempotency.test.ts`,
then the full gate (`pnpm typecheck`, `pnpm test`, web build, mobile
typecheck/lint).

## Risks / notes

- The route writes the delivery row and order event after the PO sync; storing
  only after the whole handler succeeds means a mid-handler failure is
  retryable with the same key.
- Another session may be editing web files: stage explicit paths only.

## Deferred

- POD upload idempotency and tracking PATCH idempotency.
- Admin delivery status endpoint (`POST /admin/deliveries/:id/update-status`).
