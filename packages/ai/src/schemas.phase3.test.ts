import { describe, it, expect } from 'vitest';
import { INTENT_NAMES, ComponentEnvelopeSchema, WhyCardDataSchema, SimulationCardDataSchema } from './schemas';

describe('Phase 3 schema additions', () => {
  it('includes simulate_supplier_switch intent', () => {
    expect(INTENT_NAMES).toContain('simulate_supplier_switch');
  });

  it('why_card envelope validates', () => {
    const r = ComponentEnvelopeSchema.safeParse({
      type: 'why_card',
      data: {
        question: 'Why?',
        answer: 'Because.',
        evidence: [{ label: 'L', value: 'V' }],
        recommendation: null,
      },
    });
    expect(r.success).toBe(true);
  });

  it('simulation_card envelope validates', () => {
    const r = ComponentEnvelopeSchema.safeParse({
      type: 'simulation_card',
      data: {
        productName: 'Rice',
        currentSupplier: 'A',
        alternativeSupplier: 'B',
        monthlyQuantity: 4,
        monthlyDeltaCents: -320000,
        annualDeltaCents: -3840000,
        leadDeltaDays: 1,
        savingsPct: 16,
        confidence: 'high',
      },
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown component type', () => {
    const r = ComponentEnvelopeSchema.safeParse({ type: 'magic_card', data: {} });
    expect(r.success).toBe(false);
  });

  it('WhyCardData strict rejects unknown keys', () => {
    const r = WhyCardDataSchema.safeParse({
      question: 'q',
      answer: 'a',
      evidence: [],
      recommendation: null,
      bogus: true,
    });
    expect(r.success).toBe(false);
  });

  it('SimulationCardData rejects bad confidence enum', () => {
    const r = SimulationCardDataSchema.safeParse({
      productName: 'x',
      currentSupplier: 'a',
      alternativeSupplier: 'b',
      monthlyQuantity: 1,
      monthlyDeltaCents: 0,
      annualDeltaCents: 0,
      leadDeltaDays: 0,
      savingsPct: 0,
      confidence: 'maybe',
    });
    expect(r.success).toBe(false);
  });
});
