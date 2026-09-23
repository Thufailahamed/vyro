import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCheck, Info, Megaphone, Send, XCircle } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Field,
  Gutter,
  IconButton,
  Input,
  ListHeader,
  ListScreen,
  ScreenHeader,
  Select,
  Sheet,
  SkeletonList,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { colors } from '@/theme/tokens';
import { go } from '../../buyer/orders/kit';

type Severity = 'info' | 'warning' | 'critical';
interface AdminNote {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: number | null;
  severity: Severity;
  sourceRef: string | null;
  createdAt: number;
}

const SEV_ICON: Record<Severity, { Icon: typeof Info; color: string }> = {
  info: { Icon: Info, color: colors.ink4 },
  warning: { Icon: AlertTriangle, color: colors.amber },
  critical: { Icon: XCircle, color: colors.rose },
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'warning', label: 'Warnings' },
  { value: 'critical', label: 'Critical' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

/** Admin notification inbox + broadcast composer — condensed port of admin/NotificationsPage. */
export function AdminNotificationsScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [compose, setCompose] = useState(false);

  const severityParam = filter === 'warning' || filter === 'critical' ? filter : undefined;
  const q = useQuery({
    queryKey: ['admin', 'notifications', filter],
    queryFn: () =>
      api.get<{ notifications: AdminNote[]; nextCursor: string | null; unreadCount: number }>(
        '/admin/notifications' + qs({ severity: severityParam, unreadOnly: filter === 'unread' ? true : undefined }),
      ),
    refetchInterval: 30_000,
  });

  const list = useMemo(() => q.data?.notifications ?? [], [q.data]);
  const unread = q.data?.unreadCount ?? 0;

  const dismiss = useMutation({
    mutationFn: (id: string) => api.post(`/admin/notifications/${encodeURIComponent(id)}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/admin/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'notifications'] }),
  });

  return (
    <>
      <ListScreen
        data={list}
        keyExtractor={(n) => n.id}
        onRefresh={() => q.refetch()}
        header={
          <ListHeader>
            <ScreenHeader
              back
              kicker="Operations"
              title="Admin inbox"
              subtitle={unread ? `${unread} unread` : 'All caught up'}
              right={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {unread ? <IconButton icon={CheckCheck} variant="surface" accessibilityLabel="Mark all read" onPress={() => markAll.mutate()} /> : null}
                  <IconButton icon={Megaphone} variant="ink" accessibilityLabel="Broadcast" onPress={() => setCompose(true)} />
                </View>
              }
            />
            <Gutter>
              <ChipRow options={[...FILTERS]} value={filter} onChange={setFilter} />
            </Gutter>
          </ListHeader>
        }
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonList rows={5} height={76} />
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState icon={CheckCheck} title="Inbox clear" message="Platform alerts and escalations will land here." />
          )
        }
        renderItem={({ item: n }) => {
          const { Icon, color } = SEV_ICON[n.severity] ?? SEV_ICON.info;
          return (
            <Card padding={14} style={{ gap: 6, opacity: n.readAt ? 0.7 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon size={15} color={color} />
                <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                  {n.title}
                </Text>
                {!n.readAt ? (
                  <IconButton icon={CheckCheck} variant="ghost" size={32} accessibilityLabel="Mark read" onPress={() => dismiss.mutate(n.id)} />
                ) : null}
              </View>
              <Text variant="caption" color="ink3">
                {n.body}
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="caption" color="ink5">
                  {timeAgo(n.createdAt)}
                  {n.sourceRef ? ` · ${n.sourceRef}` : ''}
                </Text>
                {n.link ? (
                  <Button title="Open" variant="ghost" size="sm" onPress={() => go(n.link!)} />
                ) : null}
              </View>
            </Card>
          );
        }}
      />
      <BroadcastSheet visible={compose} onClose={() => setCompose(false)} toast={toast} />
    </>
  );
}

function BroadcastSheet({ visible, onClose, toast }: { visible: boolean; onClose: () => void; toast: ReturnType<typeof useToast> }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<'buyer' | 'supplier' | 'all'>('all');
  const [severity, setSeverity] = useState<Severity>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');

  const send = useMutation({
    mutationFn: () =>
      api.post<{ recipients: number }>('/admin/notifications', {
        role,
        severity,
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
      }),
    onSuccess: (r) => {
      toast.success(`Broadcast sent to ${r.recipients} user${r.recipients === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['admin', 'notifications'] });
      onClose();
      setTitle('');
      setBody('');
      setLink('');
    },
    onError: (e) => toast.error('Broadcast failed', errorMessage(e)),
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Broadcast notification"
      subtitle="Sends to every active user in the selected audience."
      footer={
        <Button title={send.isPending ? 'Sending…' : 'Send broadcast'} icon={Send} variant="volt" full loading={send.isPending} disabled={!title.trim() || !body.trim()} onPress={() => send.mutate()} />
      }
    >
      <View style={{ gap: 14 }}>
        <Field label="Audience">
          <ChipRow
            options={[
              { value: 'all' as const, label: 'Everyone' },
              { value: 'buyer' as const, label: 'Buyers' },
              { value: 'supplier' as const, label: 'Suppliers' },
            ]}
            value={role}
            onChange={setRole}
          />
        </Field>
        <Field label="Severity">
          <Select<Severity>
            value={severity}
            options={[
              { value: 'info', label: 'Info' },
              { value: 'warning', label: 'Warning' },
              { value: 'critical', label: 'Critical' },
            ]}
            onChange={setSeverity}
            title="Severity"
          />
        </Field>
        <Field label="Title" required>
          <Input value={title} onChangeText={setTitle} placeholder="e.g. Scheduled maintenance Sunday" />
        </Field>
        <Field label="Message" required>
          <Input value={body} onChangeText={setBody} placeholder="What should users know?" multiline numberOfLines={4} style={{ minHeight: 88, textAlignVertical: 'top' }} />
        </Field>
        <Field label="Link (optional)">
          <Input value={link} onChangeText={setLink} placeholder="/buyer/orders" autoCapitalize="none" />
        </Field>
        {severity === 'critical' ? <Banner tone="warning" message="Critical alerts pin to the top of user inboxes." /> : null}
      </View>
    </Sheet>
  );
}
