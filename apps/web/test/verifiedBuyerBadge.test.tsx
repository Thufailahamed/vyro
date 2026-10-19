import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { VerifiedBuyerBadge } from '../src/supplier/crm/VerifiedBuyerBadge';

describe('VerifiedBuyerBadge', () => {
  it('renders VERIFIED with level when verified', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedBuyerBadge, { verified: true, level: 'basic', verifiedAt: 1700000000000 }),
    );
    // The badge is uppercased in CSS (`uppercase` class), so assert the DOM
    // text and the accessible label rather than a capitalised string.
    expect(html).toMatch(/Verified/);
    expect(html).toMatch(/basic/);
    expect(html).toMatch(/aria-label="Verified buyer"/);
  });

  it('renders nothing when unverified', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedBuyerBadge, { verified: false, level: 'none', verifiedAt: null }),
    );
    expect(html).toBe('');
  });
});
