import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useAdminNotificationInbox,
  useAdminNotificationDismiss,
  useAdminNotificationMarkAllRead,
  useAdminNotificationBroadcast,
  type AdminAlertSeverity,
  type AdminNotificationRow,
} from './useAdminNotifications';

const SEVERITIES: AdminAlertSeverity[] = ['info', 'warning', 'critical'];

function severityBar(s: AdminAlertSeverity) {
  return s === 'critical' ? 'bg-rose' : s === 'warning' ? 'bg-amber' : 'bg-mint';
}

function fmtTs(t: number): string {
  const ms = Date.now() - t;
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

export function NotificationsPage() {
  const canRead = usePermission('notification:read');
  const canWrite = usePermission('notification:write');
  const canDismiss = usePermission('notification:dismiss');
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => {
    const f: Parameters<typeof useAdminNotificationInbox>[0] = {};
    const sev = params.get('severity');
    if (sev) f.severity = sev.split(',') as AdminAlertSeverity[];
    const cat = params.get('category'); if (cat) f.category = cat;
    if (params.get('unreadOnly') === '1') f.unreadOnly = true;
    const sort = params.get('sort');
    if (sort === 'createdAt-asc' || sort === 'createdAt-desc') f.sort = sort;
    return f;
  }, [params]);

  const inbox = useAdminNotificationInbox(filters);
  const markAll = useAdminNotificationMarkAllRead();
  const [showBroadcast, setShowBroadcast] = useState(false);

  if (!canRead) return <ErrorBanner message="You need notification:read permission" />;
  if (inbox.isError) return <ErrorBanner message={(inbox.error as Error).message} />;

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key); else next.set(key, value);
    setParams(next);
  };

  const toggleSeverity = (s: AdminAlertSeverity) => {
    const cur = (params.get('severity') ?? '').split(',').filter(Boolean) as AdminAlertSeverity[];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
    updateParam('severity', next.length ? next.join(',') : null);
  };

  const items = inbox.data?.notifications ?? [];
  const unread = inbox.data?.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Notifications"
        sub={`${unread} unread · ${items.length} on this page`}
      />

      <Surface className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-ink-500">Severity:</span>
          {SEVERITIES.map(s => {
            const active = (filters.severity ?? []).includes(s);
            return (
              <button key={s} type="button" onClick={() => toggleSeverity(s)}
                className={`text-[10px] font-mono uppercase px-2 py-1 border rounded ${
                  active ? 'bg-ink text-paper border-ink' : 'bg-paper border-ink/15 text-ink-3'
                }`}>{s}</button>
            );
          })}
          <label className="ml-4 text-xs flex items-center gap-1">
            <input type="checkbox" checked={!!filters.unreadOnly}
              onChange={(e) => updateParam('unreadOnly', e.currentTarget.checked ? '1' : null)} />
            Unread only
          </label>
          <label className="ml-2 text-xs flex flex-col">
            <span className="text-ink-500">Sort</span>
            <select value={filters.sort ?? 'createdAt-desc'}
              onChange={(e) => updateParam('sort', e.currentTarget.value)}
              className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper">
              <option value="createdAt-desc">Newest</option>
              <option value="createdAt-asc">Oldest</option>
            </select>
          </label>
          <div className="flex-1" />
          {canDismiss ? (
            <Button size="sm" variant="ghost" disabled={markAll.isPending}
              onClick={() => markAll.mutate()}>Mark all read</Button>
          ) : null}
          {canWrite ? (
            <Button size="sm" variant="primary" onClick={() => setShowBroadcast(true)}>Broadcast</Button>
          ) : null}
        </div>
      </Surface>

      <Surface className="p-0 overflow-hidden">
        <ul className="divide-y divide-ink/10">
          {items.map(n => <NotificationRow key={n.id} row={n} />)}
          {!items.length ? (
            <li className="py-10 text-center text-ink-500 text-sm">
              <span className="inline-block text-mint mr-2">✓</span>All clear — no unread alerts
            </li>
          ) : null}
        </ul>
      </Surface>

      {showBroadcast ? <BroadcastDialog onClose={() => setShowBroadcast(false)} /> : null}
    </div>
  );
}

function NotificationRow({ row }: { row: AdminNotificationRow }) {
  const dismiss = useAdminNotificationDismiss();
  return (
    <li className="flex gap-3 p-3 hover:bg-bone/30">
      <div className={`w-1 ${severityBar(row.severity)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`font-medium text-sm ${row.readAt ? 'text-ink-3' : 'text-ink'}`}>{row.title}</span>
          <span className="text-[10px] uppercase font-mono text-ink-4">{row.severity}</span>
        </div>
        <p className="text-xs text-ink-3 truncate">{row.body}</p>
        <div className="text-[10px] text-ink-4 mt-1">
          {fmtTs(row.createdAt)}
          {row.link ? <> · <Link to={row.link} className="underline text-volt">open</Link></> : null}
          {row.sourceRef ? <> · <span className="font-mono">{row.sourceRef}</span></> : null}
        </div>
      </div>
      <button type="button"
        onClick={() => dismiss.mutate(row.id)}
        disabled={!!row.readAt}
        className="text-ink-4 hover:text-ink text-xs disabled:opacity-30"
        aria-label="Dismiss">
        ×
      </button>
    </li>
  );
}

function BroadcastDialog({ onClose }: { onClose: () => void }) {
  const broadcast = useAdminNotificationBroadcast();
  const [role, setRole] = useState('ops');
  const [severity, setSeverity] = useState<AdminAlertSeverity>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-4">
      <Surface className="w-full max-w-md p-4 space-y-3">
        <h3 className="font-medium">Broadcast to admins</h3>
        {broadcast.isError ? <ErrorBanner message={(broadcast.error as Error).message} /> : null}
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Role</span>
          <select value={role} onChange={(e) => setRole(e.currentTarget.value)}
            className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper">
            {['super_admin', 'ops', 'finance', 'support'].map(r =>
              <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Severity</span>
          <select value={severity}
            onChange={(e) => setSeverity(e.currentTarget.value as AdminAlertSeverity)}
            className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper">
            {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Title</span>
          <input value={title} onChange={(e) => setTitle(e.currentTarget.value)}
            maxLength={200}
            className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper" />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Body</span>
          <textarea value={body} onChange={(e) => setBody(e.currentTarget.value)}
            maxLength={2000} rows={4}
            className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper" />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">Link (optional)</span>
          <input value={link} onChange={(e) => setLink(e.currentTarget.value)}
            className="border border-ink/20 rounded px-2 py-1 text-sm bg-paper" />
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm"
            disabled={!title.trim() || !body.trim() || broadcast.isPending}
            onClick={() => broadcast.mutate(
              { role, severity, title: title.trim(), body: body.trim(), ...(link ? { link } : {}) },
              { onSuccess: onClose },
            )}>
            {broadcast.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
