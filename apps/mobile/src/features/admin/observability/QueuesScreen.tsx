import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListTree, Play, Plus, RotateCcw } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Gutter,
  Input,
  ListHeader,
  ListScreen,
  ScreenHeader,
  Select,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section } from '../../buyer/orders/kit';

type QueueName = 'audit' | 'notifications' | 'invoices';
type QueueHealth = { queue: QueueName; backlog: number; ackLast1h: number; errLast1h: number; p50Ms: number; p95Ms: number };
type QueueEvent = { id: string; queue: QueueName; msgId: string; event: 'retry' | 'dlq' | 'manual'; actorUserId: string | null; error: string | null; createdAt: number };

/** /admin/observability/queues — queue health, dead-letter events, retry, manual enqueue. */
export function QueuesScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const [enqueueOpen, setEnqueueOpen] = useState(false);

  const health = useQuery({
    queryKey: ['admin', 'queues', 'health'],
    queryFn: () => api.get<{ queues: QueueHealth[] }>('/admin/queues/health'),
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ['admin', 'queues', 'events'],
    queryFn: () => api.get<{ events: QueueEvent[] }>('/admin/queues/events?limit=50'),
  });

  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/admin/queues/retry/${id}`, {}),
    onSuccess: () => {
      toast.success('Requeued');
      qc.invalidateQueries({ queryKey: ['admin', 'queues'] });
    },
    onError: (e) => toast.error('Retry failed', errorMessage(e)),
  });

  return (
    <>
      <ListScreen
        data={events.data?.events ?? []}
        keyExtractor={(e) => e.id}
        onRefresh={() => Promise.all([health.refetch(), events.refetch()])}
        header={
          <ListHeader>
            <ScreenHeader
              back
              kicker="Message queues"
              title="Queue health"
              right={<Button title="Enqueue" icon={Plus} variant="secondary" size="sm" onPress={() => setEnqueueOpen(true)} />}
            />
            <Gutter style={{ gap: 14 }}>
              {health.isLoading ? (
                <SkeletonList rows={3} height={80} />
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(health.data?.queues ?? []).map((qh) => (
                    <Card key={qh.queue} padding={12} style={{ flex: 1, gap: 4 }}>
                      <Text variant="overline" color="copper" numberOfLines={1}>
                        {qh.queue}
                      </Text>
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 18, color: qh.backlog > 50 || qh.errLast1h > 0 ? colors.rose : colors.ink }}>{qh.backlog}</Text>
                      <Text variant="caption" color="ink4">
                        backlog
                      </Text>
                      <Text variant="caption" color="ink4">
                        ✓{qh.ackLast1h} ✗{qh.errLast1h} · p95 {qh.p95Ms}ms
                      </Text>
                    </Card>
                  ))}
                </View>
              )}
              <Section kicker="Dead letter & retries" title="Queue events" icon={ListTree}>
                <Text variant="caption" color="ink4">
                  Failed or manually injected messages. Retry re-delivers the same payload.
                </Text>
              </Section>
            </Gutter>
          </ListHeader>
        }
        ListEmptyComponent={
          events.isLoading ? (
            <SkeletonList rows={5} height={70} />
          ) : events.isError ? (
            <ErrorState message={errorMessage(events.error)} onRetry={() => events.refetch()} />
          ) : (
            <EmptyState icon={ListTree} title="No events" message="Dead-letter and retry events will appear here." />
          )
        }
        renderItem={({ item: e }) => (
          <Card padding={14} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusBadge status={e.event} size="sm" />
              <MonoTag label={e.queue} tone="copper" />
              <Text variant="caption" color="ink5" style={{ flex: 1, textAlign: 'right' }}>
                {timeAgo(e.createdAt)}
              </Text>
            </View>
            <Text variant="caption" color="ink3" numberOfLines={2}>
              {e.msgId}
            </Text>
            {e.error ? (
              <Text variant="caption" style={{ color: colors.rose }} numberOfLines={2}>
                {e.error}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Button title="Retry" icon={RotateCcw} variant="secondary" size="sm" loading={retry.isPending && retry.variables === e.id} onPress={() => retry.mutate(e.id)} />
            </View>
          </Card>
        )}
      />
      <EnqueueSheet visible={enqueueOpen} onClose={() => setEnqueueOpen(false)} />
    </>
  );
}

function EnqueueSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [queue, setQueue] = useState<QueueName>('audit');
  const [payload, setPayload] = useState('{}');
  const send = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload || '{}');
      } catch {
        throw new Error('Payload must be valid JSON');
      }
      return api.post('/admin/queues/enqueue', { queue, payload: parsed });
    },
    onSuccess: () => {
      toast.success('Message enqueued');
      qc.invalidateQueries({ queryKey: ['admin', 'queues'] });
      onClose();
    },
    onError: (e) => toast.error('Enqueue failed', errorMessage(e)),
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Manual enqueue"
      subtitle="Inject a message directly into a queue. Use for replays and smoke tests only."
      footer={<Button title="Enqueue message" icon={Play} variant="volt" full loading={send.isPending} onPress={() => send.mutate()} />}
    >
      <View style={{ gap: 14 }}>
        <Banner tone="warning" message="Bypasses normal producers — double-check the payload before sending." />
        <Field label="Queue">
          <Select<QueueName>
            value={queue}
            options={[
              { value: 'audit', label: 'audit' },
              { value: 'notifications', label: 'notifications' },
              { value: 'invoices', label: 'invoices' },
            ]}
            onChange={setQueue}
            title="Queue"
          />
        </Field>
        <Field label="Payload (JSON)">
          <Input value={payload} onChangeText={setPayload} multiline numberOfLines={6} autoCapitalize="none" autoCorrect={false} style={{ minHeight: 120, textAlignVertical: 'top', fontFamily: fonts.mono }} />
        </Field>
      </View>
    </Sheet>
  );
}
