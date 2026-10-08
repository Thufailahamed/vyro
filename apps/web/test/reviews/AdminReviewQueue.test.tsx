import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminReviewQueue } from '../../src/reviews/AdminReviewQueue';

describe('AdminReviewQueue', () => {
  it('renders loading state initially', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      createElement(QueryClientProvider, { client: qc }, createElement(AdminReviewQueue)),
    );
    expect(html).toContain('animate-pulse');
  });
});
