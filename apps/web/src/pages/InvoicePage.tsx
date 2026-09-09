import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, apiBase } from '@/lib/api';
import { Button, Surface } from '@/components/ui';
import { ArrowLeftIcon } from '@/components/icons';

interface Invoice {
  id: string;
  number: string;
  type: 'receipt' | 'tax_invoice';
  totalCents: number;
  currency: string;
  issuedAt: number;
}

export function InvoicePage() {
  usePageTitle('Invoice');
  const { poId, invoiceId } = useParams();
  const id = invoiceId ?? '';

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get<{ invoice: Invoice }>(`/invoices/${id}`),
    enabled: !!id,
  });

  if (isLoading) return <div className="h-64 bg-mist animate-pulse" />;
  if (!data) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Invoice not found</h2>
        {poId && (
          <Link to={`/orders/${poId}`} className="mt-4 inline-block text-copper">
            ← Order
          </Link>
        )}
      </div>
    );
  }

  const htmlUrl = `${apiBase}/invoices/${encodeURIComponent(data.invoice.number)}/html`;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        to={poId ? `/orders/${poId}` : '/orders'}
        className="inline-flex items-center gap-1.5 text-xs text-ink-4 hover:text-ink"
      >
        <ArrowLeftIcon size={14} /> {poId ? 'Order' : 'Orders'}
      </Link>

      <Surface className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="vyro-kicker">{data.invoice.type === 'tax_invoice' ? 'Tax Invoice' : 'Receipt'}</div>
            <h1 className="mt-1 font-display text-2xl">{data.invoice.number}</h1>
          </div>
          <div className="flex gap-2">
            <a href={htmlUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">Open HTML</Button>
            </a>
            <a href={htmlUrl} download={`${data.invoice.number}.html`}>
              <Button>Download (print to PDF)</Button>
            </a>
          </div>
        </div>

        <iframe
          src={htmlUrl}
          className="w-full border border-ink/10 bg-paper"
          style={{ height: '70vh' }}
          title={data.invoice.number}
        />
      </Surface>
    </div>
  );
}
