import { detectAnomaly } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

/** price_anomaly: cheapest live offer vs median of last buys. Neutral language. */
export async function priceAnomalyHandler(ctx: IntentContext, repos: AiRepos): Promise<HandlerResult> {
  const productName = String((ctx.classify.slots as any).productName ?? '');
  if (!productName) {
    return {
      components: [{ type: 'clarification_card', data: { question: 'Which product should I check for unusual pricing?', options: [] } }],
      actions: [],
      rawSummary: { clarified: true },
    };
  }
  const product = await repos.findProductByName(productName);
  if (!product) {
    return {
      components: [{ type: 'clarification_card', data: { question: `I could not find "${productName}". Try another product name.`, options: [] } }],
      actions: [],
      rawSummary: { clarified: true },
    };
  }
  const [history, offers] = await Promise.all([
    repos.lastBuyPrices({ businessId: ctx.businessId, productId: product.id, limit: 20 }),
    repos.listOffersByProduct(product.id),
  ]);
  const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
  if (!history.length || !live.length) {
    return {
      components: [{ type: 'spend_summary_card', data: { productName: product.name, note: 'Not enough history or live offers to assess.' } }],
      actions: [{ type: 'view_search', label: 'Search catalog', href: `/search?q=${encodeURIComponent(product.name)}` }],
      rawSummary: { productName: product.name, insufficient: true },
    };
  }
  const cheapest = live.reduce((m, o) => (o.priceCents < m.priceCents ? o : m), live[0]!);
  const { flagged, median, ratio } = detectAnomaly(history, cheapest.priceCents);
  return {
    components: [{
      type: 'recommendation_card',
      data: {
        productName: product.name,
        flagged,
        median,
        cheapestPriceCents: cheapest.priceCents,
        cheapestSupplier: cheapest.supplier.name,
        ratio,
        note: flagged
          ? 'This offer is significantly above your recent purchasing range.'
          : 'Current offers look within your recent purchasing range.',
      },
    }],
    actions: [{ type: 'view_search', label: 'Compare offers', href: `/search?q=${encodeURIComponent(product.name)}` }],
    rawSummary: { productName: product.name, flagged, median, ratio },
  };
}
