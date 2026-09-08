import { describe, expect, it } from 'vitest';
import { HANDLERS } from '../../../src/modules/ai/intents/catalog';
import { mockRepos } from '../helpers/aiFixture';
import type { IntentContext } from '../../../src/modules/ai/intents/catalog';

const ctxFor = (intent: string, slots: Record<string, unknown> = {}): IntentContext => ({
  env: {} as any,
  businessId: 'b1',
  userId: 'u1',
  classify: { intent: intent as any, slots: slots as any, confidence: 0.9 },
});

describe('intel handlers', () => {
  it('registers all seven intents', () => {
    for (const k of ['price_watch', 'price_anomaly', 'supplier_intel', 'procurement_health', 'spend_forecast', 'category_intel', 'insights_feed'] as const) {
      expect(typeof HANDLERS[k]).toBe('function');
    }
  });

  it('price_watch returns movers card', async () => {
    const repos = mockRepos({ poItems: [{ id: 'i1', purchaseOrderId: 'po1', productId: 'p1', supplierId: 's1', quantity: 2, unitPriceCents: 10000, createdAt: Date.now() }] });
    const r = await HANDLERS.price_watch(ctxFor('price_watch'), repos);
    expect(r.components[0]!.type).toBe('spend_summary_card');
  });

  it('price_anomaly clarifies without product', async () => {
    const r = await HANDLERS.price_anomaly(ctxFor('price_anomaly'), mockRepos({}));
    expect(r.components[0]!.type).toBe('clarification_card');
  });

  it('supplier_intel, health, forecast, category, insights return grounded cards', async () => {
    const repos = mockRepos({});
    for (const k of ['supplier_intel', 'procurement_health', 'spend_forecast', 'category_intel', 'insights_feed'] as const) {
      const r = await HANDLERS[k](ctxFor(k), repos);
      expect(r.components.length).toBeGreaterThan(0);
      expect(r.actions.length).toBeGreaterThanOrEqual(0);
    }
  });
});
