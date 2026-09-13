export const CREDIT_STARTING_LIMIT_CENTS = 10_000_000;

export function termsLabel(terms: string): string {
  if (terms === 'net14') return 'Net 14';
  if (terms === 'net30') return 'Net 30';
  return terms;
}

export function drawdownStatusLabel(status: string): string {
  if (status === 'active') return 'Open';
  if (status === 'overdue') return 'Overdue';
  if (status === 'repaid') return 'Repaid';
  return status;
}

export function unlockSlotState(
  index: number,
  paidOrderCount: number,
): 'done' | 'current' | 'todo' {
  if (index < paidOrderCount) return 'done';
  if (index === paidOrderCount) return 'current';
  return 'todo';
}

export function remainingCents(amountCents: number, repaidCents: number): number {
  return Math.max(0, amountCents - repaidCents);
}
