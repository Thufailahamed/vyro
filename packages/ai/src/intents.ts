import { ClassifyResultSchema, INTENT_NAMES, type ClassifyResult } from './schemas';

export interface AiDictionary {
  products: string[];
  suppliers: string[];
}

const REORDER_RX = /\b(reorder|restock|due for|what should i (buy|order))\b/i;
const SAVINGS_RX = /\b(save|saving|cheaper|where can i save)\b/i;
const USUAL_RX = /\b(usual|like last time|same as before|my normal)\b/i;
const SPEND_RX = /\b(spend|spent|cost|paid|monthly spend|how much did i)\b/i;
const COMPARE_RX = /\b(compare|vs|versus|which supplier)\b/i;
const DELIVERY_RX = /\b(deliver|delivery|how fast|when can i get)\b/i;
const PRICE_RX = /\b(price increase|price change|why.*increase|why.*more expensive)\b/i;
const SEARCH_RX = /\b(find|search|show me|list)\b/i;
const CHEAPEST_RX = /\b(cheapest|lowest price|best price|best deal)\b/i;
const PERIOD_RX = /\b(this|last|past)\s+(week|month|quarter|year)\b/i;

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

function pickSupplier(text: string, suppliers: string[]): string | undefined {
  const lower = text.toLowerCase();
  return suppliers.find((s) => lower.includes(s.toLowerCase()));
}

function inferQuantity(text: string): { quantity?: number; unit?: string } {
  const m = text.match(/(\d+)\s*(kg|g|l|ml|bottle|bottles|pack|packs|pcs?|pieces?)?/i);
  if (!m) return {};
  const quantity = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  const norm =
    unit === 'bottles' ? 'bottle' :
    unit === 'packs' ? 'pack' :
    unit === 'pcs' || unit === 'pieces' ? 'pc' :
    unit;
  const out: { quantity?: number; unit?: string } = { quantity };
  if (norm) out.unit = norm;
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
  } else if (SPEND_RX.test(text)) {
    intent = 'spend_summary';
    confidence = 0.65;
  } else if (COMPARE_RX.test(text) && productName) {
    intent = 'compare_suppliers';
    confidence = 0.75;
  } else if (CHEAPEST_RX.test(text) && productName) {
    intent = 'find_cheapest';
    confidence = 0.85;
  } else if (DELIVERY_RX.test(text)) {
    intent = 'delivery_estimate';
    confidence = 0.6;
  } else if (SEARCH_RX.test(text) && productName) {
    intent = 'search_products';
    confidence = 0.7;
  }

  const slots: Record<string, unknown> = { ...qty };
  if (productName) slots.productName = productName;
  if (supplierName) slots.supplierName = supplierName;
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
