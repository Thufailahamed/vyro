import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { OPEN_RETURN_STATUSES, type OrderReturn } from '@/lib/orderLifecycle';
import { ChipRow, EmptyState, ErrorState, Screen, SkeletonList, Touchable } from '@/ui';
import { ReturnCard } from './orderLifecycle';

type Filter = 'open' | 'all';

/**
 * Returns (RMAs) for the active buyer business or supplier:
 * GET /returns?businessId=… | ?supplierId=…. Tapping a card opens its order.
 */
export function ReturnsListScreen({
  scope,
  scopeId,
  queryKey,
  orderHref,
  kicker,
  subtitle,
  renderActions,
}: {
  scope: 'businessId' | 'supplierId';
  scopeId: string | undefined;
  queryKey: readonly unknown[];
  orderHref: (poId: string) => string;
  kicker: string;
  subtitle: string;
  renderActions?: (r: OrderReturn) => ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const q = useQuery({
    queryKey,
    queryFn: () => api.get<{ returns: OrderReturn[] }>('/returns' + qs({ [scope]: scopeId })),
    enabled: !!scopeId,
  });
  const all = useMemo(() => q.data?.returns ?? [], [q.data]);
  const openCount = all.filter((r) => OPEN_RETURN_STATUSES.includes(r.status)).length;
  const shown = filter === 'open' ? all.filter((r) => OPEN_RETURN_STATUSES.includes(r.status)) : all;

  return (
    <Screen back kicker={kicker} title="Returns" subtitle={subtitle} onRefresh={() => q.refetch()}>
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
      {q.isLoading || !scopeId ? (
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
          {shown.map((r) => {
            const actions = renderActions?.(r);
            return (
              <Touchable key={r.id} onPress={() => router.push(orderHref(r.purchaseOrderId) as never)} scaleTo={0.99}>
                <ReturnCard ret={r} showPo actions={actions || undefined} />
              </Touchable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
