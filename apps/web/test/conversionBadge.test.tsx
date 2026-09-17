import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ConversionBadge } from '../src/supplier/crm/ConversionBadge';

describe('ConversionBadge', () => {
  it('renders untracked when status is null', () => {
    const html = renderToStaticMarkup(createElement(ConversionBadge, { status: null }));
    expect(html).toMatch(/untracked/);
  });

  it('renders status text with styled dot for known statuses', () => {
    const statuses = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;
    for (const s of statuses) {
      const html = renderToStaticMarkup(createElement(ConversionBadge, { status: s }));
      expect(html).toMatch(new RegExp(s));
    }
  });
});
