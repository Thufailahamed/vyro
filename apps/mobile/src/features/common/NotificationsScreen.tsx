import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  FileText,
  Package,
  Settings2,
  ShoppingBag,
  Sparkles,
  Truck,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Badge,
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
  SwipeableRow,
  Text,
  Touchable,
  IconButton,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humanize, timeAgo } from '@/lib/format';
import { colors, radii, shadow } from '@/theme/tokens';
import { go } from '../buyer/orders/kit';

type Severity = 'info' | 'warning' | 'critical';
interface Note {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
  type: string;
  source?: 'system' | 'ai' | 'admin' | null;
  sourceRef?: string | null;
  severity?: Severity;
}

type Page = { notifications: Note[]; unreadCount: number; nextCursor: number | null };

type Tab = 'all' | 'unread' | 'order' | 'delivery' | 'payment' | 'ai' | 'system';
const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'order', label: 'Orders' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'payment', label: 'Payments' },
  { value: 'ai', label: 'AI' },
  { value: 'system', label: 'System' },
];

function iconFor(n: Note): {
  Icon: LucideIcon;
  tone: 'ink' | 'volt' | 'copper' | 'paper' | 'danger' | 'success' | 'warning';
} {
  if (n.severity === 'critical') return { Icon: AlertCircle, tone: 'danger' };
  if (n.severity === 'warning') return { Icon: Activity, tone: 'warning' };
  const t = n.type.toLowerCase();
  if (t.includes('observability') || t.includes('sweep') || n.source === 'system')
    return { Icon: Activity, tone: 'warning' };
  if (t.includes('order') || t.includes('po') || t.includes('purchase'))
    return { Icon: ShoppingBag, tone: 'ink' };
  if (t.includes('delivery') || t.includes('dispatch') || t.includes('truck') || t.includes('freight'))
    return { Icon: Truck, tone: 'copper' };
  if (t.includes('invoice') || t.includes('payment') || t.includes('paid') || t.includes('credit') || t.includes('refund'))
    return { Icon: FileText, tone: 'success' };
  if (t.includes('dispute') || t.includes('alert') || t.includes('security') || t.includes('suspend'))
    return { Icon: AlertCircle, tone: 'danger' };
  if (n.source === 'ai') return { Icon: Sparkles, tone: 'volt' };
  return { Icon: Package, tone: n.readAt ? 'paper' : 'ink' };
}

function matches(tab: Tab, n: Note) {
  const t = n.type.toLowerCase();
  switch (tab) {
    case 'order':
      return t.includes('order') || t.includes('purchase');
    case 'delivery':
      return t.includes('delivery') || t.includes('dispatch') || t.includes('truck');
    case 'payment':
      return t.includes('payment') || t.includes('invoice') || t.includes('credit') || t.includes('refund');
    default:
      return true;
  }
}

/** Slug-style titles ("sweep.stale", "order.auto_cancelled") read better humanized. */
function displayTitle(n: Note): string {
  return /^[a-z0-9._-]+$/.test(n.title) ? humanize(n.title.replaceAll('.', ' ')) : n.title;
}

/** Collapse consecutive identical alerts (type+title+link) into one row. */
function group(list: Note[]): { key: string; items: Note[] }[] {
  const out: { key: string; items: Note[] }[] = [];
  for (const n of list) {
    const key = `${n.type}|${n.title}|${n.link ?? ''}`;
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(n);
    else out.push({ key, items: [n] });
  }
  return out;
}

/** Shared notification inbox — port of the web NotificationsPage. */
export function NotificationsScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('all');

  const serverTab = tab === 'unread' || tab === 'ai' || tab === 'system' ? tab : 'all';
  const q = useInfiniteQuery<Page>({
    queryKey: ['notifications', serverTab],
    queryFn: ({ pageParam }) =>
      api.get<Page>(
        '/notifications/me' +
          qs({
            limit: 50,
            unread: serverTab === 'unread' ? 1 : undefined,
            source: serverTab === 'ai' ? 'ai' : serverTab === 'system' ? 'system' : undefined,
            before: pageParam as number | undefined,
          }),
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const mark = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.post(`/notifications/${id}/read`))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/me/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const flat = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.notifications), [q.data]);
  const groups = useMemo(() => group(flat.filter((n) => matches(tab, n))), [flat, tab]);
  const unread = q.data?.pages[0]?.unreadCount ?? 0;

  return (
    <ListScreen
      data={groups}
      keyExtractor={(g) => g.items[0]!.id}
      onRefresh={() => q.refetch()}
      onEndReached={() => {
        if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      header={
        <ListHeader>
          <ScreenHeader
            back
            kicker="Inbox"
            title="Notifications"
            subtitle={unread ? `${unread} unread` : 'All caught up'}
            right={<IconButton icon={Settings2} variant="surface" accessibilityLabel="Notification settings" onPress={() => go('/settings')} />}
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
              onChange={setTab}
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
      renderItem={({ item: g }) => {
        const n = g.items[0]!;
        const { Icon, tone } = iconFor(n);
        const count = g.items.length;
        const isUnread = g.items.some((x) => !x.readAt);
        return (
          <SwipeableRow
            enabled={isUnread}
            left={
              isUnread
                ? [
                    {
                      label: count > 1 ? `Read ×${count}` : 'Read',
                      icon: Check,
                      tone: 'mint',
                      run: () => mark.mutate(g.items.filter((x) => !x.readAt).map((x) => x.id)),
                    },
                  ]
                : undefined
            }
          >
          <Touchable
            onPress={() => {
              const unreadIds = g.items.filter((x) => !x.readAt).map((x) => x.id);
              if (unreadIds.length) mark.mutate(unreadIds);
              if (n.link) go(n.link);
            }}
            hapticOnPress
            scaleTo={0.98}
            accessibilityLabel={displayTitle(n)}
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
                    {displayTitle(n)}
                  </Text>
                  {count > 1 ? <Badge label={`×${count}`} tone="ink" size="sm" /> : null}
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
          </SwipeableRow>
        );
      }}
      ListFooterComponent={
        q.isFetchingNextPage ? (
          <SkeletonList rows={2} height={72} />
        ) : q.hasNextPage && flat.length > 0 && groups.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 6 }}>
            <PillAction label="Load more to see this type" onPress={() => void q.fetchNextPage()} />
          </View>
        ) : null
      }
    />
  );
}
