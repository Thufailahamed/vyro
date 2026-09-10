import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';

export interface RfqItem { description: string; quantity: string; unit: string; targetPrice: string; specifications: string; productId?: string }
interface Template { id: string; name: string; description?: string; recurrenceRule?: string | null }

export function RfqTemplatesPanel({ onLoadItems }: { onLoadItems: (items: RfqItem[]) => void }) {
  const { user } = useAuth();
  const businessId = (user as { memberships?: Array<{ businessId: string }> })?.memberships?.[0]?.businessId;
  const toast = useToast();
  const [saveName, setSaveName] = useState('');
  const [saveRecurrence, setSaveRecurrence] = useState<'none' | 'monthly' | 'custom'>('none');
  const [saveCustom, setSaveCustom] = useState('');
  const { data, refetch } = useQuery({
    queryKey: ['rfq-templates', businessId],
    queryFn: () => api.get<{ templates: Template[] }>(`/rfqs/templates/list?businessId=${businessId}`),
    enabled: !!businessId,
  });

  async function load(id: string) {
    const res = await api.get<{ items: Array<{ description: string; quantity: number; unit: string; targetPriceCents?: number; specifications?: string; productId?: string }> }>(`/rfqs/templates/${id}`);
    onLoadItems(res.items.map((i) => ({
      description: i.description,
      quantity: String(i.quantity),
      unit: i.unit,
      targetPrice: i.targetPriceCents ? String(i.targetPriceCents / 100) : '',
      specifications: i.specifications ?? '',
      ...(i.productId ? { productId: i.productId } : {}),
    })));
    toast.show(toast.success('Template loaded'));
  }

  async function save() {
    if (!saveName.trim() || !businessId) return;
    await api.post('/rfqs/templates', {
      businessId,
      name: saveName,
      recurrenceRule: saveRecurrence === 'custom' ? saveCustom : saveRecurrence === 'none' ? undefined : saveRecurrence,
    });
    setSaveName('');
    void refetch();
    toast.show(toast.success('Template saved'));
  }

  async function createNext(id: string) {
    await api.post(`/rfqs/templates/${id}/create`, {});
    toast.show(toast.success('New RFQ created from template'));
  }

  return (
    <Surface className="mt-4 p-5">
      <details>
        <summary className="cursor-pointer text-sm font-medium">Templates</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs uppercase tracking-widest text-ink-4">Load</h3>
            <ul className="mt-2 space-y-1">
              {(data?.templates ?? []).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{t.name}{t.recurrenceRule ? ` · ${t.recurrenceRule}` : ''}</span>
                  <span className="flex gap-2">
                    <button onClick={() => void load(t.id)} className="min-h-[44px] rounded-lg border border-line px-2 py-1 text-xs">Load</button>
                    <button onClick={() => void createNext(t.id)} className="min-h-[44px] rounded-lg border border-line px-2 py-1 text-xs">Create next</button>
                  </span>
                </li>
              ))}
              {(data?.templates ?? []).length === 0 && <li className="text-xs text-ink-4">No templates yet.</li>}
            </ul>
          </div>
          <div>
            <h3 className="text-xs uppercase tracking-widest text-ink-4">Save current as template</h3>
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Template name" className="mt-2 w-full rounded-lg border border-line px-2 py-1 text-sm" />
            <select value={saveRecurrence} onChange={(e) => setSaveRecurrence(e.target.value as 'none' | 'monthly' | 'custom')} className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-sm">
              <option value="none">No recurrence</option>
              <option value="monthly">Monthly</option>
              <option value="custom">Custom cron</option>
            </select>
            {saveRecurrence === 'custom' && <input value={saveCustom} onChange={(e) => setSaveCustom(e.target.value)} placeholder="cron expr" className="mt-1 w-full rounded-lg border border-line px-2 py-1 text-sm" />}
            <Button onClick={() => void save()} className="mt-2 w-full">Save</Button>
          </div>
        </div>
      </details>
    </Surface>
  );
}
