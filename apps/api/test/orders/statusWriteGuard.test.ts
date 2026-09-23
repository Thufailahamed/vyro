/**
 * Drift guard: `purchase_orders.status` may only change inside the lifecycle
 * pipeline (orders/lifecycle.ts). Every other module must call applyTransition
 * so guards, refunds, stock, settlement and notifications run exactly once.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = path.resolve(process.cwd(), 'src');
const ALLOWED = new Set([path.join('modules', 'orders', 'lifecycle.ts')]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('order status write guard', () => {
  it('only orders/lifecycle.ts updates purchase_orders.status', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = path.relative(SRC, file);
      if (ALLOWED.has(rel)) continue;
      const text = fs.readFileSync(file, 'utf8');
      // Drizzle: .update(purchaseOrders).set({ ... status: ... })
      const drizzle = /\.update\(\s*purchaseOrders\s*\)\s*\.set\(\s*\{[^}]*\bstatus\s*:/s;
      // Raw SQL: UPDATE purchase_orders SET ... status =
      const raw = /UPDATE\s+purchase_orders\s+SET[^;`]*\bstatus\s*=/i;
      // Legacy helper that wrote status directly.
      const helper = /\bupdatePoStatus\s*\(/;
      if (drizzle.test(text) || raw.test(text) || (helper.test(text) && !rel.endsWith(path.join('purchaseOrders', 'repository.ts')))) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
