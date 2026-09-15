import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { VerifiedBuyerBadge } from '../src/supplier/crm/VerifiedBuyerBadge';

describe('VerifiedBuyerBadge', () => {
  it('renders VERIFIED with level when verified', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedBuyerBadge, { verified: true, level: 'basic', verifiedAt: 1700000000000 }),
    );
    expect(html).toMatch(/VERIFIED/);
    expect(html).toMatch(/BASIC/);
  });

  it('renders nothing when unverified', () => {
    const html = renderToStaticMarkup(
      createElement(VerifiedBuyerBadge, { verified: false, level: 'none', verifiedAt: null }),
    );
    expect(html).toBe('');
  });
});
