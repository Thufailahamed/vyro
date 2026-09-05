import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type HealthSnapshot = {
  dbLatencyMs: number;
  pendingWebhookDeliveries: number;
  failedWebhookDeliveries24h: number;
  openAbuseReports: number;
  pendingKyc: number;
  pendingRefunds: number;
  recentErrors: Array<{ action: string; createdAt: number; status: string | null }>;
  capturedAt: number;
};

export type CronJobInfo = {
  name: string;
  schedule: string;
  description: string;
};

export function useHealthSnapshot() {
  return useQuery({
    queryKey: ['admin-health'],
    queryFn: async () =>
      (await api.get<HealthSnapshot>('/admin/health/dashboard')) as HealthSnapshot,
    refetchInterval: 30000,
  });
}

export function useCronJobs() {
  return useQuery({
    queryKey: ['admin-cron'],
    queryFn: async () =>
      (await api.get<{ jobs: CronJobInfo[] }>('/admin/cron')) as { jobs: CronJobInfo[] },
  });
}

export function useTriggerCron() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      api.post<{ ok: true; name: string }>('/admin/cron/trigger', { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-cron'] });
      qc.invalidateQueries({ queryKey: ['admin-health'] });
    },
  });
}
