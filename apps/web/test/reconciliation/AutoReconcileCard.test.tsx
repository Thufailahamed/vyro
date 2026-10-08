import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@vyro/ui';
import { ThreeWayReconciliationCard } from '../../src/components/reconciliation/ThreeWayReconciliationCard';

function render(ui: JSX.Element): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(ToastProvider, null, createElement(MemoryRouter, null, ui)),
    ),
  );
}

const PAYLOAD = {
  poTotalCents: 17000,
  invoiceTotalCents: 18000,
  netDifferenceCents: 1000,
  isDeliveryConfirmed: true,
  lines: [],
};

const AI_LINE = {
  description: 'White Sugar 1kg',
  poItemId: 'poi-sugar',
  poQuantity: 20,
  billedQuantity: 20,
  poUnitPriceCents: 250,
  billedUnitPriceCents: 250,
  varianceCents: 0,
  status: 'matched',
  matchSource: 'ai',
  matchConfidence: 0.98,
  matchExplanation: 'Abbreviation and pack size match.',
};

const SUGGESTION_LINE = {
  description: 'WHT SGR 1KG',
  billedQuantity: 20,
  billedUnitPriceCents: 250,
  billedTotalCents: 5000,
  varianceCents: 5000,
  status: 'unexpected_item',
  aiSuggestion: {
    poItemId: 'poi-sugar',
    productName: 'White Sugar 1kg',
    confidence: 0.78,
    reason: 'Possible abbreviation match; verify before accepting.',
  },
};

describe('ThreeWayReconciliationCard auto hydration', () => {
  it('renders the upload entry next to the audit action', () => {
    const html = render(
      createElement(ThreeWayReconciliationCard, {
        orderId: 'po-1',
        poNumber: 'PO-1',
        poTotalCents: 17000,
        orderStatus: 'delivered',
      }),
    );
    expect(html).toMatch(/Upload supplier invoice/);
    expect(html).toContain('/invoices/upload?poId=po-1');
    expect(html).toMatch(/Run 3-Way Audit/);
    expect(html).toMatch(/Upload one to have it/i);
  });

  it('marks an auto-hydrated discrepancy result', () => {
    const html = render(
      createElement(ThreeWayReconciliationCard, {
        orderId: 'po-2',
        poNumber: 'PO-2',
        poTotalCents: 17000,
        orderStatus: 'delivered',
        autoReconciliation: { status: 'discrepancy', payload: PAYLOAD },
      }),
    );
    expect(html).toMatch(/Checked automatically/);
    expect(html).toMatch(/Rs\. 180/); // invoice total 18000 cents → "Rs. 180"
  });

  it('shows the prompt when nothing has been checked', () => {
    const html = render(
      createElement(ThreeWayReconciliationCard, {
        orderId: 'po-3',
        poNumber: 'PO-3',
        poTotalCents: 17000,
        orderStatus: 'delivered',
        autoReconciliation: { status: 'none', payload: null },
      }),
    );
    expect(html).toMatch(/Upload supplier invoice/);
    expect(html).not.toMatch(/Checked automatically/);
  });

  it('renders AI match source, confidence, and explanation', () => {
    const html = render(
      createElement(ThreeWayReconciliationCard, {
        orderId: 'po-ai',
        poNumber: 'PO-AI',
        poTotalCents: 17000,
        orderStatus: 'delivered',
        autoReconciliation: {
          status: 'discrepancy',
          payload: { ...PAYLOAD, lines: [AI_LINE] } as any,
        },
      }),
    );
    expect(html).toMatch(/AI match/);
    expect(html).toMatch(/98%/);
    expect(html).toMatch(/Abbreviation and pack size match/);
  });

  it('shows low-confidence suggestions and links to invoice review', () => {
    const html = render(
      createElement(ThreeWayReconciliationCard, {
        orderId: 'po-suggestion',
        poNumber: 'PO-SUGGESTION',
        poTotalCents: 17000,
        orderStatus: 'delivered',
        autoReconciliation: {
          status: 'discrepancy',
          payload: { ...PAYLOAD, lines: [SUGGESTION_LINE] } as any,
          uploadId: 'upload-id',
        },
      }),
    );
    expect(html).toMatch(/Possible PO match/);
    expect(html).toMatch(/White Sugar 1kg/);
    expect(html).toMatch(/78%/);
    expect(html).toMatch(/Possible abbreviation match/);
    expect(html).toContain('href="/invoices/upload-id/review"');
    expect(html).toMatch(/Review invoice lines/);
  });
});
