import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AdminReviewQueue } from '../../src/reviews/AdminReviewQueue';

describe('AdminReviewQueue', () => {
  it('renders loading state initially', () => {
    const html = renderToStaticMarkup(createElement(AdminReviewQueue));
    expect(html).toMatch(/Loading flags/);
  });
});
