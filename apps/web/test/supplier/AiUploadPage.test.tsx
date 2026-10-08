import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@vyro/ui';
import { AiUploadLanding } from '../../src/supplier/AiUploadPage';

function render(ui: JSX.Element): string {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(ToastProvider, null, createElement(MemoryRouter, null, ui)),
    ),
  );
}

describe('AiUploadPage (staging entry)', () => {
  it('renders the upload form with the supported-file hint', () => {
    const html = render(createElement(AiUploadLanding, { supplierId: 'sup-1' }));
    expect(html).toMatch(/Upload products with AI/);
    expect(html).toMatch(/CSV export/);
    expect(html).toMatch(/nothing goes live/i);
  });

  it('hides the picker when no supplier membership exists', () => {
    const html = render(createElement(AiUploadLanding, { supplierId: null }));
    expect(html).toMatch(/Upload products with AI/);
  });
});
