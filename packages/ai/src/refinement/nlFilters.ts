export type NlSort = 'price_asc' | 'lead_asc' | 'recommended';

export interface ParsedFilters {
  query?: string;
  priceMaxCents?: number;
  availableWithinDays?: number;
  categorySlug?: string;
  brand?: string;
  supplierName?: string;
  sort?: NlSort;
}

const PRICE_RX = /\bunder\s+rs\.?\s?([\d,]+)/i;
const TIME_RX = /\b(today|tomorrow|in\s+(\d+)\s*(?:hour|hr|day|d)s?)\b/i;
const CATEGORY_SLANG: Array<[string, string]> = [
  ['bakery', 'bakery'],
  ['restaurant', 'restaurant'],
  ['cafe', 'cafe'],
  ['kitchen', 'kitchen'],
];
const CHEAP_RX = /\b(cheap|cheapest|lowest|low\s*price)\b/i;
const FAST_RX = /\b(urgent|fast|asap|quick(ly)?|same[-\s]?day)\b/i;
const FROM_SUPPLIER_RX = /\bfrom\s+([A-Z][\w&' .-]{1,60})(?=\s|$)/;

export function parseNlFilters(prompt: string): { filters: ParsedFilters; query: string } {
  let q = prompt.trim();
  const filters: ParsedFilters = {};

  const pm = q.match(PRICE_RX);
  if (pm && pm[1]) {
    const cents = Math.round(Number(pm[1].replace(/,/g, '')) * 100);
    if (Number.isFinite(cents) && cents > 0 && cents <= 100_000_000) filters.priceMaxCents = cents;
    q = q.replace(PRICE_RX, '').replace(/\s+/g, ' ').trim();
  }

  const tm = q.match(TIME_RX);
  if (tm) {
    let days: number | undefined;
    if (tm[1] === 'today') days = 0;
    else if (tm[1] === 'tomorrow') days = 1;
    else if (tm[2]) days = Math.max(0, Math.min(30, parseInt(tm[2], 10)));
    if (typeof days === 'number') filters.availableWithinDays = days;
    q = q.replace(TIME_RX, '').replace(/\s+/g, ' ').trim();
  }

  for (const [slang, slug] of CATEGORY_SLANG) {
    const re = new RegExp(`\\bfor\\s+${slang}\\b|\\b${slang}\\s+suppl(?:y|ies)\\b`, 'i');
    if (re.test(q)) {
      filters.categorySlug = slug;
      q = q.replace(re, '').replace(/\s+/g, ' ').trim();
      break;
    }
  }

  if (FAST_RX.test(q)) filters.sort = 'lead_asc';
  else if (CHEAP_RX.test(q)) filters.sort = 'price_asc';
  if (filters.sort) q = q.replace(FAST_RX, '').replace(CHEAP_RX, '').replace(/\s+/g, ' ').trim();

  const fm = q.match(FROM_SUPPLIER_RX);
  if (fm && fm[1]) {
    filters.supplierName = fm[1].trim();
    q = q.replace(fm[0], '').replace(/\s+/g, ' ').trim();
  }

  if (q.length > 0) filters.query = q;
  return { filters, query: filters.query ?? q };
}
