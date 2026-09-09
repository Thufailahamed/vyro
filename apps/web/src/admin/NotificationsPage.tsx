import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button, EmptyState } from '@/components/ui';
import {
  BellIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCheckIcon,
  CheckIcon,
  ClockIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  PlusIcon,
  FilterIcon,
  XIcon,
} from '@/components/icons';
import { usePermission } from './lib/permissions';
import {
  useAdminNotificationInbox,
  useAdminNotificationDismiss,
  useAdminNotificationMarkAllRead,
  useAdminNotificationBroadcast,
  type AdminAlertSeverity,
  type AdminNotificationRow,
} from './useAdminNotifications';

const SEVERITIES: { id: AdminAlertSeverity; label: string; dot: string; badge: string }[] = [
  { id: 'critical', label: 'Critical', dot: 'bg-rose', badge: 'bg-rose/15 text-rose border-rose/30' },
  { id: 'warning', label: 'Warning', dot: 'bg-amber', badge: 'bg-amber/15 text-amber border-amber/30' },
  { id: 'info', label: 'Info', dot: 'bg-mint', badge: 'bg-mint/15 text-mint border-mint/30' },
];

function fmtTs(t: number): string {
  const ms = Date.now() - t;
  if (ms < 60_000) return 'Just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
    const cat = params.get('category');
    if (cat) f.category = cat;
    if (params.get('unreadOnly') === '1') f.unreadOnly = true;
    const sort = params.get('sort');
    if (sort === 'createdAt-asc' || sort === 'createdAt-desc') f.sort = sort;
    return f;
  }, [params]);

  const inbox = useAdminNotificationInbox(filters);
  const markAll = useAdminNotificationMarkAllRead();
  const [showBroadcast, setShowBroadcast] = useState(false);

  if (!canRead) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <ErrorBanner message="You need 'notification:read' permission to view system notifications." />
      </div>
    );
  }

  const updateParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  const toggleSeverity = (s: AdminAlertSeverity) => {
    const cur = (params.get('severity') ?? '').split(',').filter(Boolean) as AdminAlertSeverity[];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    updateParam('severity', next.length ? next.join(',') : null);
  };

  const clearAllFilters = () => {
    setParams(new URLSearchParams());
  };

  const items = inbox.data?.notifications ?? [];
  const unreadCount = inbox.data?.unreadCount ?? 0;

  // Compute metrics from current inbox
  const criticalCount = items.filter((n) => n.severity === 'critical' && !n.readAt).length;
  const warningCount = items.filter((n) => n.severity === 'warning' && !n.readAt).length;
  const activeFilterCount =
    (filters.severity?.length ?? 0) +
    (filters.unreadOnly ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.sort && filters.sort !== 'createdAt-desc' ? 1 : 0);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12">
      {/* Top Header */}
      <PageHeader
        kicker="Operations & Alert Center"
        title="Admin Notifications"
        sub="Live operational dispatches, system incidents, role-targeted broadcasts, and security telemetry."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => inbox.refetch()}
              loading={inbox.isFetching}
              title="Refresh notification inbox"
            >
              <RefreshCwIcon size={14} className={inbox.isFetching ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </Button>

            {canDismiss ? (
              <Button
                variant="outline"
                size="sm"
                disabled={unreadCount === 0 || markAll.isPending}
                loading={markAll.isPending}
                onClick={() => markAll.mutate()}
                title="Mark all notifications as read"
              >
                <CheckCheckIcon size={14} />
                <span>Mark All Read</span>
              </Button>
            ) : null}

            {canWrite ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowBroadcast(true)}
                title="Broadcast notification to staff roles"
              >
                <PlusIcon size={15} />
                <span>Broadcast Alert</span>
              </Button>
            ) : null}
          </div>
        }
      />

      {inbox.isError ? <ErrorBanner message={(inbox.error as Error).message} /> : null}

      {/* 4 Executive KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Unread Alerts */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Unread Alerts
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  unreadCount > 0
                    ? 'bg-rose/15 text-rose border-rose/30'
                    : 'bg-mint/15 text-mint border-mint/30'
                }`}
              >
                {unreadCount > 0 ? `${unreadCount} Action Needed` : 'All Clear'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-ink">{unreadCount}</span>
              <span className="text-xs text-ink-4">pending review</span>
            </div>
          </div>
          <p className="text-[11px] text-ink-4 mt-3 pt-3 border-t border-ink/5">
            Operational alerts requiring operator acknowledgement
          </p>
        </Surface>

        {/* Critical Incidents */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Critical Severity
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  criticalCount > 0
                    ? 'bg-rose/15 text-rose border-rose/30 animate-pulse'
                    : 'bg-mint/15 text-mint border-mint/30'
                }`}
              >
                {criticalCount > 0 ? 'Urgent' : 'Nominal'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-rose">{criticalCount}</span>
              <span className="text-xs text-ink-4">active critical</span>
            </div>
          </div>
          <p className="text-[11px] text-ink-4 mt-3 pt-3 border-t border-ink/5">
            Severe system faults or payment security advisories
          </p>
        </Surface>

        {/* Warning Advisories */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Warnings & Audits
              </span>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${
                  warningCount > 0
                    ? 'bg-amber/15 text-amber border-amber/30'
                    : 'bg-mint/15 text-mint border-mint/30'
                }`}
              >
                {warningCount > 0 ? 'Monitoring' : 'Optimal'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono text-amber">{warningCount}</span>
              <span className="text-xs text-ink-4">advisories</span>
            </div>
          </div>
          <p className="text-[11px] text-ink-4 mt-3 pt-3 border-t border-ink/5">
            Elevated latencies, inventory spikes, or webhook retries
          </p>
        </Surface>

        {/* Staff Broadcast Channel */}
        <Surface className="p-5 flex flex-col justify-between bg-white border border-ink/10 shadow-sm hover:border-ink/20 transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">
                Staff Broadcast
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full bg-paper border border-ink/10 text-ink">
                4 Roles
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-ink">Role Scoped</span>
              <span className="text-xs text-ink-4">dispatch</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-ink/5 flex items-center justify-between">
            <span className="text-[11px] text-ink-4">Ops, Admin, Finance</span>
            {canWrite ? (
              <button
                type="button"
                onClick={() => setShowBroadcast(true)}
                className="text-xs font-semibold text-ink hover:underline cursor-pointer"
              >
                Draft →
              </button>
            ) : null}
          </div>
        </Surface>
      </div>

      {/* Filter and Control Bar */}
      <Surface className="p-4 bg-white border border-ink/10 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Severity Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs font-semibold text-ink-3 mr-1">
              <FilterIcon size={14} />
              <span>Severity:</span>
            </div>

            <button
              type="button"
              onClick={() => updateParam('severity', null)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                !filters.severity?.length
                  ? 'bg-ink text-paper border-ink font-semibold shadow-xs'
                  : 'bg-paper text-ink-3 border-ink/15 hover:border-ink/30'
              }`}
            >
              All Severities
            </button>

            {SEVERITIES.map((s) => {
              const active = (filters.severity ?? []).includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSeverity(s.id)}
                  className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    active
                      ? 'bg-ink text-paper border-ink font-semibold shadow-xs'
                      : 'bg-paper text-ink-2 border-ink/15 hover:border-ink/30'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Filters & Sort */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Unread Only Pill Button */}
            <button
              type="button"
              onClick={() =>
                updateParam('unreadOnly', filters.unreadOnly ? null : '1')
              }
              className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                filters.unreadOnly
                  ? 'bg-ink text-paper border-ink font-semibold shadow-xs'
                  : 'bg-paper text-ink-3 border-ink/15 hover:border-ink/30'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  filters.unreadOnly ? 'bg-volt' : 'bg-ink/30'
                }`}
              />
              <span>Unread Only</span>
            </button>

            {/* Sort Select */}
            <div className="flex items-center gap-1.5 text-xs text-ink-3">
              <span>Sort:</span>
              <select
                value={filters.sort ?? 'createdAt-desc'}
                onChange={(e) => updateParam('sort', e.currentTarget.value)}
                className="bg-paper border border-ink/20 rounded-lg px-2.5 py-1.5 text-xs text-ink font-medium focus:outline-none focus:ring-1 focus:ring-ink"
              >
                <option value="createdAt-desc">Newest First</option>
                <option value="createdAt-asc">Oldest First</option>
              </select>
            </div>

            {/* Clear Filters */}
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 text-xs text-ink-4 hover:text-ink transition-colors px-2 py-1 cursor-pointer"
                title="Clear all active filters"
              >
                <XIcon size={12} />
                <span>Reset</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Active Filter Summary Bar */}
        <div className="flex items-center justify-between text-xs text-ink-4 pt-2 border-t border-ink/5">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-ink font-mono">{items.length}</strong> alerts
            </span>
            {filters.unreadOnly ? (
              <span className="px-2 py-0.5 rounded-full bg-paper border border-ink/10 text-[10px] font-mono">
                Unread Filter
              </span>
            ) : null}
            {filters.severity?.length ? (
              <span className="px-2 py-0.5 rounded-full bg-paper border border-ink/10 text-[10px] font-mono uppercase">
                {filters.severity.join(', ')}
              </span>
            ) : null}
          </div>
          <span className="font-mono text-[11px]">
            Total Inbox: {unreadCount} unread
          </span>
        </div>
      </Surface>

      {/* Notifications Card List */}
      <Surface className="p-0 overflow-hidden bg-white border border-ink/10 shadow-sm">
        {items.length === 0 ? (
          <EmptyState
            icon={<BellIcon size={24} />}
            title="All Clear"
            description={
              activeFilterCount > 0
                ? 'No notifications match your active filter criteria. Try resetting your filters to see historical alerts.'
                : 'You have zero unread alerts. All operational systems and notifications are in a healthy state.'
            }
            action={
              activeFilterCount > 0 ? (
                <Button variant="outline" size="sm" onClick={clearAllFilters}>
                  Clear Filters
                </Button>
              ) : canWrite ? (
                <Button variant="primary" size="sm" onClick={() => setShowBroadcast(true)}>
                  Send Broadcast
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-ink/10">
            {items.map((notification) => (
              <NotificationRowItem
                key={notification.id}
                row={notification}
                canDismiss={canDismiss}
              />
            ))}
          </ul>
        )}
      </Surface>

      {/* Broadcast Modal */}
      {showBroadcast ? <BroadcastDialog onClose={() => setShowBroadcast(false)} /> : null}
    </div>
  );
}

// ----------------------------------------------------------------------
// Notification Row Item
// ----------------------------------------------------------------------
function NotificationRowItem({
  row,
  canDismiss,
}: {
  row: AdminNotificationRow;
  canDismiss: boolean;
}) {
  const dismiss = useAdminNotificationDismiss();
  const isRead = !!row.readAt;

  const sevConfig =
    SEVERITIES.find((s) => s.id === row.severity) ?? {
      id: row.severity,
      label: row.severity,
      dot: 'bg-mint',
      badge: 'bg-mint/15 text-mint border-mint/30',
    };

  return (
    <li
      className={`relative flex items-start gap-4 p-4.5 transition-colors ${
        isRead ? 'bg-white opacity-70 hover:opacity-100 hover:bg-sand/15' : 'bg-sand/30 hover:bg-sand/45'
      }`}
    >
      {/* Severity Indicator Bar */}
      <div
        className={`w-1 self-stretch rounded-full shrink-0 ${
          row.severity === 'critical'
            ? 'bg-rose shadow-[0_0_8px_rgba(244,63,94,0.4)]'
            : row.severity === 'warning'
            ? 'bg-amber'
            : 'bg-mint'
        }`}
      />

      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
            row.severity === 'critical'
              ? 'bg-rose/10 text-rose border-rose/20'
              : row.severity === 'warning'
              ? 'bg-amber/10 text-amber border-amber/20'
              : 'bg-mint/10 text-mint border-mint/20'
          }`}
        >
          {row.severity === 'critical' ? (
            <AlertCircleIcon size={16} />
          ) : row.severity === 'warning' ? (
            <AlertTriangleIcon size={16} />
          ) : (
            <CheckCircleIcon size={16} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-semibold ${isRead ? 'text-ink-2' : 'text-ink'}`}>
            {row.title}
          </span>

          <span
            className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full border ${sevConfig.badge}`}
          >
            {sevConfig.label}
          </span>

          {!isRead ? (
            <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold tracking-wider uppercase rounded bg-ink text-paper">
              New
            </span>
          ) : null}
        </div>

        <p className="text-xs text-ink-3 mt-1.5 leading-relaxed">{row.body}</p>

        {/* Metadata Footer */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 text-[11px] text-ink-4">
          <div className="inline-flex items-center gap-1">
            <ClockIcon size={12} />
            <span>{fmtTs(row.createdAt)}</span>
          </div>

          {row.sourceRef ? (
            <div className="inline-flex items-center gap-1 font-mono text-[10px] bg-paper px-2 py-0.5 rounded border border-ink/10 text-ink-3">
              <span>Source:</span>
              <span className="font-semibold text-ink">{row.sourceRef}</span>
            </div>
          ) : null}

          {row.link ? (
            <Link
              to={row.link}
              className="inline-flex items-center gap-1 text-ink font-semibold hover:underline"
            >
              <span>Inspect Incident</span>
              <ExternalLinkIcon size={11} />
            </Link>
          ) : null}

          {isRead ? (
            <span className="text-[10px] text-ink-4 italic">
              Read {fmtTs(row.readAt!)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Dismiss Action */}
      {canDismiss && !isRead ? (
        <button
          type="button"
          onClick={() => dismiss.mutate(row.id)}
          disabled={dismiss.isPending}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-ink/15 text-ink-3 hover:text-ink hover:bg-white text-xs font-medium transition-colors shrink-0 cursor-pointer disabled:opacity-40"
          title="Mark as read"
        >
          <CheckIcon size={13} />
          <span className="hidden sm:inline">Mark read</span>
        </button>
      ) : null}
    </li>
  );
}

// ----------------------------------------------------------------------
// Enhanced Broadcast Modal Dialog
// ----------------------------------------------------------------------
function BroadcastDialog({ onClose }: { onClose: () => void }) {
  const broadcast = useAdminNotificationBroadcast();
  const [role, setRole] = useState('ops');
  const [severity, setSeverity] = useState<AdminAlertSeverity>('info');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');

  const roles = [
    { value: 'super_admin', label: 'Super Administrators', desc: 'Security, database, and root configs' },
    { value: 'ops', label: 'Operations & Logistics', desc: 'Orders, shipments, inventory dispatch' },
    { value: 'finance', label: 'Finance & Accounting', desc: 'Ledger payouts, Stripe disputes, refund audits' },
    { value: 'support', label: 'Customer Support', desc: 'Customer escalations, tickets, seller reviews' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || broadcast.isPending) return;

    broadcast.mutate(
      {
        role,
        severity,
        title: title.trim(),
        body: body.trim(),
        ...(link.trim() ? { link: link.trim() } : {}),
      },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
      <Surface className="w-full max-w-lg p-6 bg-white border border-ink/10 shadow-2xl rounded-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-ink/10">
          <div>
            <h3 className="vyro-display text-xl text-ink">Broadcast Alert</h3>
            <p className="text-xs text-ink-4 mt-0.5">
              Dispatch an operational alert to targeted administrative operators.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-ink-4 hover:text-ink rounded-lg transition-colors cursor-pointer"
          >
            <XIcon size={18} />
          </button>
        </div>

        {broadcast.isError ? (
          <ErrorBanner message={(broadcast.error as Error).message} />
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Role */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
              Recipient Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.currentTarget.value)}
              className="w-full bg-paper border border-ink/20 rounded-lg px-3 py-2 text-sm text-ink font-medium focus:outline-none focus:ring-1 focus:ring-ink"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} ({r.desc})
                </option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
              Severity Level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITIES.map((s) => {
                const active = severity === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeverity(s.id)}
                    className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-ink text-paper border-ink shadow-sm'
                        : 'bg-paper text-ink-2 border-ink/15 hover:border-ink/30'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
                Alert Title
              </label>
              <span className="text-[10px] font-mono text-ink-4">{title.length}/200</span>
            </div>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              maxLength={200}
              placeholder="e.g. Database maintenance scheduled for 02:00 UTC"
              className="w-full bg-paper border border-ink/20 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
                Message Body
              </label>
              <span className="text-[10px] font-mono text-ink-4">{body.length}/2000</span>
            </div>
            <textarea
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              maxLength={2000}
              placeholder="Provide context, affected subsystems, and recommended operator actions..."
              className="w-full bg-paper border border-ink/20 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </div>

          {/* Link */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3">
              Deep Link / Action Path <span className="font-normal text-ink-4">(Optional)</span>
            </label>
            <input
              type="text"
              value={link}
              onChange={(e) => setLink(e.currentTarget.value)}
              placeholder="e.g. /admin/observability?tab=health or /admin/orders"
              className="w-full bg-paper border border-ink/20 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-ink/10">
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!title.trim() || !body.trim() || broadcast.isPending}
              loading={broadcast.isPending}
            >
              Send Broadcast
            </Button>
          </div>
        </form>
      </Surface>
    </div>
  );
}
