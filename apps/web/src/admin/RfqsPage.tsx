import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Surface } from '@/components/brand/Surface';
import { Link } from 'react-router-dom';

export function AdminRfqsPage() {
  usePageTitle('RFQs');
  const { data } = useQuery({
    queryKey: ['admin-rfq-health'],
    queryFn: () => api.post<{ rfqsExpired: number; quotesExpired: number }>('/rfqs/admin/expire', {}),
  });
  void data;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Admin · Procurement</div>
      <h1 className="mt-1 text-3xl font-bold">RFQ oversight</h1>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Surface className="p-5"><div className="text-sm text-ink-3">Business RFQs</div><Link to="/orders" className="underline text-sm">Manage via orders →</Link><p className="mt-2 text-sm">RFQs convert into the same purchase-order pipeline; expiry runs hourly via cron.</p></Surface>
        <Surface className="p-5"><div className="text-sm text-ink-3">Expiry sweep</div><div className="text-2xl font-bold">{data ? `${data.rfqsExpired} rfqs · ${data.quotesExpired} quotes` : '…'}</div><p className="text-xs text-ink-4">Manual sweep just ran; hourly cron handles the rest.</p></Surface>
        <Surface className="p-5"><div className="text-sm text-ink-3"> thresholds</div><AdminThresholds /></Surface>
      </div>
    </div>
  );
}

function AdminThresholds() {
  const { data } = useQuery({ queryKey: ['rfq-thresholds'], queryFn: () => api.get<{ valueThresholdCents: number; quantityThreshold: number }>('/rfqs/thresholds') });
  if (!data) return <div className="text-sm">Loading…</div>;
  return <div className="text-sm">Bulk-quote at Rs. {(data.valueThresholdCents / 100).toLocaleString()} or {data.quantityThreshold}+ units. <span className="text-ink-4">(Configure in platform_settings.)</span></div>;
}
