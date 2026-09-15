import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/supplier/learning/hooks/useLearning', () => ({
  useOnboardingGate: () => ({
    data: {
      required: true,
      missing: [
        { slug: 'publish-your-first-product', title: 'Publish your first product' },
        { slug: 'set-up-payouts', title: 'Set up payouts' },
      ],
    },
  }),
}));

vi.mock('../../src/supplier/useSupplierId', () => ({
  useSupplierId: () => ({ supplierId: 's1', role: 'owner', supplierName: 'Acme' }),
}));

import { LearningCta } from '../../src/supplier/learning/LearningCta';

describe('LearningCta', () => {
  it('renders banner variant with missing lessons and open-training link', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(LearningCta)),
    );
    expect(html).toMatch(/Complete training to publish \(2 pending\)/);
    expect(html).toMatch(/Publish your first product/);
    expect(html).toMatch(/Set up payouts/);
    expect(html).toMatch(/Open training/);
  });

  it('caps the visible list at 3 with overflow note', () => {
    vi.resetModules();
    vi.doMock('../../src/supplier/learning/hooks/useLearning', () => ({
      useOnboardingGate: () => ({
        data: {
          required: true,
          missing: [
            { slug: 'a', title: 'A' },
            { slug: 'b', title: 'B' },
            { slug: 'c', title: 'C' },
            { slug: 'd', title: 'D' },
            { slug: 'e', title: 'E' },
          ],
        },
      }),
    }));
    vi.doMock('../../src/supplier/useSupplierId', () => ({
      useSupplierId: () => ({ supplierId: 's1', role: 'owner', supplierName: 'A' }),
    }));
    return import('../../src/supplier/learning/LearningCta').then(({ LearningCta: Cta2 }) => {
      const html = renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(Cta2)),
      );
      expect(html).toMatch(/\+ 2 more/);
    });
  });
});
