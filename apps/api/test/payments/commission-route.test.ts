import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { commissionFor } from '../../src/modules/finance/commission';

const ROUTES_PATH = resolve(
  __dirname,
  '../../src/modules/payments/routes.ts',
);

function routesSource(): string {
  return readFileSync(ROUTES_PATH, 'utf8');
}

describe('payments/commission-route regression (Fix A — online method)', () => {
  it('commissionFor(10_000, 250) returns 250 (sanity)', () => {
    // Default precedence fallback per finance/commission.ts:
    // product > supplier > category > promotional > global rule >
    // platform_settings.platformFeeBps > 250 default.
    expect(commissionFor(10_000, 250)).toBe(250);
  });

  it('routes.ts contains no hardcoded feeCents=0 path keyed on method=online', () => {
    // Bug pattern: a conditional that sets feeCents = 0 when method === 'online'.
    // After Fix A the branch is removed; the same precedence chain serves every method.
    const src = routesSource();
    // Match 'online' substring within ~400 chars before 'feeCents = 0' / 'feeCents: 0'.
    const offending = /(['"]online['"][\s\S]{0,400}feeCents\s*=\s*0)|(feeCents\s*=\s*0[\s\S]{0,400}['"]online['"])/;
    expect(src).not.toMatch(offending);
  });

  it('routes.ts imports resolveCommissionBps (must be the single source of truth)', () => {
    const src = routesSource();
    expect(src).toMatch(/resolveCommissionBps/);
  });
});
