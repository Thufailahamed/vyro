import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

describe('ranking inline reasons', () => {
  it('renders reason text + Best match badge markup shape', () => {
    const html = renderToStaticMarkup(
      createElement('div', null,
        createElement('span', { className: 'font-mono' }, '#1 · Verified + Best price'),
        createElement('span', { className: 'bg-volt/20 text-volt' }, 'Best match'),
      ),
    );
    expect(html).toMatch(/Verified/);
    expect(html).toMatch(/Best price/);
    expect(html).toMatch(/Best match/);
  });
});
