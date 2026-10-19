import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MarketingHeader, audienceLinks } from '../src/components/SiteHeader';
import type { SessionUser } from '../src/lib/auth';

function user(over: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 'u1',
    email: 'a@b.lk',
    name: 'Thufail',
    isAdmin: false,
    memberships: [],
    supplierMemberships: [],
    ...over,
  };
}

const business = { businessId: 'b1', role: 'owner' as const, businessName: 'B' };
const supplier = { supplierId: 's1', role: 'owner' as const, supplierName: 'S' };

function hrefs(u: SessionUser | null) {
  return Object.fromEntries(audienceLinks(u).map((l) => [l.label, l.to]));
}

describe('MarketingHeader', () => {
  it('renders an ink bar with volt CTA and paper wordmark', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(MarketingHeader, { user: user() }),
      ),
    );
    expect(html).toMatch(/Open workspace/);
    expect(html).toMatch(/How it works/);
    expect(html).toMatch(/For buyers/);
    expect(html).toMatch(/For suppliers/);
    expect(html).toMatch(/bg-void/);
    expect(html).not.toMatch(/bg-bone\/90/);
  });

  it('points signed-in members at their workspace instead of onboarding', () => {
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/'] },
        createElement(MarketingHeader, {
          user: user({ memberships: [business], supplierMemberships: [supplier] }),
        }),
      ),
    );
    expect(html).not.toMatch(/href="\/onboarding\//);
  });
});

describe('audienceLinks', () => {
  it('sends visitors to onboarding', () => {
    expect(hrefs(null)).toEqual({
      'For buyers': '/onboarding/business',
      'For suppliers': '/onboarding/supplier',
    });
  });

  it('sends signed-in users without an org to onboarding', () => {
    expect(hrefs(user())).toEqual({
      'For buyers': '/onboarding/business',
      'For suppliers': '/onboarding/supplier',
    });
  });

  it('sends buyers to the dashboard and suppliers to the supplier portal', () => {
    expect(hrefs(user({ memberships: [business] }))['For buyers']).toBe('/dashboard');
    expect(hrefs(user({ memberships: [business] }))['For suppliers']).toBe('/onboarding/supplier');
    expect(hrefs(user({ supplierMemberships: [supplier] }))['For suppliers']).toBe('/supplier');
    expect(hrefs(user({ supplierMemberships: [supplier] }))['For buyers']).toBe('/onboarding/business');
  });
});
