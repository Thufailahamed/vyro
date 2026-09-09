import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type WebhookRow = {
  id: string;
  name: string;
  url: string;
  eventTypesJson: string;
  secret: string;
  active: 0 | 1;
  createdBy: string;
  createdAt: number;
};

export type WebhookDeliveryRow = {
  id: string;
  webhookId: string;
  eventType: string;
  payloadJson: string;
  status: 'pending' | 'success' | 'failed';
  responseStatus: number | null;
  responseBody: string | null;
  attemptCount: number;
  nextRetryAt: number | null;
  createdAt: number;
};

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['admin-feature-flags'],
    queryFn: async () =>
      (await api.get<{ section: string; value: Record<string, unknown>; version: number }>(
        '/admin/feature-flags',
      )) as { section: string; value: Record<string, unknown>; version: number },
  });
}

export function useUpdateFeatureFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { value: Record<string, unknown>; expectedVersion: number }) =>
      api.put<{ section: string; version: number; valueJson: string }>(
        '/admin/feature-flags',
        body,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-feature-flags'] }),
  });
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ['admin-email-templates'],
    queryFn: async () =>
      (await api.get<{ section: string; value: Record<string, unknown>; version: number }>(
        '/admin/email-templates',
      )) as { section: string; value: Record<string, unknown>; version: number },
  });
}

export function useUpdateEmailTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { value: Record<string, unknown>; expectedVersion: number }) =>
      api.put<{ section: string; version: number; valueJson: string }>(
        '/admin/email-templates',
        body,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-email-templates'] }),
  });
}

export function useWebhooks() {
  return useQuery({
    queryKey: ['admin-webhooks'],
    queryFn: async () => (await api.get<WebhookRow[]>('/admin/webhooks')) as WebhookRow[],
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      url: string;
      eventTypes: string[];
      secret: string;
    }) => api.post<WebhookRow>('/admin/webhooks', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-webhooks'] }),
  });
}

export function useDisableWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.del<WebhookRow>(`/admin/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; patch: Partial<{ name: string; url: string; eventTypes: string[]; active: boolean }> }) =>
      api.patch<WebhookRow>(`/admin/webhooks/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-webhooks'] }),
  });
}

export function useWebhookDeliveries(webhookId: string | null) {
  return useQuery({
    queryKey: ['admin-webhook-deliveries', webhookId],
    queryFn: async () => {
      if (!webhookId) return [];
      const list = (await api.get<WebhookDeliveryRow[]>(`/admin/webhooks/${webhookId}/deliveries`)) as WebhookDeliveryRow[];
      return list;
    },
    enabled: webhookId !== null,
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { webhookId: string; deliveryId: string }) =>
      api.post<{ ok: true }>(`/admin/webhooks/${body.webhookId}/retry/${body.deliveryId}`, {}),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['admin-webhook-deliveries', vars.webhookId] }),
  });
}
