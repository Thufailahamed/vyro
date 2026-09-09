import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type QueueName = 'audit' | 'notifications' | 'invoices';
export type QueueEventKind = 'retry' | 'dlq' | 'manual';

export type QueueHealth = {
  queue: QueueName;
  backlog: number;
  ackLast1h: number;
  errLast1h: number;
  p50Ms: number;
  p95Ms: number;
};

export type QueueEvent = {
  id: string;
  queue: QueueName;
  msgId: string;
  event: QueueEventKind;
  actorUserId: string | null;
  error: string | null;
  createdAt: number;
};

export type ThroughputPoint = { ts: number; queue: QueueName; acks: number };

export function useQueueHealth() {
  return useQuery({
    queryKey: ['admin', 'queues', 'health'],
    queryFn: async () => {
      const j = await api.get<{ queues: QueueHealth[] }>('/admin/queues/health');
      return j.queues;
    },
    refetchInterval: 30_000,
  });
}

export function useQueueEvents() {
  return useQuery({
    queryKey: ['admin', 'queues', 'events'],
    queryFn: async () => {
      const j = await api.get<{ events: QueueEvent[] }>('/admin/queues/events?limit=50');
      return j.events;
    },
  });
}

export function useQueueThroughput() {
  return useQuery({
    queryKey: ['admin', 'queues', 'throughput'],
    queryFn: async () => {
      const j = await api.get<{ points: ThroughputPoint[] }>('/admin/queues/throughput');
      return j.points ?? [];
    },
  });
}

export function useRetryQueueEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, editedPayload }: { id: string; editedPayload?: unknown }) =>
      api.post<{ ok: true; newMsgId: string }>(`/admin/queues/retry/${id}`, { editedPayload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queues'] }),
  });
}

export function useRetryBulkQueueEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventIds, editedPayload }: { eventIds: string[]; editedPayload?: unknown }) =>
      api.post<{ ok: true; replayed: number; failed: string[] }>('/admin/queues/retry-bulk', { eventIds, editedPayload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queues'] }),
  });
}

export function useManualEnqueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ queue, payload }: { queue: QueueName; payload: unknown }) =>
      api.post<{ ok: true; msgId: string; eventId: string }>('/admin/queues/enqueue', { queue, payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'queues'] }),
  });
}