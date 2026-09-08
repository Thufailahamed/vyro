import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, EmptyState, ErrorBanner } from '@/components/ui';
import { PreferencesList, type PrefRow } from '@/ai/preferences';

export function AiPreferencesPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-prefs'],
    queryFn: () => api.get<{ preferences: PrefRow[] }>('/ai/preferences'),
  });

  const promote = useMutation({
    mutationFn: (p: PrefRow) => api.post('/ai/preferences/promote', { kind: p.kind, key: p.key }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prefs'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.post(`/ai/preferences/${id}/delete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prefs'] }),
  });

  const rows = data?.preferences ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        kicker="AI Memory"
        title="What VYRO has learned about your buying"
        sub="Preferences VYRO has inferred from your orders. Promote one to a permanent rule, or remove it."
      />
      {error && <ErrorBanner message={(error as ApiError).message} />}
      {isLoading ? (
        <div className="h-32 bg-mist animate-pulse" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing inferred yet" description="Place a few orders and VYRO will start noticing patterns." />
      ) : (
        <PreferencesList
          rows={rows}
          onPromote={(p) => promote.mutate(p)}
          onRemove={(p) => {
            if (confirm(`Remove preference "${p.key}"?`)) remove.mutate(p.id);
          }}
          promoting={promote.isPending}
        />
      )}
    </div>
  );
}
