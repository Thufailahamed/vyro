import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  WhyCard,
  SimulationCard,
  ClarificationCard,
  RecommendationCard,
  renderComponent,
} from '../src/ask/components';

describe('Phase 3 cards', () => {
  it('renders WhyCard with evidence + recommendation', () => {
    const html = renderToStaticMarkup(
      createElement(WhyCard, {
        data: {
          question: 'Why did spending increase?',
          answer: 'Chicken drove the change.',
          evidence: [
            { label: 'Current period', value: 'Rs. 12,500.00' },
            { label: 'Prior period', value: 'Rs. 10,800.00' },
          ],
          recommendation: 'Compare alternate chicken suppliers.',
        },
      }),
    );
    expect(html).toMatch(/Why/);
    expect(html).toMatch(/Compare alternate chicken suppliers/);
  });

  it('renders SimulationCard with delta + monthly/annual Rs', () => {
    const html = renderToStaticMarkup(
      createElement(SimulationCard, {
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
      }),
    );
    expect(html).toMatch(/Rice/);
    expect(html).toMatch(/Rs/);
  });

  it('renderComponent dispatches why_card and simulation_card', () => {
    const whyEl = renderComponent(
      { type: 'why_card', data: { question: 'q', answer: 'a', evidence: [], recommendation: null } } as any,
      0,
    );
    const simEl = renderComponent(
      {
        type: 'simulation_card',
        data: {
          productName: 'Rice',
          currentSupplier: 'A',
          alternativeSupplier: 'B',
          monthlyQuantity: 1,
          monthlyDeltaCents: -100,
          annualDeltaCents: -1200,
          leadDeltaDays: 0,
          savingsPct: 5,
          confidence: 'medium',
        },
      } as any,
      1,
    );
    expect(whyEl).toBeTruthy();
    expect(simEl).toBeTruthy();
  });

  it('clarification chips are sentence-case, not an error banner', () => {
    const html = renderToStaticMarkup(
      createElement(ClarificationCard, {
        data: {
          question: 'What do you need help with?',
          options: ['FIND MY CHEAPEST SUPPLIERS', 'WHAT SHOULD I REORDER?'],
        },
      }),
    );
    expect(html).not.toMatch(/Clarification Required/i);
    expect(html).not.toMatch(/CLARIFICATION REQUIRED/);
    expect(html).toMatch(/Find my cheapest suppliers/);
    expect(html).toMatch(/What should I reorder\?/);
  });

  it('recommendation card leads with product and price, not ops jargon', () => {
    const html = renderToStaticMarkup(
      createElement(RecommendationCard, {
        data: {
          productName: 'Samba Rice 25kg',
          supplierName: 'Kurunegala Mill',
          priceCents: 1250000,
          offerCount: 3,
          savingVsHighestCents: 15000,
        },
      }),
    );
    expect(html).toMatch(/Samba Rice 25kg/);
    expect(html).toMatch(/Kurunegala Mill/);
    expect(html).not.toMatch(/Prime Value Recommendation/);
    expect(html).not.toMatch(/Procurement Audit Highlights/);
  });
});
