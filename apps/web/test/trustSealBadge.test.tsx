import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TrustSealBadge } from '../src/components/TrustSealBadge';

describe('TrustSealBadge', () => {
  it('renders gold badge with year when active', () => {
    const html = renderToStaticMarkup(
      createElement(TrustSealBadge, { active: true, memberSinceYear: 2024, expiresAt: Date.now() + 1000 }),
    );
    expect(html).toMatch(/TRUSTSEAL/);
    expect(html).toMatch(/2024/);
  });
  it('renders nothing when inactive', () => {
    const html = renderToStaticMarkup(createElement(TrustSealBadge, { active: false }));
    expect(html).toBe('');
  });
});
