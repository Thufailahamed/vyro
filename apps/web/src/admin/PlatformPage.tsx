import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useFeatureFlags,
  useUpdateFeatureFlags,
  useEmailTemplates,
  useUpdateEmailTemplates,
  useWebhooks,
  useCreateWebhook,
  useDisableWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
} from './useAdminPlatformConfig';

type Tab = 'flags' | 'templates' | 'webhooks';

export function PlatformPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'flags';
  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Platform" sub="Feature flags, email templates, webhooks" />
      <nav className="flex gap-2 border-b border-ink/10">
        <TabBtn active={tab === 'flags'} onClick={() => switchTab('flags')}>Feature flags</TabBtn>
        <TabBtn active={tab === 'templates'} onClick={() => switchTab('templates')}>Email templates</TabBtn>
        <TabBtn active={tab === 'webhooks'} onClick={() => switchTab('webhooks')}>Webhooks</TabBtn>
      </nav>
      {tab === 'flags' ? <FlagsTab /> : null}
      {tab === 'templates' ? <TemplatesTab /> : null}
      {tab === 'webhooks' ? <WebhooksTab /> : null}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active ? 'border-volt text-volt' : 'border-transparent text-ink-500 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

function FlagsTab() {
  const canRead = usePermission('feature_flag:read');
  const canWrite = usePermission('feature_flag:write');
  const q = useFeatureFlags();
  const update = useUpdateFeatureFlags();
  const [draft, setDraft] = useState<string>('');
  if (!canRead) return <ErrorBanner message="You need feature_flag:read permission" />;
  return (
    <Surface className="p-4 space-y-4">
      {q.isError ? <ErrorBanner message={(q.error as Error).message} /> : null}
      <div className="text-xs text-ink-500">Version: {q.data?.version ?? 0}</div>
      <textarea
        className="w-full h-64 font-mono text-xs border border-ink/20 rounded p-2"
        defaultValue={JSON.stringify(q.data?.value ?? {}, null, 2)}
        onChange={(e) => setDraft(e.target.value)}
      />
      {canWrite ? (
        <Button
          variant="primary"
          disabled={!draft || update.isPending}
          onClick={() => {
            try {
              const value = JSON.parse(draft);
              update.mutate({ value, expectedVersion: q.data?.version ?? 0 });
            } catch {
              alert('Invalid JSON');
            }
          }}
        >
          Save
        </Button>
      ) : null}
    </Surface>
  );
}

function TemplatesTab() {
  const canRead = usePermission('email_template:read');
  const canWrite = usePermission('email_template:write');
  const q = useEmailTemplates();
  const update = useUpdateEmailTemplates();
  const [draft, setDraft] = useState<string>('');
  if (!canRead) return <ErrorBanner message="You need email_template:read permission" />;
  return (
    <Surface className="p-4 space-y-4">
      {q.isError ? <ErrorBanner message={(q.error as Error).message} /> : null}
      <div className="text-xs text-ink-500">Version: {q.data?.version ?? 0}</div>
      <textarea
        className="w-full h-64 font-mono text-xs border border-ink/20 rounded p-2"
        defaultValue={JSON.stringify(q.data?.value ?? {}, null, 2)}
        onChange={(e) => setDraft(e.target.value)}
      />
      {canWrite ? (
        <Button
          variant="primary"
          disabled={!draft || update.isPending}
          onClick={() => {
            try {
              const value = JSON.parse(draft);
              update.mutate({ value, expectedVersion: q.data?.version ?? 0 });
            } catch {
              alert('Invalid JSON');
            }
          }}
        >
          Save
        </Button>
      ) : null}
    </Surface>
  );
}

function WebhooksTab() {
  const canRead = usePermission('webhook:read');
  const canWrite = usePermission('webhook:write');
  const canRetry = usePermission('webhook:retry');
  const list = useWebhooks();
  const create = useCreateWebhook();
  const disable = useDisableWebhook();
  const retry = useRetryDelivery();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState('order.created');
  const [secret, setSecret] = useState('');
  // Default to the first webhook so deliveries always reflect a real endpoint,
  // not the prior hardcoded "wh-1" stub.
  const [selectedWebhookId, setSelectedWebhookId] = useState<string | null>(null);
  const selectedId = selectedWebhookId ?? list.data?.[0]?.id ?? null;
  const deliveries = useWebhookDeliveries(selectedId);
  if (!canRead) return <ErrorBanner message="You need webhook:read permission" />;
  return (
    <div className="space-y-4">
      {canWrite ? (
        <Surface className="p-4 space-y-2">
          <h3 className="text-sm font-medium">Create webhook</h3>
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="border border-ink/20 rounded px-2 py-1" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="border border-ink/20 rounded px-2 py-1" />
            <input value={events} onChange={(e) => setEvents(e.target.value)} placeholder="event types (comma)" className="border border-ink/20 rounded px-2 py-1" />
            <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Secret (min 8 chars)" className="border border-ink/20 rounded px-2 py-1" />
          </div>
          <Button
            variant="primary"
            disabled={!name || !url || !events || secret.length < 8}
            onClick={() =>
              create.mutate({
                name,
                url,
                eventTypes: events.split(',').map((e) => e.trim()).filter(Boolean),
                secret,
              })
            }
          >
            Create
          </Button>
        </Surface>
      ) : null}
      <Surface className="p-4">
        <h3 className="text-sm font-medium mb-2">Webhooks</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="py-2">Name</th>
              <th>URL</th>
              <th>Active</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((h) => (
              <tr key={h.id} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{h.name}</td>
                <td className="font-mono text-xs truncate max-w-xs">{h.url}</td>
                <td>{h.active ? 'yes' : 'no'}</td>
                <td>{fmtTs(h.createdAt)}</td>
                <td className="text-right">
                  {h.active && canWrite ? (
                    <Button size="sm" variant="ghost" onClick={() => disable.mutate(h.id)}>Disable</Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!list.data?.length ? (
              <tr><td colSpan={5} className="py-4 text-center text-ink-500">No webhooks</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>
      <Surface className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Recent deliveries</h3>
          {list.data && list.data.length > 1 ? (
            <label className="text-xs flex items-center gap-2">
              <span className="text-ink-500">Webhook</span>
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedWebhookId(e.target.value || null)}
                className="border border-ink/20 rounded px-2 py-1"
              >
                {list.data.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="py-2">Delivery</th>
              <th>Event</th>
              <th>Status</th>
              <th>Response</th>
              <th>Attempts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(deliveries.data ?? []).map((d) => (
              <tr key={d.id} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{d.id}</td>
                <td>{d.eventType}</td>
                <td>{d.status}</td>
                <td>{d.responseStatus ?? '—'}</td>
                <td>{d.attemptCount}</td>
                <td className="text-right">
                  {canRetry && d.status === 'failed' ? (
                    <Button size="sm" variant="primary" onClick={() => retry.mutate({ webhookId: d.webhookId, deliveryId: d.id })}>
                      Retry
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!selectedId ? (
              <tr><td colSpan={6} className="py-4 text-center text-ink-500">Create a webhook to see deliveries</td></tr>
            ) : !deliveries.data?.length ? (
              <tr><td colSpan={6} className="py-4 text-center text-ink-500">No deliveries yet</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
