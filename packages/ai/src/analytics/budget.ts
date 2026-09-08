export interface BudgetLine {
  productName: string;
  supplier: string;
  priceCents: number;
  quantity: number;
  cheapestPriceCents: number;
  cheapestSupplier: string;
}

export interface FittedLine {
  productName: string;
  supplier: string;
  priceCents: number;
  quantity: number;
  swapped: boolean;
}

export interface BudgetSwap {
  productName: string;
  from: string;
  to: string;
  savingCents: number;
}

export interface BudgetFit {
  lines: FittedLine[];
  total: number;
  cheapestTotal: number;
  withinBudget: boolean;
  swaps: BudgetSwap[];
}

export function fitBudget(lines: BudgetLine[], capCents: number): BudgetFit {
  const base = lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const cheapestTotal = lines.reduce(
    (s, l) => s + Math.min(l.priceCents, l.cheapestPriceCents) * l.quantity,
    0,
  );

  if (base <= capCents) {
    return {
      lines: lines.map((l) => ({
        productName: l.productName,
        supplier: l.supplier,
        priceCents: l.priceCents,
        quantity: l.quantity,
        swapped: false,
      })),
      total: base,
      cheapestTotal,
      withinBudget: true,
      swaps: [],
    };
  }

  const order = [...lines].sort(
    (a, b) =>
      (b.priceCents - b.cheapestPriceCents) * b.quantity -
      (a.priceCents - a.cheapestPriceCents) * a.quantity,
  );

  const fitted = new Map<string, FittedLine>();
  for (const l of lines) {
    fitted.set(l.productName, {
      productName: l.productName,
      supplier: l.supplier,
      priceCents: l.priceCents,
      quantity: l.quantity,
      swapped: false,
    });
  }

  const swaps: BudgetSwap[] = [];
  let total = base;

  for (const l of order) {
    if (total <= capCents) break;
    if (l.cheapestPriceCents >= l.priceCents) continue;
    const saving = (l.priceCents - l.cheapestPriceCents) * l.quantity;
    fitted.set(l.productName, {
      productName: l.productName,
      supplier: l.cheapestSupplier,
      priceCents: l.cheapestPriceCents,
      quantity: l.quantity,
      swapped: true,
    });
    swaps.push({
      productName: l.productName,
      from: l.supplier,
      to: l.cheapestSupplier,
      savingCents: saving,
    });
    total -= saving;
  }

  return {
    lines: lines.map((l) => fitted.get(l.productName)!),
    total,
    cheapestTotal,
    withinBudget: total <= capCents,
    swaps,
  };
}
