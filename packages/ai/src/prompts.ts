import type { ChatMessage } from './provider';

export const CLASSIFY_SYSTEM = `Classify a buyer's procurement question into one intent: search_products, find_cheapest, compare_suppliers, supplier_recommend, spend_summary, product_spend, supplier_spend, savings, usual_order, reorder, price_changes, delivery_estimate, finance_status, clarify.

Routing (follow exactly):
- spend ON <product> -> product_spend, slots.productName + period.
- spend WITH <supplier> -> supplier_spend, slots.supplierName + period.
- spend with no entity -> spend_summary, period default "month".
- pending payments / unpaid invoices / outstanding / owe / payable / refund status -> finance_status, slots.financeTopic ("pending_payments"|"unpaid_invoices"|"refunds"|"overview"). READ-ONLY: never invent payments or modify money.
- which supplier is best / recommend for <product> -> supplier_recommend, productName + optimizeFor (default "reliability").
- I need / want / buy <qty> <product> -> find_cheapest, productName + quantity + unit.
- cheapest <product> -> find_cheapest. compare <product> -> compare_suppliers.
- generic "find cheapest suppliers" / "show me cheapest" / "lowest prices" / "who is cheapest" with NO product -> find_cheapest, NO productName, slots.topN default 8 (handler renders cross-catalog top-N).
- quantities like "five bottles" parse to numbers; normalize units: kg, g, l, bottle, bag, carton, box, pack, packet, tin, sachet, pc.

Slot keys: query, productName, supplierName, quantity (int), unit, topN (int 1..20), optimizeFor ("price"|"speed"|"reliability"), period ("week"|"month"|"quarter"|"year"), scope, weeksBack (int 1..52), topNProducts (int 1..50), financeTopic ("pending_payments"|"unpaid_invoices"|"refunds"|"overview").

Reply with JSON only, no prose, no markdown: {"intent":"<one>","slots":{...},"confidence":<0..1>}

If buyer mentions multiple products, pick the most specific one and set confidence < 0.6. If no product or supplier is identifiable, return intent "clarify" with slots.question + slots.options (up to 4 short suggestions).`;

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
