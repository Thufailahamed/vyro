import { describe, expect, it, vi } from 'vitest';
import { planDeterministicMatches } from '@vyro/ai';
import { resolveUnmatchedInvoiceLines } from '../../src/modules/reconciliation/aiLineMatcher';
import type { InvoiceData, PoItemInput } from '@vyro/ai';

const poItems: PoItemInput[] = [
  {
    id: 'poi-rice',
    productNameSnapshot: 'Basmati Rice 5kg',
    unit: 'bag',
    quantity: 10,
    unitPriceCents: 1200,
    lineTotalCents: 12000,
  },
  {
    id: 'poi-sugar',
    productNameSnapshot: 'White Sugar 1kg',
    unit: 'pack',
    quantity: 20,
    unitPriceCents: 250,
    lineTotalCents: 5000,
  },
];

const invoice: InvoiceData = {
  totalCents: 17000,
  items: [
    { description: 'Basmati Rice 5kg', quantity: 10, unit: 'bag', unitPriceCents: 1200, totalCents: 12000 },
    { description: 'WHT SGR 1KG', quantity: 20, unit: 'pack', unitPriceCents: 250, totalCents: 5000 },
  ],
};

const unresolvedInvoice: InvoiceData = {
  ...invoice,
  items: [
    invoice.items[0]!,
    { ...invoice.items[1]!, description: 'WHT SGR 1KG' },
  ],
};

const plan = () => planDeterministicMatches(poItems, unresolvedInvoice.items);
const successfulResponse = {
  matches: [
    {
      invoiceItemIndex: 1,
      poItemId: 'poi-sugar',
      confidence: 0.98,
      alternativeConfidence: 0.1,
      reason: 'Abbreviation and size match.',
    },
  ],
};

function makeEnv(response: string | Error, extra: Record<string, unknown> = {}) {
  const run = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return { response, usage: { prompt_tokens: 25, completion_tokens: 18 } };
  });
  return {
    env: {
      AI: { run },
      VYRO_AI_RECONCILE_MATCHING: 'true',
      VYRO_AI_RECONCILE_MODEL: '@cf/test/match',
      ...extra,
    } as any,
    run,
  };
}

describe('resolveUnmatchedInvoiceLines', () => {
  it('skips AI when the feature switch is unset or false', async () => {
    const { env, run } = makeEnv(JSON.stringify(successfulResponse), { VYRO_AI_RECONCILE_MATCHING: 'false' });
    const result = await resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
    expect(result.stats.attempted).toBe(false);
    expect(result.overrides).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it('skips AI when deterministic matching resolved every invoice line', async () => {
    const { env, run } = makeEnv(JSON.stringify(successfulResponse));
    const fullyMatchedInvoice: InvoiceData = {
      ...invoice,
      items: [invoice.items[0]!, { ...invoice.items[1]!, description: 'White Sugar 1kg' }],
    };
    const fullyMatched = planDeterministicMatches(poItems, fullyMatchedInvoice.items);
    const result = await resolveUnmatchedInvoiceLines(env, poItems, fullyMatchedInvoice, fullyMatched);
    expect(result.stats.attempted).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('returns a unique high-confidence override and uses the configured Worker model', async () => {
    const { env, run } = makeEnv(JSON.stringify(successfulResponse), { VYRO_AI_GATEWAY: 'gateway-test' });
    const result = await resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
    expect(result.overrides).toEqual([
      {
        invoiceItemIndex: 1,
        poItemId: 'poi-sugar',
        confidence: 0.98,
        reason: 'Abbreviation and size match.',
      },
    ]);
    expect(result.suggestions).toEqual([]);
    expect(result.stats).toMatchObject({ attempted: true, provider: 'workersAI', model: '@cf/test/match', appliedCount: 1, suggestionCount: 0 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      '@cf/test/match',
      expect.objectContaining({
        response_format: { type: 'json_object' },
        gateway: { id: 'gateway-test' },
      }),
    );
  });

  it('returns a suggestion when confidence or alternative margin is below its gate', async () => {
    const response = {
      matches: [
        { ...successfulResponse.matches[0]!, confidence: 0.8, alternativeConfidence: 0.4 },
      ],
    };
    const { env } = makeEnv(JSON.stringify(response));
    const result = await resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
    expect(result.overrides).toEqual([]);
    expect(result.suggestions).toEqual([
      {
        invoiceItemIndex: 1,
        poItemId: 'poi-sugar',
        productName: 'White Sugar 1kg',
        confidence: 0.8,
        reason: 'Abbreviation and size match.',
      },
    ]);

    const narrowMargin = {
      matches: [
        { ...successfulResponse.matches[0]!, confidence: 0.98, alternativeConfidence: 0.9 },
      ],
    };
    const second = await resolveUnmatchedInvoiceLines(makeEnv(JSON.stringify(narrowMargin)).env, poItems, unresolvedInvoice, plan());
    expect(second.overrides).toEqual([]);
    expect(second.suggestions).toHaveLength(1);
  });

  it('rejects unknown IDs, resolved indexes, and duplicate PO assignments', async () => {
    const response = {
      matches: [
        { ...successfulResponse.matches[0]!, poItemId: 'not-in-the-candidate-list' },
        { ...successfulResponse.matches[0]!, invoiceItemIndex: 0, poItemId: 'poi-sugar' },
        { ...successfulResponse.matches[0]!, invoiceItemIndex: 2, poItemId: 'poi-rice' },
      ],
    };
    const { env } = makeEnv(JSON.stringify(response));
    const result = await resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
    expect(result.overrides).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('fails closed when a response mixes a valid candidate with an unknown ID', async () => {
    const response = {
      matches: [
        successfulResponse.matches[0],
        { ...successfulResponse.matches[0]!, invoiceItemIndex: 1, poItemId: 'unknown-po-item' },
      ],
    };
    const { env } = makeEnv(JSON.stringify(response));
    const result = await resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
    expect(result.overrides).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('fails closed when the model repeats a PO item assignment', async () => {
    const oneCandidate = [poItems[1]!];
    const twoUnresolved = {
      totalCents: 5000,
      items: [
        { ...unresolvedInvoice.items[1]!, description: 'WHT SGR one' },
        { ...unresolvedInvoice.items[1]!, description: 'WHT SGR two' },
      ],
    } satisfies InvoiceData;
    const both = planDeterministicMatches(oneCandidate, twoUnresolved.items);
    const response = {
      matches: [
        { invoiceItemIndex: 0, poItemId: 'poi-sugar', confidence: 0.99, alternativeConfidence: 0.1, reason: 'First line.' },
        { invoiceItemIndex: 1, poItemId: 'poi-sugar', confidence: 0.98, alternativeConfidence: 0.1, reason: 'Duplicate assignment.' },
      ],
    };
    const { env } = makeEnv(JSON.stringify(response));
    const result = await resolveUnmatchedInvoiceLines(env, oneCandidate, twoUnresolved, both);
    expect(result.overrides).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('falls back cleanly on malformed JSON and Worker errors', async () => {
    for (const response of ['not json', new Error('provider offline')]) {
      const { env, run } = makeEnv(response);
      const result = await resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
      expect(result.overrides).toEqual([]);
      expect(result.suggestions).toEqual([]);
      expect(result.stats.attempted).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  it('falls back after the provider timeout', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(() => new Promise(() => {}));
      const env: any = {
        AI: { run },
        VYRO_AI_RECONCILE_MATCHING: 'true',
        VYRO_AI_RECONCILE_MODEL: '@cf/test/timeout',
      };
      const pending = resolveUnmatchedInvoiceLines(env, poItems, unresolvedInvoice, plan());
      await vi.advanceTimersByTimeAsync(8_000);
      const result = await pending;
      expect(run).toHaveBeenCalledTimes(1);
      expect(result.overrides).toEqual([]);
      expect(result.suggestions).toEqual([]);
      expect(result.stats.attempted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips oversized unresolved batches', async () => {
    const manyPo: PoItemInput[] = [];
    const manyInvoice: InvoiceData = { totalCents: 1, items: [] };
    for (let i = 0; i < 51; i++) {
      manyPo.push({ id: `poi-${i}`, productNameSnapshot: `Unique Product ${i}`, quantity: 1, unitPriceCents: 1, lineTotalCents: 1 });
      manyInvoice.items.push({ description: `unmatched ${i}`, quantity: 1, unitPriceCents: 1, totalCents: 1 });
    }
    const manyPlan = planDeterministicMatches(manyPo, manyInvoice.items);
    const { env, run } = makeEnv(JSON.stringify({ matches: [] }));
    const result = await resolveUnmatchedInvoiceLines(env, manyPo, manyInvoice, manyPlan);
    expect(result.stats.attempted).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('skips an oversized serialized prompt even for one unresolved line', async () => {
    const oversizedInvoice: InvoiceData = {
      totalCents: 1,
      items: [{ description: 'x'.repeat(12_000), quantity: 1, unitPriceCents: 1, totalCents: 1 }],
    };
    const oversizedPlan = planDeterministicMatches(poItems, oversizedInvoice.items);
    const { env, run } = makeEnv(JSON.stringify({ matches: [] }));
    const result = await resolveUnmatchedInvoiceLines(env, poItems, oversizedInvoice, oversizedPlan);
    expect(result.stats.attempted).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
