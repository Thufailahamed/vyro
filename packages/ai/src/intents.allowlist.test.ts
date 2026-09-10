import { describe, it, expect } from 'vitest';
import { INTENT_ALLOWLIST_BY_ROLE, isIntentAllowed, INTENT_NAMES, heuristicClassify, type IntentName } from './index';

describe('intent allowlist', () => {
  it('exports 30 intents in INTENT_NAMES (24 base+intel+planner + 6 rfq)', () => {
    expect(INTENT_NAMES.length).toBe(30);
    for (const i of ['create_rfq', 'compare_quotes', 'rfq_invite_suppliers', 'rfq_negotiate', 'rfq_recommend_quote', 'rfq_status'] as const) {
      expect(INTENT_NAMES).toContain(i);
    }
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
    const forbidden: IntentName[] = ['supplier_recommend', 'usual_order', 'reorder', 'procurement_plan', 'budget_optimize', 'simulate_supplier_switch', 'create_rfq', 'compare_quotes', 'rfq_invite_suppliers', 'rfq_negotiate', 'rfq_recommend_quote', 'rfq_status'];
    for (const intent of forbidden) {
      expect(isIntentAllowed(intent, 'viewer')).toBe(false);
    }
  });

  it('rfq utterances route to rfq intents', () => {
    const dict = { products: ['Samba Rice'], suppliers: ['Mill A'] };
    expect(heuristicClassify('invite suppliers to my rice RFQ', dict).intent).toBe('rfq_invite_suppliers');
    expect(heuristicClassify('negotiate a counter offer of Rs. 380,000', dict).intent).toBe('rfq_negotiate');
    expect(heuristicClassify('what is the status of my RFQ', dict).intent).toBe('rfq_status');
    expect(heuristicClassify('which quote is best for my RFQ', dict).intent).toBe('rfq_recommend_quote');
    expect(heuristicClassify('I need 1000kg of Samba Rice. Get me the best price', dict).intent).toBe('create_rfq');
  });

  it('INTENT_ALLOWLIST_BY_ROLE declares all 3 roles', () => {
    expect(Object.keys(INTENT_ALLOWLIST_BY_ROLE).sort()).toEqual(['admin', 'member', 'viewer']);
  });
});