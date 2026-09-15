import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemberSinceBadge } from '../src/components/MemberSinceBadge';

describe('MemberSinceBadge', () => {
  it('renders year and tenure', () => {
    const html = renderToStaticMarkup(
      createElement(MemberSinceBadge, { sinceYear: 2021, memberYears: 5, sinceDate: new Date('2021-06-15T00:00:00Z').toISOString() }),
    );
    expect(html).toMatch(/Member since/i);
    expect(html).toMatch(/2021/);
    expect(html).toMatch(/5 yrs/);
  });
  it('renders New when 0 years', () => {
    const html = renderToStaticMarkup(createElement(MemberSinceBadge, { sinceYear: 2026, memberYears: 0 }));
    expect(html).toMatch(/2026/);
    expect(html).toMatch(/New/);
  });
  it('renders nothing when sinceYear is null', () => {
    const html = renderToStaticMarkup(createElement(MemberSinceBadge, { sinceYear: null, memberYears: null }));
    expect(html).toBe('');
  });
});
