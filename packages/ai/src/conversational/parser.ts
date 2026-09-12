import type { ParsedItem, ParsedOrderResult } from './types';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12, twenty: 20, fifty: 50,
  hundred: 100,
};

const UNIT_PATTERNS = 'bags?|cartons?|boxes?|packs?|packets?|tins?|bottles?|kgs?|kilos?|litres?|liters?|l|units?|pcs?';

export function parseConversationalMessage(text: string): ParsedOrderResult {
  const clean = text.trim();
  const lower = clean.toLowerCase();

  // 1. Check Tracking
  const poMatch = clean.match(/PO-[A-Z0-9-]+/i);
  if (poMatch || /\b(where is|track|status of|delivery time)\b/i.test(lower)) {
    return {
      intent: 'order_tracking',
      items: [],
      poNumberQuery: poMatch ? poMatch[0].toUpperCase() : undefined,
    };
  }

  // 2. Check Reorder
  if (/\b(repeat|same as|usual order|reorder|regular order)\b/i.test(lower)) {
    return {
      intent: 'reorder',
      items: [],
    };
  }

  // 3. Check Price Inquiry
  if (/\b(how much|what is the (price|rate)|cost of|cheapest rate|best price)\b/i.test(lower)) {
    const query = lower
      .replace(/^(what is the|how much is|rate for|price of|cheapest)\s+/i, '')
      .replace(/\s+(today|now|please|machan|\?)$/i, '')
      .trim();
    return {
      intent: 'price_inquiry',
      items: [{ query, quantity: 1, unit: 'unit' }],
    };
  }

  // 4. Check Order Draft
  // Split on commas, 'and', 'plus', or newlines
  const segments = clean
    .replace(/^machan\s+/i, '')
    .replace(/\b(send|order|need delivery of|please send|ewanna|danna)\b/gi, '')
    .split(/,|\band\b|\bplus\b|\n/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  const items: ParsedItem[] = [];

  for (const seg of segments) {
    const rx = new RegExp(`(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s*(${UNIT_PATTERNS})?\\s*(?:of\\s+)?(.*)`, 'i');
    const m = seg.match(rx);

    if (m) {
      const rawQty = m[1]!.toLowerCase();
      const quantity = /^\d+$/.test(rawQty) ? Number(rawQty) : WORD_NUMBERS[rawQty] ?? 1;
      let unit = m[2]?.toLowerCase() ?? 'unit';
      if (/^kgs?|^kilos?$/.test(unit)) unit = 'kg';
      if (/^bags?$/.test(unit)) unit = 'bag';
      if (/^tins?$/.test(unit)) unit = 'tin';
      if (/^bottles?$/.test(unit)) unit = 'bottle';
      if (/^cartons?$/.test(unit)) unit = 'carton';

      let query = m[3] ? m[3].trim() : '';
      // Strip trailing delivery phrases
      query = query.replace(/\s+(to depot|to branch|to hotel|tomorrow|urgently|for friday|asap).*$/i, '').trim();

      if (query.length > 1) {
        items.push({ query, quantity, unit });
      }
    }
  }

  if (items.length > 0) {
    return {
      intent: 'order_draft',
      items,
    };
  }

  // 5. Help / Greeting fallback
  return {
    intent: 'help',
    items: [],
  };
}
