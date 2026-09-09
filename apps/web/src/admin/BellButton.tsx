import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminNotificationUnread, useAdminNotificationDismiss } from './useAdminNotifications';
import { BellIcon } from '@/components/icons';

export function BellButton() {
  const unread = useAdminNotificationUnread();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const count = unread.data ?? 0;

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="Admin notifications"
        onClick={() => navigate('/admin/notifications')}
        onMouseEnter={() => setOpen(true)}
        className="relative p-1.5 rounded-xs text-paper/60 hover:text-volt hover:bg-paper/10 transition-colors"
      >
        <BellIcon size={16} />
        {count > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose text-paper text-[9px] font-mono font-bold flex items-center justify-center shadow-xs">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? <PreviewPopover onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function PreviewPopover({ onClose }: { onClose: () => void }) {
  // Lightweight preview: refetch inbox directly
  const [items, setItems] = useState<{ id: string; title: string; severity: 'info' | 'warning' | 'critical' }[] | null>(null);
  const dismiss = useAdminNotificationDismiss();
  // Lazy import api to avoid circular deps in this file
  if (items === null) {
    void import('@/lib/api').then(async ({ api }) => {
      const r = await api.get<{ notifications: { id: string; title: string; severity: 'info' | 'warning' | 'critical' }[] }>(
        '/admin/notifications?unreadOnly=true',
      );
      setItems(r.notifications.slice(0, 5));
    });
    return <PopoverBody items={null} onClose={onClose} dismiss={dismiss} />;
  }
  return <PopoverBody items={items} onClose={onClose} dismiss={dismiss} />;
}

function PopoverBody({
  items,
  onClose,
  dismiss,
}: {
  items: { id: string; title: string; severity: 'info' | 'warning' | 'critical' }[] | null;
  onClose: () => void;
  dismiss: ReturnType<typeof useAdminNotificationDismiss>;
}) {
  return (
    <div
      className="absolute right-0 top-full mt-2 w-80 bg-paper text-ink border border-ink/15 rounded shadow-lg z-50"
      role="menu"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink/10">
        <span className="text-xs font-medium">Recent unread</span>
        <Link to="/admin/notifications" onClick={onClose} className="text-xs text-volt">View all</Link>
      </div>
      <ul className="max-h-64 overflow-y-auto divide-y divide-ink/10">
        {items === null ? (
          <li className="px-3 py-2 text-xs text-ink-4">Loading…</li>
        ) : items.length === 0 ? (
          <li className="px-3 py-3 text-xs text-ink-5 text-center">All clear ✓</li>
        ) : items.map(n => (
          <li key={n.id} className="flex items-center gap-2 px-3 py-2 text-xs">
            <span className={`w-1 h-4 ${n.severity === 'critical' ? 'bg-rose' : n.severity === 'warning' ? 'bg-amber' : 'bg-mint'}`} />
            <span className="flex-1 truncate">{n.title}</span>
            <button type="button" aria-label="Dismiss"
              onClick={() => dismiss.mutate(n.id)}
              className="text-ink-4 hover:text-ink">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
