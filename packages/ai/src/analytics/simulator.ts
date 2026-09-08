export interface SimulatorInput {
  productName: string;
  currentSupplier: string;
  currentPriceCents: number;
  currentLeadDays: number;
  alternativeSupplier: string;
  alternativePriceCents: number;
  alternativeLeadDays: number;
  monthlyQuantity: number;
  cadenceSampleSize: number;
}

export interface SimulatorOutput {
  monthlyDeltaCents: number;
  annualDeltaCents: number;
  leadDeltaDays: number;
  confidence: 'high' | 'medium' | 'low';
  savingsPct: number;
}

export function simulateSupplierSwitch(input: SimulatorInput): SimulatorOutput {
  const monthlyDeltaCents =
    (input.alternativePriceCents - input.currentPriceCents) * input.monthlyQuantity;
  const annualDeltaCents = monthlyDeltaCents * 12;
  const leadDeltaDays = input.alternativeLeadDays - input.currentLeadDays;
  const confidence: SimulatorOutput['confidence'] =
    input.cadenceSampleSize >= 6
      ? 'high'
      : input.cadenceSampleSize >= 3
        ? 'medium'
        : 'low';
  const base = input.currentPriceCents * input.monthlyQuantity;
  const savingsPct =
    base > 0
      ? Math.round(
          ((input.currentPriceCents - input.alternativePriceCents) * 10000) /
            input.currentPriceCents,
        ) / 100
      : 0;
  return {
    monthlyDeltaCents,
    annualDeltaCents,
    leadDeltaDays,
    confidence,
    savingsPct,
  };
}
