import type { AliasMatchOverride, InvoiceItemData, PoItemInput } from './types';

/** Exact key normalization shared by alias learning and reconciliation. */
export function normalizeInvoiceAlias(description: string): string {
  const normalized = description
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 200 ? '' : normalized;
}

export interface InvoiceProductAliasInput {
  normalizedAlias: string;
  productId: string;
}

/**
 * Resolve only exact buyer-confirmed aliases to a unique remaining PO line.
 * Alias rows are already scoped to business + supplier by the API repository.
 */
export function planInvoiceAliasMatches(
  poItems: PoItemInput[],
  invoiceItems: InvoiceItemData[],
  aliases: InvoiceProductAliasInput[],
): AliasMatchOverride[] {
  const productByAlias = new Map(
    aliases.filter((alias) => alias.normalizedAlias.length > 0)
      .map((alias) => [alias.normalizedAlias, alias.productId]),
  );
  const reservedInvoiceIndexes = new Set<number>();
  const reservedPoItemIds = new Set<string>();
  const overrides: AliasMatchOverride[] = [];

  for (let invoiceItemIndex = 0; invoiceItemIndex < invoiceItems.length; invoiceItemIndex++) {
    const normalizedAlias = normalizeInvoiceAlias(invoiceItems[invoiceItemIndex]!.description);
    const productId = productByAlias.get(normalizedAlias);
    if (!normalizedAlias || !productId) continue;

    const candidates = poItems.filter(
      (item) => item.productId === productId && !reservedPoItemIds.has(item.id),
    );
    if (candidates.length !== 1 || reservedInvoiceIndexes.has(invoiceItemIndex)) continue;

    const candidate = candidates[0]!;
    reservedInvoiceIndexes.add(invoiceItemIndex);
    reservedPoItemIds.add(candidate.id);
    overrides.push({
      invoiceItemIndex,
      poItemId: candidate.id,
      reason: 'Previously confirmed supplier alias.',
    });
  }
  return overrides;
}
