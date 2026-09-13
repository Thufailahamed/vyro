import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MarketingHeader } from '../src/components/SiteHeader';

describe('MarketingHeader', () => {
  it('renders an ink bar with volt CTA and paper wordmark', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(MarketingHeader, { user: { name: 'Thufail' } }),
      ),
    );
    expect(html).toMatch(/Open workspace/);
    expect(html).toMatch(/How it works/);
    expect(html).toMatch(/For buyers/);
    expect(html).toMatch(/For suppliers/);
    expect(html).toMatch(/bg-void/);
    expect(html).not.toMatch(/bg-bone\/90/);
  });
});
