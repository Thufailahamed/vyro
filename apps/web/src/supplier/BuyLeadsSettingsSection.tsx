import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@vyro/ui';
import type { BuyLeadsSubscription } from '@vyro/validation';
import { SparklesIcon } from '@/components/icons';

interface Category {
  id: string;
  slug: string;
  name: string;
  active: boolean;
}

export function BuyLeadsSettingsSection({ supplierId }: { supplierId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const sub = useQuery({
    queryKey: ['supplier', supplierId, 'buyleads-sub'],
    queryFn: () => api.get<BuyLeadsSubscription>(`/supplier/buyleads/subs?supplierId=${supplierId}`),
    retry: false,
  });
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: Category[] }>('/categories'),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const [draft, setDraft] = useState<BuyLeadsSubscription | null>(null);
  const value = draft ?? sub.data ?? { enabled: false, categoryIds: [] };

  const save = useMutation({
    mutationFn: (next: BuyLeadsSubscription) =>
      api.put<BuyLeadsSubscription>(`/supplier/buyleads/subs?supplierId=${supplierId}`, next),
    onSuccess: (data) => {
      qc.setQueryData(['supplier', supplierId, 'buyleads-sub'], data);
      setDraft(null);
      toast.success('BuyLeads preferences saved');
    },
    onError: () => toast.error('Could not save BuyLeads preferences'),
  });

  function toggle(id: string) {
    const set = new Set(value.categoryIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setDraft({ ...value, categoryIds: Array.from(set) });
  }

  if (sub.isError) {
    return (
      <div className="text-sm text-ink-3">
        BuyLeads is not enabled on your platform yet. Ask an admin to flip the feature flag.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => setDraft({ ...value, enabled: e.target.checked })}
        />
        <span>Send me a daily email digest of new RFQs matching my categories</span>
      </label>

      <div>
        <div className="text-sm font-semibold mb-2">Subscribed categories</div>
        {cats.isLoading ? (
          <div className="text-xs text-ink-4">Loading categories…</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(cats.data?.categories ?? [])
              .filter((c) => c.active)
              .map((c) => {
                const checked = value.categoryIds.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} />
                    <span>{c.name}</span>
                  </label>
                );
              })}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={save.isPending || !draft}
        onClick={() => draft && save.mutate(draft)}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper disabled:opacity-50"
      >
        <SparklesIcon size={14} />
        {save.isPending ? 'Saving…' : 'Save preferences'}
      </button>
    </div>
  );
}
