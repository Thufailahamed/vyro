import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Filter, History } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, humanize, timeAgo } from '@/lib/format';
import { Card, EmptyState, ErrorState, Field, IconTile, Input, ListCard, ListRow, Screen, SkeletonList, Text } from '@/ui';
import { LoadMore } from '@/features/admin/ops/kit';
import { Appear, CodeBlock } from '@/features/admin/platform/kit';

interface AuditEntry {
  id: string;
  actorId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: number;
}

/** Mirrors web AdminActivityPage (GET /admin/audit). */
export function ActivityScreen() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const applied = { action: action.trim() || undefined, targetType: targetType.trim() || undefined };

  const q = useInfiniteQuery({
    queryKey: ['admin-audit', applied.action ?? '', applied.targetType ?? ''],
    queryFn: ({ pageParam }) =>
      api.get<{ entries: AuditEntry[]; nextCursor: string | null }>(
        '/admin/audit' + qs({ action: applied.action, targetType: applied.targetType, cursor: (pageParam as string | undefined) ?? undefined }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = (q.data?.pages ?? []).flatMap((p) => p.entries ?? []);

  return (
    <Screen back kicker="Governance" title="Activity" subtitle="Every signed admin action, newest first." onRefresh={() => q.refetch()}>
      <Card kind="flat" padding={16} style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconTile icon={Filter} tone="paper" size={30} />
          <Text variant="overline" color="ink4">
            Filter the trail
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Action" style={{ flex: 1 }}>
            <Input value={action} onChangeText={setAction} placeholder="order.override" autoCapitalize="none" />
          </Field>
          <Field label="Target" style={{ flex: 1 }}>
            <Input value={targetType} onChangeText={setTargetType} placeholder="purchase_order" autoCapitalize="none" />
          </Field>
        </View>
      </Card>
      {q.isLoading ? (
        <SkeletonList rows={6} height={84} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={History} title="No audit entries" message="Try clearing the filters." />
      ) : (
        <View style={{ gap: 10 }}>
          <Appear>
            <ListCard>
              {rows.map((e, i) => (
                <ListRow
                  key={e.id}
                  title={humanize(e.action)}
                  subtitle={`${e.actorEmail ?? e.actorId.slice(0, 8)} · ${humanize(e.targetType)} ${e.targetId.slice(0, 8)}`}
                  meta={formatDateTime(e.createdAt)}
                  icon={History}
                  iconTone={i % 3 === 0 ? 'ink' : 'paper'}
                  trailing={
                    <Text variant="caption" color="ink5">
                      {timeAgo(e.createdAt)}
                    </Text>
                  }
                  last={i === rows.length - 1}
                />
              ))}
            </ListCard>
          </Appear>
          <LoadMore
            hasMore={!!q.hasNextPage}
            loading={q.isFetchingNextPage}
            onPress={() => q.fetchNextPage()}
          />
          {q.isFetchingNextPage ? <ActivityIndicator color={colors.ink} /> : null}
        </View>
      )}
      {rows.length > 0 ? (
        <CodeBlock value={{ showing: rows.length, filters: applied }} maxLines={6} />
      ) : null}
    </Screen>
  );
}
