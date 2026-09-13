import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: {
      name: 'Thufail',
      memberships: [{ businessId: 'b1', businessName: 'Test', role: 'owner' }],
    },
  }),
}));

vi.mock('../src/lib/usePageTitle', () => ({
  usePageTitle: () => undefined,
}));

vi.mock('../src/ask/hooks/useVyroAI', () => ({
  useVyroAI: () => ({
    state: { turns: [], loading: false },
    send: () => Promise.resolve(),
    clear: () => undefined,
    regenerate: () => Promise.resolve(),
  }),
}));

describe('Ask landing', () => {
  it('renders a premium empty state with workspace and trust marks', async () => {
    const { AskPage } = await import('../src/ask/AskPage');
    const html = renderToStaticMarkup(createElement(AskPage));
    expect(html).toMatch(/What do you need\?/);
    expect(html).toMatch(/Ask VYRO/);
    expect(html).toMatch(/Test/);
    expect(html).toMatch(/Live mill prices/);
    expect(html).toMatch(/Find cheapest suppliers/);
    expect(html).not.toMatch(/Reset Session/);
    expect(html).not.toMatch(/CONSULT/);
  });
});
