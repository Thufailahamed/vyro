import { describe, it, expect } from 'vitest';
import { isIntentAllowed, INTENT_NAMES } from '@vyro/ai';

describe('security: tool escalation', () => {
  it('viewer role cannot trigger write intents', () => {
    const writeIntents = [
      'supplier_recommend',
      'usual_order',
      'reorder',
      'procurement_plan',
      'budget_optimize',
      'simulate_supplier_switch',
    ];
    for (const i of writeIntents) {
      expect(isIntentAllowed(i as any, 'viewer')).toBe(false);
    }
  });

  it('viewer role cannot trigger usual_order / reorder (state-changing)', () => {
    expect(isIntentAllowed('usual_order' as any, 'viewer')).toBe(false);
    expect(isIntentAllowed('reorder' as any, 'viewer')).toBe(false);
  });

  it('unknown intent strings are not allowed for any role', () => {
    for (const role of ['admin', 'member', 'viewer'] as const) {
      expect(isIntentAllowed('not_a_real_intent' as any, role)).toBe(false);
      expect(isIntentAllowed('' as any, role)).toBe(false);
    }
  });

  it('every defined intent is mapped in the allowlist for some role', () => {
    for (const i of INTENT_NAMES) {
      const allowed = ['admin', 'member', 'viewer'].some((r) =>
        isIntentAllowed(i, r as any),
      );
      expect(allowed, `intent ${i} unreachable for any role`).toBe(true);
    }
  });
});
