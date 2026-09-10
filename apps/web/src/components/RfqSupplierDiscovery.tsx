import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, ErrorBanner } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

interface Row { supplier: { id: string; name: string; city?: string | null; district?: string | null }; coverage: number; invited: boolean }

const OPEN_STATES = new Set(['draft', 'open', 'quoting', 'quotes_received', 'under_review']);

export function RfqSupplierDiscovery({ rfqId, rfqStatus }: { rfqId: string; rfqStatus: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['rfq-discover', rfqId],
    queryFn: () => api.get<{ suppliers: Row[] }>(`/rfqs/${rfqId}/suppliers/discover`),
    enabled: OPEN_STATES.has(rfqStatus),
  });
  if (!OPEN_STATES.has(rfqStatus)) return null;
  const rows = data?.suppliers ?? [];
  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  async function invite() {
    if (selected.size === 0) return;
    setError(null);
    try {
      await api.post(`/rfqs/${rfqId}/invite`, { supplierIds: [...selected] });
      setSelected(new Set());
      void qc.invalidateQueries({ queryKey: ['rfq-discover', rfqId] });
      toast.show(toast.success(`Invited ${selected.size} supplier(s)`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invite failed');
    }
  }
  return (
    <Surface className="mt-4 p-5">
      <h2 className="font-semibold">Suggested suppliers</h2>
      <p className="mt-1 text-xs text-ink-4">Ranked by product coverage. Pick to invite.</p>
      {error && <div className="mt-2"><ErrorBanner message={error} /></div>}
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.supplier.id} className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={r.invited} checked={r.invited || selected.has(r.supplier.id)} onChange={() => toggle(r.supplier.id)} />
              <span>{r.supplier.name}{r.supplier.district ? ` · ${r.supplier.district}` : ''}</span>
            </label>
            <span className="font-mono text-xs">{Math.round(r.coverage * 100)}%{r.invited ? ' · invited' : ''}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-xs text-ink-4">No suggestions.</li>}
      </ul>
      <div className="mt-3"><Button onClick={() => void invite()} disabled={selected.size === 0}>Invite selected</Button></div>
    </Surface>
  );
}
