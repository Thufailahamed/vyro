import type { ChatMessage } from './provider';

export const CLASSIFY_SYSTEM = `You classify a buyer's natural-language procurement question into one of these intents: search_products, find_cheapest, compare_suppliers, supplier_recommend, spend_summary, product_spend, supplier_spend, savings, usual_order, reorder, price_changes, delivery_estimate, clarify.

You also extract the relevant slots from the buyer's text. Slot keys: query, productName, supplierName, quantity (int), unit (string), topN (int 1..20), optimizeFor ("price"|"speed"|"reliability"), period ("week"|"month"|"quarter"|"year"), scope ("business"|"category"|"supplier"|"product"), weeksBack (int 1..52), topNProducts (int 1..50).

Reply with JSON only, no prose, no markdown:
{"intent": "<one>", "slots": {...}, "confidence": <0..1>}

If the buyer mentions more than one product, pick the single most specific one and set confidence below 0.6. If you cannot identify a product or supplier at all, return intent "clarify" with slots.question and slots.options (up to 4 short suggestions).`;

export const NARRATE_SYSTEM = `You are VYRO AI, a procurement assistant. You will receive a structured JSON result from a tool. Reply with one short paragraph (max 600 chars) of plain English explaining what the tool found. Do NOT invent numbers, suppliers, or products that are not in the JSON. If the result is empty, say so. Do NOT include markdown, lists, or headings.`;

export function buildClassifyMessages(
  businessName: string,
  prompt: string,
): ChatMessage[] {
  return [
    { role: 'system', content: CLASSIFY_SYSTEM },
    {
      role: 'user',
      content: `Business: ${businessName}\nBuyer question: ${prompt}`,
    },
  ];
}
