import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { usePermission } from '@/features/admin/common/permissions';
import type { ConfigSection, WebhookDeliveryRow, WebhookRow } from './types';

export const platformKeys = {
  flags: ['admin-feature-flags'] as const,
  templates: ['admin-email-templates'] as const,
  webhooks: ['admin-webhooks'] as const,
  deliveries: (id: string | null) => ['admin-webhook-deliveries', id] as const,
};

export function useFeatureFlags() {
  const can = usePermission('feature_flag:read');
  return useQuery({
    queryKey: platformKeys.flags,
    queryFn: () => api.get<ConfigSection>('/admin/feature-flags'),
    enabled: can,
  });
}

export function useUpdateFeatureFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { value: Record<string, unknown>; expectedVersion: number }) =>
      api.put<{ section: string; version: number; valueJson: string }>('/admin/feature-flags', body),
    onSettled: () => qc.invalidateQueries({ queryKey: platformKeys.flags }),
  });
}

export function useEmailTemplates() {
  const can = usePermission('email_template:read');
  return useQuery({
    queryKey: platformKeys.templates,
    queryFn: () => api.get<ConfigSection>('/admin/email-templates'),
    enabled: can,
  });
}

export function useUpdateEmailTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { value: Record<string, unknown>; expectedVersion: number }) =>
      api.put<{ section: string; version: number; valueJson: string }>('/admin/email-templates', body),
    onSettled: () => qc.invalidateQueries({ queryKey: platformKeys.templates }),
  });
}

export function useWebhooks() {
  const can = usePermission('webhook:read');
  return useQuery({
    queryKey: platformKeys.webhooks,
    queryFn: async () => (await api.get<WebhookRow[]>('/admin/webhooks')) ?? [],
    enabled: can,
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; url: string; eventTypes: string[]; secret: string }) => api.post<WebhookRow>('/admin/webhooks', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeys.webhooks }),
  });
}

export function useDisableWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<WebhookRow>(`/admin/webhooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeys.webhooks }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<{ name: string; url: string; eventTypes: string[]; active: boolean }> }) =>
      api.patch<WebhookRow>(`/admin/webhooks/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformKeys.webhooks }),
  });
}

export function useWebhookDeliveries(webhookId: string | null) {
  return useQuery({
    queryKey: platformKeys.deliveries(webhookId),
    queryFn: async () => (webhookId ? ((await api.get<WebhookDeliveryRow[]>(`/admin/webhooks/${webhookId}/deliveries`)) ?? []) : []),
    enabled: webhookId !== null,
  });
}

/**
 * Deliveries for every endpoint (first 12) so the hero can count failures.
 * Shares cache keys with `useWebhookDeliveries`.
 */
export function useAllDeliveries(webhooks: WebhookRow[] | undefined) {
  const list = (webhooks ?? []).slice(0, 12);
  return useQueries({
    queries: list.map((w) => ({
      queryKey: platformKeys.deliveries(w.id),
      queryFn: async () => (await api.get<WebhookDeliveryRow[]>(`/admin/webhooks/${w.id}/deliveries`)) ?? [],
    })),
  });
}

export function useRetryDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { webhookId: string; deliveryId: string }) =>
      api.post<{ ok: true; processed?: number }>(`/admin/webhooks/${body.webhookId}/retry/${body.deliveryId}`, {}),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: platformKeys.deliveries(vars.webhookId) }),
  });
}

/** True when a config write lost the optimistic-concurrency race. */
export function isStaleWrite(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'STALE_WRITE' || e.status === 409);
}
