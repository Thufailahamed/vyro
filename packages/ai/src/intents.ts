import { ClassifyResultSchema, INTENT_NAMES, type ClassifyResult, type IntentName } from './schemas';

export interface AiDictionary {
  products: string[];
  suppliers: string[];
}

const REORDER_RX = /\b(reorder|restock|due for|running low|what should i (buy|order))\b/i;
const SAVINGS_RX = /\b(save|saving|cheaper|overspend|where can i save)\b/i;
const USUAL_RX = /\b(usual|like last time|same as before|my normal|regular order)\b/i;
const SPEND_RX = /\b(spend|spent|cost|paid|monthly spend|how much did i)\b/i;
const COMPARE_RX = /\b(compare|comparison|vs|versus|which supplier)\b/i;
const RECOMMEND_RX = /\b(recommend|best supplier|best who|who(?:'s| is) (?:the )?best|best .{0,20}supplier|supplier .{0,20}best)\b/i;
const DELIVERY_RX = /\b(deliver|delivery|how fast|when can i get|lead time)\b/i;
const PRICE_RX = /\b(price increase|price change|why.*increase|why.*more expensive|price (?:went|going) up)\b/i;
const SEARCH_RX = /\b(find|search|show me|list|look for|do you have)\b/i;
const PROCURE_RX = /\b(need|needs|want|buy|order|get me|require|supply me)\b/i;
const CHEAPEST_RX = /\b(cheapest|lowest prices?|best prices?|best deals?|lowest costs?)\b/i;
const PERIOD_RX = /\b(this|last|past)\s+(week|month|quarter|year)\b/i;

const WORD_NUMS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

const WORD_NUM_RX = Object.keys(WORD_NUMS).join('|');

// Natural-language pack units buyers actually say.
const UNIT_RX =
  'kgs?|kilos?|kg|grams?|g|litres?|liters?|l|ml|bottles?|bags?|cartons?|boxes?|box|packs?|packets?|tins?|sachets?|pcs?|pieces?|pieces|units?';

function pickProduct(text: string, products: string[]): string | undefined {
  const lower = text.toLowerCase();
  let best: { name: string; idx: number } | undefined;
  for (const p of products) {
    const idx = lower.indexOf(p.toLowerCase());
    if (idx >= 0 && (!best || idx < best.idx || (idx === best.idx && p.length > best.name.length))) {
      best = { name: p, idx };
    }
  }
  return best?.name;
}

function countProductHits(text: string, products: string[]): number {
  const lower = text.toLowerCase();
  return products.filter((p) => lower.includes(p.toLowerCase())).length;
}

function pickSupplier(text: string, suppliers: string[]): string | undefined {
  const lower = text.toLowerCase();
  return suppliers.find((s) => lower.includes(s.toLowerCase()));
}

function normalizeUnit(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const u = raw.toLowerCase();
  if (/^kilos?$|^kgs?$/.test(u)) return 'kg';
  if (/^grams?$/.test(u)) return 'g';
  if (/^litres?$|^liters?$/.test(u)) return 'l';
  if (u === 'bottles') return 'bottle';
  if (u === 'bags') return 'bag';
  if (u === 'cartons') return 'carton';
  if (u === 'boxes') return 'box';
  if (u === 'packs') return 'pack';
  if (u === 'packets') return 'packet';
  if (u === 'tins') return 'tin';
  if (u === 'sachets') return 'sachet';
  if (u === 'pcs' || u === 'pieces' || u === 'piece') return 'pc';
  if (u === 'units' || u === 'unit') return 'unit';
  return u;
}

function inferQuantity(text: string): { quantity?: number; unit?: string } {
  const m = text.match(new RegExp(`(\\d+|${WORD_NUM_RX})\\s*(${UNIT_RX})?`, 'i'));
  if (!m) return {};
  const rawNum = m[1]!.toLowerCase();
  const quantity = /^\d+$/.test(rawNum) ? Number(rawNum) : WORD_NUMS[rawNum];
  if (!quantity) return {};
  const out: { quantity?: number; unit?: string } = { quantity };
  const unit = normalizeUnit(m[2]);
  if (unit) out.unit = unit;
  return out;
}

export function heuristicClassify(text: string, dict: AiDictionary): ClassifyResult {
  const productName = pickProduct(text, dict.products);
  const supplierName = pickSupplier(text, dict.suppliers);
  const qty = inferQuantity(text);

  let intent: ClassifyResult['intent'] = 'clarify';
  let confidence = 0.3;

  if (REORDER_RX.test(text)) {
    intent = 'reorder';
    confidence = 0.7;
  } else if (USUAL_RX.test(text)) {
    intent = 'usual_order';
    confidence = 0.7;
  } else if (SAVINGS_RX.test(text)) {
    intent = 'savings';
    confidence = 0.7;
  } else if (PRICE_RX.test(text)) {
    intent = 'price_changes';
    confidence = 0.7;
  } else if (RECOMMEND_RX.test(text)) {
    intent = 'supplier_recommend';
    confidence = productName ? 0.75 : 0.55;
  } else if (SPEND_RX.test(text)) {
    // "How much did I spend on rice?" is product spend, not business spend.
    if (productName && !supplierName) {
      intent = 'product_spend';
      confidence = 0.75;
    } else if (supplierName) {
      intent = 'supplier_spend';
      confidence = 0.75;
    } else {
      intent = 'spend_summary';
      confidence = 0.65;
    }
  } else if (COMPARE_RX.test(text) && productName) {
    intent = 'compare_suppliers';
    confidence = 0.75;
  } else if (CHEAPEST_RX.test(text)) {
    // Generic "find cheapest suppliers" / "show me cheapest" without a named
    // product is still a find_cheapest — the handler turns it into a cross-
    // catalog top-N list. Confidence stays low until the user picks a product.
    intent = 'find_cheapest';
    confidence = productName ? 0.85 : 0.55;
  } else if (DELIVERY_RX.test(text)) {
    intent = 'delivery_estimate';
    confidence = 0.6;
  } else if (SEARCH_RX.test(text) && productName) {
    intent = 'search_products';
    confidence = 0.7;
  } else if (PROCURE_RX.test(text) && productName) {
    // "I need 50kg rice" — a procurement request with a concrete product.
    intent = 'find_cheapest';
    confidence = 0.7;
  } else if (productName && qty.quantity) {
    // Bare "samba rice 25kg" — treat as procurement discovery.
    intent = 'find_cheapest';
    confidence = 0.55;
  }

  // Multiple products in one prompt: flag low confidence so the orchestrator
  // can clarify or fan out instead of silently picking one.
  if (productName && countProductHits(text, dict.products) > 1) {
    confidence = Math.min(confidence, 0.55);
  }

  // Optimize-for hints for supplier_recommend.
  let optimizeFor: 'price' | 'speed' | 'reliability' | undefined;
  if (intent === 'supplier_recommend' || intent === 'find_cheapest' || intent === 'compare_suppliers') {
    if (/\b(cheap|price|cost|afford)/i.test(text)) optimizeFor = 'price';
    else if (/\b(fast|quick|urgent|asap|soon|deliver)/i.test(text)) optimizeFor = 'speed';
    else if (/\b(reliab|trust|quality|consistent)/i.test(text)) optimizeFor = 'reliability';
  }

  const slots: Record<string, unknown> = { ...qty };
  if (productName) slots.productName = productName;
  if (supplierName) slots.supplierName = supplierName;
  if (optimizeFor && intent === 'supplier_recommend') slots.optimizeFor = optimizeFor;
  // Generic "find cheapest suppliers" — tell the handler to return top-N
  // across the whole catalog rather than asking for a product.
  if (intent === 'find_cheapest' && !productName) {
    slots.topN = Number(slots.topN ?? 8);
  }
  const periodMatch = text.match(PERIOD_RX);
  if (periodMatch && periodMatch[2]) {
    const word = periodMatch[2].toLowerCase();
    const period = word === 'week' ? 'week' : word === 'quarter' ? 'quarter' : word === 'year' ? 'year' : 'month';
    slots.period = period;
  }

  let result: ClassifyResult = { intent, slots: slots as ClassifyResult['slots'], confidence };
  if (intent === 'clarify') {
    result = {
      ...result,
      slots: {
        question: 'What do you need help with?',
        options: [
          'Find my cheapest suppliers',
          'Build my usual order',
          'What should I reorder?',
          'Where can I save?',
        ],
      },
    };
  }

  return ClassifyResultSchema.parse(result);
}

export const _intentNames = INTENT_NAMES; // silence unused import

// Role-based intent allowlist. Viewers get a read-only subset; members and
// admins can invoke any intent (including write actions like usual_order /
// reorder / supplier_recommend).
export const INTENT_ALLOWLIST_BY_ROLE = {
  admin: [
    'search_products', 'find_cheapest', 'compare_suppliers', 'supplier_recommend',
    'spend_summary', 'product_spend', 'supplier_spend', 'savings',
    'usual_order', 'reorder', 'price_changes', 'delivery_estimate', 'clarify',
  ],
  member: [
    'search_products', 'find_cheapest', 'compare_suppliers', 'supplier_recommend',
    'spend_summary', 'product_spend', 'supplier_spend', 'savings',
    'usual_order', 'reorder', 'price_changes', 'delivery_estimate', 'clarify',
  ],
  viewer: [
    'search_products', 'find_cheapest', 'compare_suppliers',
    'spend_summary', 'product_spend', 'supplier_spend', 'savings',
    'price_changes', 'delivery_estimate', 'clarify',
  ],
} as const;

export type Role = keyof typeof INTENT_ALLOWLIST_BY_ROLE;

export function isIntentAllowed(intent: IntentName, role: Role): boolean {
  return (INTENT_ALLOWLIST_BY_ROLE[role] as readonly string[]).includes(intent);
}
