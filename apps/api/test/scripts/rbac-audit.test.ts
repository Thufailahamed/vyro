import { describe, it, expect } from 'vitest';
import { auditRbac } from '../../src/scripts/rbac-audit';

describe('auditRbac', () => {
  it('returns gaps list', async () => {
    const result = await auditRbac();
    expect(Array.isArray(result.gaps)).toBe(true);
  });

  it('finds no gaps in the current codebase', async () => {
    const result = await auditRbac();
    if (result.gaps.length > 0) {
      console.warn(`RBAC gaps found: ${JSON.stringify(result.gaps, null, 2)}`);
    }
    // This mirrors the `pnpm audit:rbac` CI gate: every mutating route must
    // carry a recognisable guard (session() / requireRole() / requirePermission()).
    expect(result.gaps).toEqual([]);
  });
});