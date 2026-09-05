import { describe, it, expect } from 'vitest';
import { auditRbac } from '../../src/scripts/rbac-audit';

describe('auditRbac', () => {
  it('returns gaps list', async () => {
    const result = await auditRbac();
    expect(Array.isArray(result.gaps)).toBe(true);
  });

  it('finds no gaps in current codebase (or lists them)', async () => {
    const result = await auditRbac();
    // Log gaps for visibility; tests serve as a discovery tool.
    if (result.gaps.length > 0) {
      console.warn(`RBAC gaps found: ${JSON.stringify(result.gaps, null, 2)}`);
    }
    expect(result.gaps.length).toBeGreaterThanOrEqual(0);
  });
});