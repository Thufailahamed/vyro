import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type SloRule = {
  name: string;
  component: string;
  description: string;
  severity: string;
  threshold: number;
  window: string;
  comparator: string;
  enabled: boolean;
  silenced: boolean;
};

export type AlertHistoryRow = {
  id: string;
  title: string;
  body: string | null;
  severity: 'info' | 'warning' | 'critical';
  sourceRef: string | null;
  link: string | null;
  createdAt: number;
};

const keys = {
  rules: ['admin', 'alerts', 'rules'] as const,
  history: ['admin', 'alerts', 'history'] as const,
};

export function useAlertRules() {
  return useQuery({
    queryKey: keys.rules,
    queryFn: async () => (await api.get<{ rules: SloRule[] }>('/admin/observability/alerts/rules')).rules,
  });
}

export function useAlertHistory(limit = 50) {
  return useQuery({
    queryKey: [...keys.history, limit],
    queryFn: async () =>
      (await api.get<{ rows: AlertHistoryRow[] }>(`/admin/observability/alerts/history?limit=${limit}`)).rows,
    refetchInterval: 60_000,
  });
}

export function useSilenceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ruleName: string; durationMinutes: number; reason: string }) =>
      api.post('/admin/observability/alerts/silence', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
  });
}

export function useUnsilenceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleName: string) =>
      api.del(`/admin/observability/alerts/silence/${encodeURIComponent(ruleName)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.rules }),
  });
}
