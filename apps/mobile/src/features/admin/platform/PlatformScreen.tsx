import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Mail, Plus, Trash2, Webhook } from 'lucide-react-native';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  Gutter,
  IconButton,
  Input,
  Screen,
  ScreenHeader,
  Segmented,
  Sheet,
  SkeletonList,
  StatusBadge,
  Switch,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section } from '../../buyer/orders/kit';

type Tab = 'flags' | 'webhooks' | 'emails';
type WebhookRow = { id: string; name: string; url: string; eventTypes: string[]; active: boolean; createdAt: number };
type WebhookDelivery = { id: string; eventType: string; status: string; attempts: number; createdAt: number };

/** /admin/platform — feature flags, outbound webhooks, email templates. */
export function PlatformScreen() {
  const [tab, setTab] = useState<Tab>('flags');
  return (
    <Screen>
      <ScreenHeader back kicker="Platform control" title="Platform" subtitle="Runtime flags, outbound webhooks and email templates." />
      <Gutter style={{ gap: 14 }}>
        <Segmented<Tab>
          options={[
            { value: 'flags', label: 'Flags' },
            { value: 'webhooks', label: 'Webhooks' },
            { value: 'emails', label: 'Emails' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'flags' ? <JsonConfigSection section="feature-flags" icon={Flag} title="Feature flags" /> : null}
        {tab === 'emails' ? <JsonConfigSection section="email-templates" icon={Mail} title="Email templates" /> : null}
        {tab === 'webhooks' ? <WebhooksSection /> : null}
      </Gutter>
    </Screen>
  );
}

/** JSON config editor shared by feature-flags and email-templates sections. */
function JsonConfigSection({ section, icon, title }: { section: 'feature-flags' | 'email-templates'; icon: typeof Flag; title: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['admin', section],
    queryFn: () => api.get<{ section: string; value: Record<string, unknown>; version: number }>(`/admin/${section}`),
  });
  const save = useMutation({
    mutationFn: (body: { value: Record<string, unknown>; expectedVersion: number }) => api.put(`/admin/${section}`, body),
    onSuccess: () => {
      toast.success(`${title} saved`);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['admin', section] });
    },
    onError: (e) => toast.error('Save failed', errorMessage(e)),
  });

  const current = draft ?? (q.data ? JSON.stringify(q.data.value, null, 2) : '');
  const dirty = draft != null && q.data != null && draft !== JSON.stringify(q.data.value, null, 2);

  return (
    <Section kicker={section} title={title} icon={icon} sub={q.data ? `Version ${q.data.version}` : undefined}>
      {q.isLoading ? <SkeletonList rows={2} height={80} /> : null}
      {q.isError ? <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
      {q.data ? (
        <>
          <Field label="JSON value" hint="Optimistic concurrency — saving fails if the version moved since you loaded.">
            <Input
              value={current}
              onChangeText={setDraft}
              multiline
              numberOfLines={12}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ minHeight: 220, textAlignVertical: 'top', fontFamily: fonts.mono, fontSize: 12 }}
            />
          </Field>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Reset" variant="ghost" size="sm" disabled={!dirty} onPress={() => setDraft(null)} />
            <Button
              title="Save"
              variant="volt"
              size="sm"
              loading={save.isPending}
              disabled={!dirty}
              onPress={() => {
                try {
                  save.mutate({ value: JSON.parse(current), expectedVersion: q.data.version });
                } catch {
                  toast.error('Invalid JSON', 'Fix the document before saving.');
                }
              }}
            />
          </View>
        </>
      ) : null}
    </Section>
  );
}

function WebhooksSection() {
  const toast = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deliveriesFor, setDeliveriesFor] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<WebhookRow | null>(null);

  const webhooks = useQuery({ queryKey: ['admin-webhooks'], queryFn: () => api.get<WebhookRow[]>('/admin/webhooks') });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/admin/webhooks/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-webhooks'] }),
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: (id: string) => api.del(`/admin/webhooks/${id}`),
    onSuccess: () => {
      toast.success('Webhook removed');
      qc.invalidateQueries({ queryKey: ['admin-webhooks'] });
    },
    onError: (e) => toast.error('Remove failed', errorMessage(e)),
  });

  return (
    <Section
      kicker="Outbound"
      title="Webhooks"
      icon={Webhook}
      right={<IconButton icon={Plus} variant="ink" size={32} accessibilityLabel="Add webhook" onPress={() => setCreateOpen(true)} />}
    >
      {webhooks.isLoading ? <SkeletonList rows={3} height={76} /> : null}
      {webhooks.isError ? <ErrorState message={errorMessage(webhooks.error)} onRetry={() => webhooks.refetch()} /> : null}
      {webhooks.data?.length === 0 ? <EmptyState icon={Webhook} title="No webhooks" message="Create one to receive platform events." /> : null}
      {(webhooks.data ?? []).map((w) => (
        <Card key={w.id} kind="bone" padding={12} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {w.name}
            </Text>
            <Switch value={w.active} onValueChange={(v) => toggle.mutate({ id: w.id, active: v })} />
          </View>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {w.url}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {w.eventTypes.map((e) => (
              <MonoTag key={e} label={e} tone="copper" />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Button title="Deliveries" variant="ghost" size="sm" onPress={() => setDeliveriesFor(w.id)} />
            <View style={{ flex: 1 }} />
            <IconButton icon={Trash2} variant="ghost" size={32} color={colors.rose} accessibilityLabel="Delete webhook" onPress={() => setDisableTarget(w)} />
          </View>
        </Card>
      ))}
      <CreateWebhookSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
      <DeliveriesSheet webhookId={deliveriesFor} onClose={() => setDeliveriesFor(null)} />
      <ConfirmSheet
        visible={!!disableTarget}
        onClose={() => setDisableTarget(null)}
        onConfirm={() => disableTarget && disable.mutate(disableTarget.id)}
        title="Delete webhook?"
        message={`${disableTarget?.name ?? ''} will stop receiving events immediately.`}
        confirmLabel="Delete"
        variant="danger"
        loading={disable.isPending}
      />
    </Section>
  );
}

function CreateWebhookSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('');
  const [secret, setSecret] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/webhooks', {
        name: name.trim(),
        url: url.trim(),
        eventTypes: events.split(',').map((s) => s.trim()).filter(Boolean),
        secret,
      }),
    onSuccess: () => {
      toast.success('Webhook created');
      qc.invalidateQueries({ queryKey: ['admin-webhooks'] });
      onClose();
      setName('');
      setUrl('');
      setEvents('');
      setSecret('');
    },
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Create webhook"
      subtitle="POST platform events to an HTTPS endpoint."
      footer={<Button title="Create" variant="volt" full loading={create.isPending} disabled={!name.trim() || !url.trim() || !secret} onPress={() => create.mutate()} />}
    >
      <View style={{ gap: 14 }}>
        <Field label="Name" required>
          <Input value={name} onChangeText={setName} placeholder="ERP connector" />
        </Field>
        <Field label="Endpoint URL" required>
          <Input value={url} onChangeText={setUrl} placeholder="https://example.com/hooks/vyro" autoCapitalize="none" keyboardType="url" />
        </Field>
        <Field label="Event types" hint="Comma-separated, e.g. order.created,payment.confirmed">
          <Input value={events} onChangeText={setEvents} placeholder="order.created" autoCapitalize="none" />
        </Field>
        <Field label="Signing secret" required hint="Used to sign the X-Vyro-Signature header.">
          <Input value={secret} onChangeText={setSecret} placeholder="whsec_…" autoCapitalize="none" secureTextEntry />
        </Field>
      </View>
    </Sheet>
  );
}

function DeliveriesSheet({ webhookId, onClose }: { webhookId: string | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-webhook-deliveries', webhookId],
    queryFn: () => api.get<WebhookDelivery[]>(`/admin/webhooks/${webhookId}/deliveries`),
    enabled: !!webhookId,
  });
  const retry = useMutation({
    mutationFn: (deliveryId: string) => api.post(`/admin/webhooks/${webhookId}/retry/${deliveryId}`, {}),
    onSuccess: () => {
      toast.success('Delivery retried');
      qc.invalidateQueries({ queryKey: ['admin-webhook-deliveries', webhookId] });
    },
    onError: (e) => toast.error('Retry failed', errorMessage(e)),
  });
  return (
    <Sheet visible={!!webhookId} onClose={onClose} title="Recent deliveries">
      <View style={{ gap: 10 }}>
        {q.isLoading ? <SkeletonList rows={4} height={60} /> : null}
        {q.data?.length === 0 ? <Text variant="caption" color="ink4">No deliveries yet.</Text> : null}
        {(q.data ?? []).map((d) => (
          <Card key={d.id} kind="bone" padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodySm" weight="semibold">
                {d.eventType}
              </Text>
              <Text variant="caption" color="ink4">
                {d.attempts} attempt{d.attempts === 1 ? '' : 's'} · {timeAgo(d.createdAt)}
              </Text>
            </View>
            <StatusBadge status={d.status} size="sm" />
            {d.status !== 'delivered' && d.status !== 'success' ? (
              <Button title="Retry" size="sm" variant="ghost" loading={retry.isPending} onPress={() => retry.mutate(d.id)} />
            ) : null}
          </Card>
        ))}
      </View>
    </Sheet>
  );
}
