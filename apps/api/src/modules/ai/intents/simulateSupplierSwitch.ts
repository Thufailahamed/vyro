import { simulateSupplierSwitch } from '@vyro/ai';
import type { IntentContext, HandlerResult } from './catalog';
import type { AiRepos } from './repos';

const DAY = 86400000;

export async function simulateSupplierSwitchHandler(
  ctx: IntentContext,
  repos: AiRepos,
): Promise<HandlerResult> {
  const slots = ctx.classify.slots as {
    productName?: string;
    fromSupplierName?: string;
    toSupplierName?: string;
  };

  const product = slots.productName ? await repos.findProductByName(slots.productName) : null;
  if (!product) {
    return {
      components: [
        {
          type: 'clarification_card',
          data: {
            question: `Which product should I simulate a supplier switch for?`,
            options: [],
          },
        },
      ],
      actions: [],
      rawSummary: { clarified: true },
    };
  }

  const offers = await repos.listOffersByProduct(product.id);
  const live = offers.filter((o) => o.availabilityStatus !== 'out_of_stock');
  const from = slots.fromSupplierName
    ? live.find((o) => o.supplier.name.toLowerCase() === slots.fromSupplierName!.toLowerCase())
    : undefined;
  const to = slots.toSupplierName
    ? live.find((o) => o.supplier.name.toLowerCase() === slots.toSupplierName!.toLowerCase())
    : undefined;

  const cheapestFirst = live.slice().sort((a, b) => a.priceCents - b.priceCents);
  // Choose "current" by cheapest-first by default so simulation has a sensible
  // baseline even when the user does not name it.
  const current = from ?? cheapestFirst[0]!;
  // Alternative is the next-cheapest distinct supplier if not specified.
  const alternative =
    to ?? cheapestFirst.find((o) => o.supplier.id !== current.supplier.id) ?? current;

  const cadence = await repos.poItemCadence({
    businessId: ctx.businessId,
    productId: product.id,
    sinceMs: Date.now() - 180 * DAY,
  });
  const monthlyQuantity =
    cadence && cadence.avgIntervalDays > 0
      ? Math.max(1, Math.round(30 / cadence.avgIntervalDays))
      : 1;
  const sample = cadence?.count ?? 0;

  const result = simulateSupplierSwitch({
    productName: product.name,
    currentSupplier: current.supplier.name,
    currentPriceCents: current.priceCents,
    currentLeadDays: current.leadTimeDays,
    alternativeSupplier: alternative.supplier.name,
    alternativePriceCents: alternative.priceCents,
    alternativeLeadDays: alternative.leadTimeDays,
    monthlyQuantity,
    cadenceSampleSize: sample,
  });

  return {
    components: [
      {
        type: 'simulation_card',
        data: {
          productName: product.name,
          currentSupplier: current.supplier.name,
          alternativeSupplier: alternative.supplier.name,
          monthlyQuantity,
          monthlyDeltaCents: result.monthlyDeltaCents,
          annualDeltaCents: result.annualDeltaCents,
          leadDeltaDays: result.leadDeltaDays,
          savingsPct: result.savingsPct,
          confidence: result.confidence,
        },
      },
    ],
    actions: [
      {
        type: 'view_search',
        label: 'Compare alternatives',
        href: `/search?q=${encodeURIComponent(product.name)}`,
      },
    ],
    rawSummary: {
      productName: product.name,
      annualDeltaCents: result.annualDeltaCents,
      confidence: result.confidence,
      cadenceSampleSize: sample,
    },
  };
}
