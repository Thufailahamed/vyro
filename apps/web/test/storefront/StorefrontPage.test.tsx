import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { StorefrontPage } from '../../src/storefront/StorefrontPage';

describe('StorefrontPage', () => {
  it('renders loading state initially', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(StorefrontPage)),
    );
    expect(html).toMatch(/Loading/);
  });
});
