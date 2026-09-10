import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { Surface } from '@/components/brand/Surface';
import { Button } from '@/components/ui';
import { Link } from 'react-router-dom';
import { useToast } from '@vyro/ui';

export function AdminRfqsPage() {
  usePageTitle('RFQs');
  const toast = useToast();
  const [result, setResult] = useState<{ rfqsExpired: number; quotesExpired: number; reminders: number } | null>(null);
  const [running, setRunning] = useState(false);
  async function sweep() {
    setRunning(true);
    try {
      const r = await api.post<{ rfqsExpired: number; quotesExpired: number; reminders: number }>('/rfqs/admin/expire', {});
      setResult(r);
      toast.show(toast.success('Expiry sweep complete'));
    } finally { setRunning(false); }
  }
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="text-xs uppercase tracking-[0.2em] text-ink-4">Admin · Procurement</div>
      <h1 className="mt-1 text-3xl font-bold">RFQ oversight</h1>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Surface className="p-5"><div className="text-sm text-ink-3">Business RFQs</div><Link to="/orders" className="underline text-sm">Manage via orders →</Link><p className="mt-2 text-sm">RFQs convert into the same purchase-order pipeline; expiry + reminders run hourly via cron.</p></Surface>
        <Surface className="p-5">
          <div className="text-sm text-ink-3">Expiry sweep</div>
          <div className="text-2xl font-bold">{result ? `${result.rfqsExpired} rfqs · ${result.quotesExpired} quotes · ${result.reminders} reminders` : '—'}</div>
          <div className="mt-2"><Button disabled={running} onClick={() => void sweep()}>{running ? 'Running…' : 'Run sweep now'}</Button></div>
        </Surface>
        <Surface className="p-5"><div className="text-sm text-ink-3">Thresholds</div><AdminThresholds /></Surface>
      </div>
    </div>
  );
}

function AdminThresholds() {
  const { data } = useQuery({ queryKey: ['rfq-thresholds'], queryFn: () => api.get<{ valueThresholdCents: number; quantityThreshold: number }>('/rfqs/thresholds') });
  if (!data) return <div className="text-sm">Loading…</div>;
  return <div className="text-sm">Bulk-quote at Rs. {(data.valueThresholdCents / 100).toLocaleString()} or {data.quantityThreshold}+ units. <span className="text-ink-4">(Editable via platform settings PATCH.)</span></div>;
}
