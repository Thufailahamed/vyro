import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RatingStars } from '../../src/reviews/RatingStars';
import { RatingDistribution } from '../../src/reviews/RatingDistribution';

describe('RatingStars', () => {
  it('renders avg + count when reviews exist', () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { avg: 4.5, count: 12 }));
    expect(html).toMatch(/4\.5/);
    expect(html).toMatch(/12/);
    expect(html).toMatch(/★/);
  });

  it('renders "No reviews" when count is 0', () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { avg: null, count: 0 }));
    expect(html).toMatch(/No reviews/);
  });

  it('renders "No reviews" when count > 0 but avg is null', () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { avg: null, count: 5 }));
    expect(html).toMatch(/No reviews/);
  });

  it('rounds to nearest star for color', () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { avg: 3.4, count: 10 }));
    // 3.4 rounds to 3 → first 3 stars yellow, last 2 gray
    expect(html).toMatch(/text-yellow-500/g);
    expect(html).toMatch(/text-gray-300/g);
  });
});

describe('RatingDistribution', () => {
  it('renders 5 rows (5..1) with bars', () => {
    const html = renderToStaticMarkup(
      createElement(RatingDistribution, {
        counts: { 1: 0, 2: 0, 3: 1, 4: 2, 5: 7 },
        total: 10,
      }),
    );
    expect(html).toMatch(/70%/); // 7/10 = 70%
    expect(html).toMatch(/20%/); // 2/10 = 20%
  });

  it('handles total=0 without division by zero', () => {
    const html = renderToStaticMarkup(
      createElement(RatingDistribution, {
        counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        total: 0,
      }),
    );
    expect(html).toMatch(/0%/);
  });
});