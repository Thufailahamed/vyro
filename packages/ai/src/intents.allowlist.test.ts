import { describe, it, expect } from 'vitest';
import { INTENT_ALLOWLIST_BY_ROLE, isIntentAllowed, INTENT_NAMES, type IntentName } from './index';

describe('intent allowlist', () => {
  it('exports 20 intents in INTENT_NAMES (13 base + 7 intel)', () => {
    expect(INTENT_NAMES.length).toBe(20);
  });

  it('admin can run any intent', () => {
    for (const intent of INTENT_NAMES) {
      expect(isIntentAllowed(intent, 'admin')).toBe(true);
    }
  });

  it('member can run any intent', () => {
    for (const intent of INTENT_NAMES) {
      expect(isIntentAllowed(intent, 'member')).toBe(true);
    }
  });

  it('viewer can run read-only intents', () => {
    const allowed: IntentName[] = [
      'search_products', 'find_cheapest', 'compare_suppliers',
      'spend_summary', 'product_spend', 'supplier_spend', 'savings',
      'price_changes', 'delivery_estimate', 'clarify',
      'price_watch', 'price_anomaly', 'supplier_intel', 'procurement_health',
      'spend_forecast', 'category_intel', 'insights_feed',
    ];
    for (const intent of allowed) {
      expect(isIntentAllowed(intent, 'viewer')).toBe(true);
    }
  });

  it('viewer cannot run write intents', () => {
    const forbidden: IntentName[] = ['supplier_recommend', 'usual_order', 'reorder'];
    for (const intent of forbidden) {
      expect(isIntentAllowed(intent, 'viewer')).toBe(false);
    }
  });

  it('INTENT_ALLOWLIST_BY_ROLE declares all 3 roles', () => {
    expect(Object.keys(INTENT_ALLOWLIST_BY_ROLE).sort()).toEqual(['admin', 'member', 'viewer']);
  });
});