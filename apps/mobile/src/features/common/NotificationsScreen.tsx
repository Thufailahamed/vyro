import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronRight,
  FileText,
  Package,
  Sparkles,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  IconTile,
  ListHeader,
  ListScreen,
  PillAction,
  ScreenHeader,
  SkeletonList,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { colors, radii, shadow } from '@/theme/tokens';
import { go } from '../buyer/orders/kit';

interface Note {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
  type: string;
  source?: string | null;
}

type Tab = 'all' | 'unread' | 'order' | 'delivery' | 'payment' | 'ai';
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'order', label: 'Orders' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'payment', label: 'Payments' },
  { value: 'ai', label: 'AI' },
];

function iconFor(n: Note): {
  Icon: LucideIcon;
  tone: 'ink' | 'volt' | 'copper' | 'paper' | 'danger' | 'success';
} {
  const t = n.type.toLowerCase();
  if (
    t.includes('delivery') ||
    t.includes('dispatch') ||
    t.includes('truck') ||
    t.includes('freight')
  )
    return { Icon: Truck, tone: 'copper' };
  if (t.includes('invoice') || t.includes('payment') || t.includes('paid') || t.includes('credit'))
    return { Icon: FileText, tone: 'success' };
  if (
    t.includes('dispute') ||
    t.includes('alert') ||
    t.includes('security') ||
    t.includes('suspend')
  )
    return { Icon: AlertCircle, tone: 'danger' };
  if (n.source === 'ai') return { Icon: Sparkles, tone: 'volt' };
  return { Icon: Package, tone: n.readAt ? 'paper' : 'ink' };
}

function matches(tab: Tab, n: Note) {
  const t = n.type.toLowerCase();
  switch (tab) {
    case 'unread':
      return !n.readAt;
    case 'order':
      return t.includes('order');
    case 'delivery':
      return t.includes('delivery') || t.includes('dispatch') || t.includes('truck');
    case 'payment':
      return t.includes('payment') || t.includes('invoice') || t.includes('credit');
    case 'ai':
      return n.source === 'ai' || t.includes('ai');
    default:
      return true;
  }
}

/** Shared notification inbox — port of the web NotificationsPage. */
export function NotificationsScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');
  const [cursor, setCursor] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ['notifications', tab === 'unread' ? 'unread' : 'all', cursor],
    queryFn: () =>
      api.get<{ notifications: Note[]; unreadCount: number; nextCursor: number | null }>(
        '/notifications/me' +
          qs({ limit: 50, unread: tab === 'unread' ? 1 : undefined, before: cursor ?? undefined }),
      ),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const mark = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/me/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const list = useMemo(
    () => (q.data?.notifications ?? []).filter((n) => matches(tab, n)),
    [q.data, tab],
  );
  const unread = q.data?.unreadCount ?? 0;

  return (
    <ListScreen
      data={list}
      keyExtractor={(n) => n.id}
      onRefresh={() => q.refetch()}
      header={
        <ListHeader>
          <ScreenHeader
            back
            kicker="Inbox"
            title="Notifications"
            subtitle={unread ? `${unread} unread` : 'All caught up'}
          />
          <Gutter style={{ gap: 14 }}>
            {unread ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: colors.volt,
                      ...shadow.volt,
                    }}
                  />
                  <Text variant="bodySm" weight="semibold" color="ink2">
                    {unread} new
                  </Text>
                </View>
                <PillAction
                  label={markAll.isPending ? 'Marking…' : 'Mark all read'}
                  onPress={() => markAll.mutate()}
                />
              </View>
            ) : null}
            <ChipRow
              options={TABS.map((t) =>
                t.value === 'unread' && unread ? { ...t, count: unread } : t,
              )}
              value={tab}
              onChange={(t) => {
                setTab(t);
                setCursor(null);
              }}
            />
          </Gutter>
        </ListHeader>
      }
      ListEmptyComponent={
        q.isLoading ? (
          <SkeletonList rows={5} height={72} />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : (
          <EmptyState
            icon={Package}
            title="Nothing here"
            message={
              tab === 'unread'
                ? 'No unread notifications.'
                : 'Notifications about orders, dispatches and payments will land here.'
            }
          />
        )
      }
      renderItem={({ item: n }) => {
        const { Icon, tone } = iconFor(n);
        const isUnread = !n.readAt;
        return (
          <Touchable
            onPress={() => {
              if (!n.readAt) mark.mutate(n.id);
              if (n.link) go(n.link);
            }}
            hapticOnPress
            scaleTo={0.98}
            accessibilityLabel={n.title}
          >
            <Card
              padding={14}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                backgroundColor: isUnread ? colors.paper : colors.pearl,
              }}
            >
              <IconTile icon={Icon} tone={tone} size={42} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text
                    variant="body"
                    weight={isUnread ? 'semibold' : 'medium'}
                    color={isUnread ? 'ink' : 'ink3'}
                    numberOfLines={1}
                    style={{ flex: 1 }}
                  >
                    {n.title}
                  </Text>
                  <Text variant="caption" color="ink5">
                    {timeAgo(n.createdAt)}
                  </Text>
                </View>
                {n.body ? (
                  <Text variant="bodySm" color={isUnread ? 'ink3' : 'ink4'} numberOfLines={2}>
                    {n.body}
                  </Text>
                ) : null}
                {n.source === 'ai' || n.link ? (
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}
                  >
                    {n.source === 'ai' ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          height: 22,
                          borderRadius: radii.pill,
                          backgroundColor: colors.copperSoft,
                        }}
                      >
                        <Sparkles size={11} color={colors.copperDeep} />
                        <Text
                          variant="caption"
                          weight="semibold"
                          color="copperDeep"
                          style={{ fontSize: 10.5 }}
                        >
                          VYRO AI
                        </Text>
                      </View>
                    ) : null}
                    {n.link ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text variant="caption" weight="semibold" color="ink4">
                          Open
                        </Text>
                        <ChevronRight size={13} color={colors.ink4} />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {isUnread ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: colors.volt,
                    borderWidth: 2,
                    borderColor: colors.paper,
                  }}
                />
              ) : null}
            </Card>
          </Touchable>
        );
      }}
      ListFooterComponent={
        q.data?.nextCursor ? (
          <View style={{ alignItems: 'center', paddingTop: 6 }}>
            <Button
              title="Load earlier"
              variant="secondary"
              size="sm"
              onPress={() => setCursor(q.data!.nextCursor)}
            />
          </View>
        ) : null
      }
    />
  );
}
