import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, PackageCheck, RotateCcw, X } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { lifecycleErrorMessage, OPEN_RETURN_STATUSES, type OrderReturn } from '@/lib/orderLifecycle';
import { Button, ChipRow, EmptyState, ErrorState, Field, Input, Screen, Sheet, SkeletonList, Touchable, useToast } from '@/ui';
import { ReturnCard } from '@/features/common/orderLifecycle';
import { Appear, go } from '@/features/admin/platform/kit';
import { SwipeableRow, type SwipeAction } from '@/features/admin/ops/kit/components';

type Filter = 'open' | 'all';
type ReturnAction = 'approve' | 'reject' | 'receive';
const ALL_STATUSES = 'requested,approved,rejected,received,refunded,cancelled,closed';

/**
 * /admin/returns — cross-tenant RMA queue (GET /admin/returns).
 * Mirrors web ReturnsQueuePage: open returns hold the supplier's settlement.
 * Swipe a row to approve/reject (requested) or mark received (approved) —
 * admin can act on behalf of the supplier per the return lifecycle rules.
 */
export function AdminReturnsScreen() {
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('open');
  const [rejectTarget, setRejectTarget] = useState<OrderReturn | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const q = useQuery({
    queryKey: ['admin-returns'],
    queryFn: () => api.get<{ returns: OrderReturn[] }>('/admin/returns' + qs({ status: ALL_STATUSES })),
  });
  const all = useMemo(() => q.data?.returns ?? [], [q.data]);
  const openCount = all.filter((r) => OPEN_RETURN_STATUSES.includes(r.status)).length;
  const shown = filter === 'open' ? all.filter((r) => OPEN_RETURN_STATUSES.includes(r.status)) : all;

  const act = useMutation({
    mutationFn: (v: { id: string; action: ReturnAction; body?: Record<string, unknown> }) =>
      api.post(`/returns/${v.id}/${v.action}`, v.body ?? {}),
    onSuccess: (_r, v) => {
      const label = v.action === 'approve' ? 'approved' : v.action === 'reject' ? 'rejected' : 'marked received';
      toast.success(`Return ${label}`);
      qc.invalidateQueries({ queryKey: ['admin-returns'] });
      setRejectTarget(null);
      setRejectReason('');
    },
    onError: (e) => toast.error('Action failed', lifecycleErrorMessage(e)),
  });

  const actionsFor = (r: OrderReturn): { right?: SwipeAction[]; left?: SwipeAction[] } => {
    if (r.status === 'requested') {
      return {
        right: [{ label: 'Approve', icon: Check, tone: 'mint', run: () => act.mutate({ id: r.id, action: 'approve' }) }],
        left: [
          {
            label: 'Reject',
            icon: X,
            tone: 'rose',
            run: () => {
              setRejectReason('');
              setRejectTarget(r);
            },
          },
        ],
      };
    }
    if (r.status === 'approved') {
      return { right: [{ label: 'Received', icon: PackageCheck, tone: 'ink', run: () => act.mutate({ id: r.id, action: 'receive' }) }] };
    }
    return {};
  };

  return (
    <Screen
      back
      kicker="Operations · Returns"
      title="Returns queue"
      subtitle="Return requests (RMAs) across the marketplace. Open returns hold the supplier's settlement."
      onRefresh={() => q.refetch()}
    >
      <View style={{ marginHorizontal: -20 }}>
        <ChipRow<Filter>
          options={[
            { value: 'open', label: 'Open', count: openCount },
            { value: 'all', label: 'All', count: all.length },
          ]}
          value={filter}
          onChange={setFilter}
          style={{ paddingHorizontal: 20 }}
        />
      </View>
      {q.isLoading ? (
        <SkeletonList rows={4} height={130} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title={filter === 'open' ? 'No open returns' : 'No returns yet'}
          message="Returns raised on delivered orders show up here."
        />
      ) : (
        <View style={{ gap: 10 }}>
          {shown.map((r, i) => {
            const { right, left } = actionsFor(r);
            return (
              <Appear key={r.id} i={i % 10}>
                <SwipeableRow right={right} left={left}>
                  <Touchable onPress={() => go(`/admin/order/${r.purchaseOrderId}`)} scaleTo={0.99}>
                    <ReturnCard ret={r} showPo />
                  </Touchable>
                </SwipeableRow>
              </Appear>
            );
          })}
        </View>
      )}

      <Sheet
        visible={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        title="Reject return"
        subtitle={rejectTarget ? `${rejectTarget.rmaNumber} · the buyer is notified` : undefined}
        footer={
          <Button
            title="Reject return"
            variant="danger"
            full
            disabled={!rejectReason.trim()}
            loading={act.isPending}
            onPress={() => rejectTarget && act.mutate({ id: rejectTarget.id, action: 'reject', body: { reason: rejectReason.trim() } })}
          />
        }
      >
        <Field label="Reason" required hint="Recorded on the return and shown to the buyer">
          <Input value={rejectReason} onChangeText={setRejectReason} multiline maxLength={500} placeholder="Photos don't match the claim…" />
        </Field>
      </Sheet>
    </Screen>
  );
}
