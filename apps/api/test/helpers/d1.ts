import { vi } from 'vitest';

const nodeSqlite = vi.hoisted(() => {
  const req = require('node:sqlite') as typeof import('node:sqlite');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const url = require('node:url') as typeof import('node:url');
  return { DatabaseSync: req.DatabaseSync, fs, path, url };
});
type DatabaseSync = InstanceType<typeof nodeSqlite.DatabaseSync>;

export function makeD1(sqlite: DatabaseSync = new nodeSqlite.DatabaseSync(':memory:')): D1Database {
  const wrap = (sqlText: string, bound: unknown[] = []): D1PreparedStatement => {
    const st = {
      bind(...params: unknown[]) { return wrap(sqlText, [...bound, ...params]); },
      first: async (col?: string) => {
        const row = sqlite.prepare(sqlText).get(...bound) as Record<string, unknown> | undefined;
        if (!row) return null;
        return col ? (row[col] ?? null) : row;
      },
      all: async () => ({ results: sqlite.prepare(sqlText).all(...bound), success: true, meta: {} }),
      run: async () => {
        const r = sqlite.prepare(sqlText).run(...bound) as unknown as { changes: unknown; lastInsertRowid: unknown };
        return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } };
      },
      // Array rows like real D1 — object rows would collapse duplicate column names in joins.
      raw: async () => {
        const stmt = sqlite.prepare(sqlText) as unknown as { setReturnArrays(v: boolean): void; all(...a: unknown[]): unknown[] };
        stmt.setReturnArrays(true);
        return stmt.all(...bound);
      },
    };
    return st as unknown as D1PreparedStatement;
  };
  return {
    prepare: (sqlText: string) => wrap(sqlText),
    exec: async (sqlText: string) => { sqlite.exec(sqlText); },
    batch: async (stmts: D1PreparedStatement[]) => {
      const out = [];
      for (const s of stmts) out.push(await (s as unknown as { run(): Promise<unknown> }).run());
      return out as never;
    },
  } as unknown as D1Database;
}

export async function applyMigrations(d1: D1Database): Promise<void> {
  const root = nodeSqlite.path.join(
    nodeSqlite.path.dirname(nodeSqlite.url.fileURLToPath(import.meta.url)),
    '..', '..', '..', '..',
  );
  const migDir = nodeSqlite.path.join(root, 'packages/db/migrations');
  for (const f of nodeSqlite.fs.readdirSync(migDir).filter((x: string) => x.endsWith('.sql')).sort()) {
    d1.exec(nodeSqlite.fs.readFileSync(nodeSqlite.path.join(migDir, f), 'utf8').split('--> statement-breakpoint').join(';'));
  }
}
