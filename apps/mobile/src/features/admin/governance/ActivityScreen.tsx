import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Download, Filter, History, Trash2 } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, humanize, timeAgo } from '@/lib/format';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  Input,
  ListCard,
  ListRow,
  Screen,
  SkeletonList,
  Text,
  useToast,
} from '@/ui';
import { LoadMore } from '@/features/admin/ops/kit';
import { Appear, CodeBlock } from '@/features/admin/platform/kit';
import { usePermission } from '@/features/admin/common/permissions';
import { ExportButton } from '@/features/admin/money/accounts/shared';

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

interface ExportSchedule {
  id: string;
  requestedBy: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  format: 'csv' | 'json';
  nextRunAt: number | null;
  cancelledAt: number | null;
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
  const canExport = usePermission('audit:export');
  const csvPath = '/admin/audit/export' + qs({ action: applied.action, targetType: applied.targetType, limit: 1000 });

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
        {canExport ? (
          <ExportButton title="Export CSV" icon={Download} path={csvPath} fileName="audit.csv" full />
        ) : null}
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
      {canExport ? <ExportSchedulesSection /> : null}
    </Screen>
  );
}

/** Mirrors the web AdminActivityPage scheduled-exports block (/admin/audit/exports). */
function ExportSchedulesSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');

  const q = useQuery({
    queryKey: ['admin-audit-exports'],
    queryFn: () => api.get<{ schedules: ExportSchedule[] }>('/admin/audit/exports'),
  });
  const schedules = (q.data?.schedules ?? []).filter((s) => !s.cancelledAt);

  const create = useMutation({
    mutationFn: () => api.post('/admin/audit/exports', { email: email.trim(), frequency, format }),
    onSuccess: () => {
      toast.success('Schedule created', `Recurring ${frequency} ${format.toUpperCase()} export to ${email.trim()}.`);
      setEmail('');
      void qc.invalidateQueries({ queryKey: ['admin-audit-exports'] });
    },
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.del(`/admin/audit/exports/${id}`),
    onSuccess: () => {
      toast.success('Schedule cancelled');
      void qc.invalidateQueries({ queryKey: ['admin-audit-exports'] });
    },
    onError: (e) => toast.error('Cancel failed', errorMessage(e)),
  });

  return (
    <Card kind="flat" padding={16} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconTile icon={CalendarClock} tone="paper" size={30} />
        <View style={{ flex: 1 }}>
          <Text variant="overline" color="ink4">
            Scheduled exports
          </Text>
          <Text variant="caption" color="ink5">
            Recurring audit exports delivered by email.
          </Text>
        </View>
      </View>
      {q.isLoading ? (
        <SkeletonList rows={2} height={54} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : schedules.length === 0 ? (
        <Text variant="caption" color="ink5">
          No active schedules.
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {schedules.map((s) => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: colors.pearl,
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                  {s.email}
                </Text>
                <Text variant="caption" color="ink5" numberOfLines={1}>
                  {humanize(s.frequency)} · {s.format.toUpperCase()}
                  {s.nextRunAt ? ` · next ${formatDateTime(s.nextRunAt)}` : ''}
                </Text>
              </View>
              <Button
                title="Cancel"
                size="sm"
                variant="ghost"
                icon={Trash2}
                loading={cancel.isPending && cancel.variables === s.id}
                onPress={() => cancel.mutate(s.id)}
              />
            </View>
          ))}
        </View>
      )}
      <Field label="Delivery email" required>
        <Input value={email} onChangeText={setEmail} placeholder="ops@vyro.app" keyboardType="email-address" autoCapitalize="none" />
      </Field>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Frequency" style={{ flex: 1 }}>
          <ChipRow<'daily' | 'weekly' | 'monthly'>
            value={frequency}
            onChange={setFrequency}
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        </Field>
      </View>
      <Field label="Format">
        <ChipRow<'csv' | 'json'>
          value={format}
          onChange={setFormat}
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'json', label: 'JSON' },
          ]}
        />
      </Field>
      <Button
        title="Schedule export"
        variant="volt"
        full
        loading={create.isPending}
        disabled={!email.trim()}
        onPress={() => create.mutate()}
      />
    </Card>
  );
}
