import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@vyro/ui';
import { ReorderButton } from '../components/ReorderButton';

/**
 * Render the ReorderButton with the minimum provider stack that its
 * internal hooks need: React Query (mutation hook), Toast (success toast),
 * and a Router (navigate to /cart on success). Returns the rendered HTML
 * string so we can assert on data-testid attributes without DOM.
 */
function wrap(node: ReactNode): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    createElement(QueryClientProvider, { client: qc },
      createElement(ToastProvider, null,
        createElement(MemoryRouter, null, node),
      ),
    ),
  );
}

const REORDER_BTN = 'data-testid="reorder-button"';

describe('ReorderButton visibility', () => {
  it('renders on completed orders', () => {
    const html = wrap(createElement(ReorderButton, { orderId: 'po-1', orderStatus: 'completed' }));
    expect(html).toContain(REORDER_BTN);
  });

  it('renders on delivered orders', () => {
    const html = wrap(createElement(ReorderButton, { orderId: 'po-1', orderStatus: 'delivered' }));
    expect(html).toContain(REORDER_BTN);
  });

  it('renders on ready_for_pickup orders', () => {
    const html = wrap(createElement(ReorderButton, { orderId: 'po-1', orderStatus: 'ready_for_pickup' }));
    expect(html).toContain(REORDER_BTN);
  });

  it('hides on pending orders', () => {
    const html = wrap(createElement(ReorderButton, { orderId: 'po-1', orderStatus: 'pending' }));
    expect(html).not.toContain(REORDER_BTN);
  });

  it('hides on disputed orders', () => {
    const html = wrap(createElement(ReorderButton, { orderId: 'po-1', orderStatus: 'disputed' }));
    expect(html).not.toContain(REORDER_BTN);
  });

  it('hides on cancelled orders', () => {
    const html = wrap(createElement(ReorderButton, { orderId: 'po-1', orderStatus: 'cancelled' }));
    expect(html).not.toContain(REORDER_BTN);
  });
});
