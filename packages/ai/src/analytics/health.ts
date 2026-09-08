/** Procurement health score 0-100 with transparent subscores. Pure, no IO. */
export function procurementHealth(input: {
  maxShare: number;
  savingsRatio: number;
  minAccept: number;
  gapCV: number;
}): { score: number; subs: Record<string, number> } {
  let score = 100;
  const subs: Record<string, number> = { concentration: 0, price: 0, reliability: 0, consistency: 0 };
  if (input.maxShare > 0.4) {
    score -= 15;
    subs.concentration = -15;
  }
  if (input.savingsRatio > 0.05) {
    score -= 15;
    subs.price = -15;
  }
  if (input.minAccept < 0.8) {
    score -= 10;
    subs.reliability = -10;
  }
  if (input.gapCV > 0.5) {
    score -= 10;
    subs.consistency = -10;
  }
  return { score: Math.max(0, score), subs };
}
