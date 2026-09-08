import type { PageContext } from '@vyro/ai';

const PRONOUN_RX = /\b(something|this|it|that|cheaper|that one|this one)\b/i;

/**
 * applyPageContext: fills empty slots from the caller's page context when the
 * prompt contains a pronoun or the page itself implies the entity. Never
 * overrides explicit slots. Unknown context names are ignored so a malicious
 * client cannot inject entities that aren't in the catalog.
 */
export function applyPageContext(
  slots: Record<string, unknown>,
  context: PageContext | undefined,
  catalog: { products: string[]; suppliers: string[] },
  prompt: string,
): { slots: Record<string, unknown>; filledFromContext: boolean } {
  if (!context) return { slots, filledFromContext: false };
  const out: Record<string, unknown> = { ...slots };
  let filled = false;

  const matchProduct = (name: string) =>
    catalog.products.find((p) => p.toLowerCase() === name.toLowerCase());
  const matchSupplier = (name: string) =>
    catalog.suppliers.find((s) => s.toLowerCase() === name.toLowerCase());

  if (
    !out.productName &&
    context.productName &&
    (PRONOUN_RX.test(prompt) || context.page === 'product')
  ) {
    const match = matchProduct(context.productName);
    if (match) {
      out.productName = match;
      filled = true;
    }
  }

  if (
    !out.supplierName &&
    context.supplierName &&
    (context.page === 'supplier' || PRONOUN_RX.test(prompt))
  ) {
    const match = matchSupplier(context.supplierName);
    if (match) {
      out.supplierName = match;
      filled = true;
    }
  }

  return { slots: out, filledFromContext: filled };
}
