import type { Db } from '@vyro/db';

type TxHandle = Parameters<Parameters<Db['transaction']>[0]>[0];

const MUTATOR_METHODS = new Set(['insert', 'update', 'delete']);
const TERMINAL_METHODS = new Set(['run', 'all', 'get', 'execute']);

/**
 * D1-compatible atomic unit of work, used in place of `db.transaction(cb)`.
 *
 * drizzle's `db.transaction()` issues an interactive `BEGIN`, which Cloudflare
 * D1 rejects outright (its HTTP session API has no interactive transactions —
 * every statement is an independent request). node:sqlite accepts BEGIN, which
 * is why the vitest D1 shim masks the failure; on any real D1 binding the
 * request 500s with `Failed query: begin`.
 *
 * This adapter preserves the transaction call shape: statements invoked
 * through `tx` are *recorded* instead of executed, then flushed atomically via
 * `D1Database.batch()` — itself an all-or-nothing unit — once `fn` returns.
 * If `fn` throws, nothing is flushed (same abort semantics as a rollback).
 *
 * Constraints vs a real transaction (keep fn shaped accordingly):
 * - `tx.select()` executes immediately against the live DB. fn must not rely
 *   on reading back its own earlier writes inside the same call.
 * - read-modify-write must be expressed as a SQL expression
 *   (e.g. `set({ usedCents: sql`used_cents - ${x}` })`) when the read row can
 *   be revisited by a later statement in the same unit.
 * - nested `tx.transaction(cb)` flattens into the outer unit.
 */
export async function txBatch<T>(db: Db, fn: (tx: TxHandle) => Promise<T> | T): Promise<T> {
  const statements: unknown[] = [];
  const pushed = new WeakSet<object>();

  const record = <B extends object>(builder: B): B =>
    new Proxy(builder, {
      get(target, prop) {
        if (prop === 'then') {
          // `await builder` — record once, resolve empty.
          return (onFulfilled?: ((v: undefined) => unknown) | null, onRejected?: ((e: unknown) => unknown) | null) => {
            push(target);
            return Promise.resolve(undefined).then(onFulfilled ?? undefined, onRejected ?? undefined);
          };
        }
        const v = (target as Record<PropertyKey, unknown>)[prop as string];
        if (typeof v !== 'function') return v;
        if (TERMINAL_METHODS.has(prop as string)) {
          return () => {
            push(target);
            return Promise.resolve(undefined);
          };
        }
        return (...args: unknown[]) => record((v as (...a: unknown[]) => object).apply(target, args));
      },
    }) as B;

  const push = (builder: object) => {
    if (!pushed.has(builder)) {
      pushed.add(builder);
      statements.push(builder);
    }
  };

  const tx: TxHandle = new Proxy(db, {
    get(target, prop) {
      if (prop === 'transaction') {
        // Flatten nested transactions into the outer unit.
        return (cb: (inner: TxHandle) => unknown) => cb(tx);
      }
      const t = target as unknown as Record<string, unknown>;
      if (MUTATOR_METHODS.has(prop as string)) {
        return (...args: unknown[]) =>
          record((t[prop as string] as (...a: unknown[]) => object).apply(target, args));
      }
      return t[prop as string];
    },
  }) as unknown as TxHandle;

  const out = await fn(tx);
  if (statements.length) {
    await (db as unknown as { batch(stmts: unknown[]): Promise<unknown> }).batch(statements);
  }
  return out;
}
