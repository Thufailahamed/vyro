import { parseNlFilters, type ParsedFilters } from '@vyro/ai';

/** Single chip descriptor shown above the search results. */
export interface SearchChip {
  kind: 'price' | 'lead' | 'sort' | 'supplier';
  /** Display label, e.g. "≤ Rs. 1,200" or "fastest first". */
  label: string;
  /** Connector word used by rebuild(), e.g. "under", "by", "from". */
  connector: string;
  /** The value phrase matched by the connector (no leading connector). */
  value: string;
}

/**
 * Parse an arbitrary search query into chips for the UI. Empty input → no chips.
 * `rebuild` is given the chip to drop and returns a new q string.
 */
export function buildSearchChips(q: string): { chips: SearchChip[]; rebuilt: (drop: SearchChip) => string } {
  const { filters, query } = parseNlFilters(q);
  const chips: SearchChip[] = [];

  if (typeof filters.priceMaxCents === 'number') {
    const rupees = filters.priceMaxCents / 100;
    const labelRupees = rupees.toLocaleString('en-LK', { maximumFractionDigits: 0 });
    chips.push({
      kind: 'price',
      label: `≤ Rs. ${labelRupees}`,
      connector: 'under',
      value: `Rs. ${rupees}`,
    });
  }
  if (typeof filters.availableWithinDays === 'number') {
    const d = filters.availableWithinDays;
    let value: string;
    let label: string;
    if (d === 0) {
      value = 'today';
      label = 'today';
    } else if (d === 1) {
      value = 'tomorrow';
      label = 'by tomorrow';
    } else {
      value = `in ${d} day${d === 1 ? '' : 's'}`;
      label = `within ${d} days`;
    }
    chips.push({ kind: 'lead', label, connector: '', value });
  }
  if (filters.sort === 'lead_asc') {
    chips.push({ kind: 'sort', label: 'fastest first', connector: '', value: 'fast' });
  } else if (filters.sort === 'price_asc') {
    chips.push({ kind: 'sort', label: 'cheapest first', connector: '', value: 'cheap' });
  }
  if (filters.supplierName) {
    chips.push({
      kind: 'supplier',
      label: `from ${filters.supplierName}`,
      connector: 'from',
      value: filters.supplierName,
    });
  }
  void query;
  void ({} as ParsedFilters);

  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function rebuilt(drop: SearchChip): string {
    const valEsc = escape(drop.value);
    let next = q;
    if (drop.connector) {
      const re = new RegExp(`\\s*\\b${drop.connector}\\s+${valEsc}\\b`, 'i');
      next = next.replace(re, '');
    } else {
      const re = new RegExp(`\\b${valEsc}\\b`, 'i');
      next = next.replace(re, '');
    }
    return next.replace(/\s+/g, ' ').trim();
  }

  return { chips, rebuilt };
}
