import { describe, it, expect } from 'vitest';
import { buildFallbackClaimNote } from '../../src/modules/reconciliation/reconciliationService';

describe('reconciliationService helpers', () => {
  it('buildFallbackClaimNote generates clear dispute text citing PO and overcharge amount', () => {
    const text = buildFallbackClaimNote({
      poNumber: 'PO-2026-999',
      netDifferenceCents: 8500,
      discrepancyCount: 2,
    });
    expect(text).toContain('PO-2026-999');
    expect(text).toContain('85');
    expect(text).toContain('credit note');
  });
});
