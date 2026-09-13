import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ReviewForm } from '../../src/reviews/ReviewForm';

describe('ReviewForm', () => {
  it('renders form with rating select + textarea + submit', () => {
    const html = renderToStaticMarkup(createElement(ReviewForm, { orderId: 'o1' }));
    expect(html).toMatch(/Rating/);
    expect(html).toMatch(/Review/);
    expect(html).toMatch(/Submit review/);
    expect(html).toMatch(/0\/2000/);
  });

  it('disables submit when body is empty', () => {
    const html = renderToStaticMarkup(createElement(ReviewForm, { orderId: 'o1' }));
    expect(html).toMatch(/disabled/);
  });

  it('enforces 2000-char max on textarea', () => {
    const html = renderToStaticMarkup(createElement(ReviewForm, { orderId: 'o1' }));
    expect(html).toMatch(/maxLength="2000"/);
  });

  it('defaults rating to 5', () => {
    const html = renderToStaticMarkup(createElement(ReviewForm, { orderId: 'o1' }));
    expect(html).toMatch(/<option value="5"[^>]*>5<\/option>/);
  });
});