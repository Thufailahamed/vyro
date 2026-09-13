import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { SeoHead } from '../../src/components/SeoHead';

describe('SeoHead', () => {
  it('renders without throwing', () => {
    const html = renderToStaticMarkup(createElement(SeoHead, { title: 'Foo' }));
    expect(html).toBe('');
  });
});
