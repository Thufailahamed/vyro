import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useAdminNotificationUnread,
  useAdminNotificationDismiss,
  useAdminNotificationInbox,
  useAdminNotificationMarkAllRead,
} from './useAdminNotifications';
import { BellIcon, CheckCircleIcon, ExternalLinkIcon, CheckIcon } from '@/components/icons';

export function BellButton() {
  const unread = useAdminNotificationUnread();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const count = unread.data ?? 0;

  // Dismiss on click outside or Escape key
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Admin notifications"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
          open
            ? 'bg-paper/15 text-volt ring-1 ring-volt/30'
            : 'text-paper/70 hover:text-volt hover:bg-paper/10'
        }`}
      >
        <BellIcon size={16} />
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose text-paper text-[9px] font-mono font-bold flex items-center justify-center shadow-sm">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <PreviewPopover
          onClose={() => setOpen(false)}
          onViewAll={() => {
            setOpen(false);
            navigate('/admin/notifications');
          }}
        />
      ) : null}
    </div>
  );
}

function PreviewPopover({
  onClose,
  onViewAll,
}: {
  onClose: () => void;
  onViewAll: () => void;
}) {
  const inbox = useAdminNotificationInbox({ unreadOnly: true });
  const dismiss = useAdminNotificationDismiss();
  const markAll = useAdminNotificationMarkAllRead();

  const items = inbox.data?.notifications?.slice(0, 5) ?? [];
  const totalUnread = inbox.data?.unreadCount ?? items.length;

  return (
    <div
      className="absolute right-0 lg:left-0 lg:right-auto top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-[#141416] text-paper border border-paper/15 rounded-xl shadow-2xl ring-1 ring-black/50 z-50 overflow-hidden animate-fade-in"
      role="menu"
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-paper/10 bg-paper/5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-paper">Recent Unread</span>
          {totalUnread > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-rose/20 text-rose border border-rose/30">
              {totalUnread}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs font-medium text-volt hover:text-volt/80 transition-colors inline-flex items-center gap-1 cursor-pointer"
        >
          <span>View all</span>
          <ExternalLinkIcon size={12} />
        </button>
      </div>

      {/* Notifications List */}
      <ul className="max-h-72 overflow-y-auto divide-y divide-paper/10">
        {inbox.isLoading ? (
          <li className="px-4 py-6 text-xs text-paper/50 text-center animate-pulse">
            Loading notifications…
          </li>
        ) : items.length === 0 ? (
          <li className="px-4 py-8 text-center space-y-2">
            <div className="mx-auto w-8 h-8 rounded-full bg-mint/20 text-mint flex items-center justify-center">
              <CheckCircleIcon size={16} />
            </div>
            <div className="text-xs font-medium text-paper">All clear</div>
            <div className="text-[11px] text-paper/50">No unread alerts requiring attention</div>
          </li>
        ) : (
          items.map((n) => {
            const barColor =
              n.severity === 'critical'
                ? 'bg-rose shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                : n.severity === 'warning'
                ? 'bg-amber shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                : 'bg-mint shadow-[0_0_8px_rgba(16,185,129,0.5)]';

            return (
              <li
                key={n.id}
                className="group relative flex items-start gap-2.5 px-3 py-2.5 hover:bg-paper/5 transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${barColor}`} />
                <div className="flex-1 min-w-0 pr-1">
                  <div className="text-xs font-medium text-paper truncate" title={n.title}>
                    {n.title}
                  </div>
                  <p className="text-[11px] text-paper/60 line-clamp-1 mt-0.5">
                    {n.body}
                  </p>
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={onClose}
                      className="inline-flex items-center gap-1 text-[10px] text-volt hover:underline mt-1"
                    >
                      <span>Open alert</span>
                      <ExternalLinkIcon size={10} />
                    </Link>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  title="Dismiss notification"
                  onClick={() => dismiss.mutate(n.id)}
                  disabled={dismiss.isPending}
                  className="text-paper/40 hover:text-paper hover:bg-paper/10 rounded p-1 text-xs transition-colors shrink-0 cursor-pointer"
                >
                  <CheckIcon size={12} />
                </button>
              </li>
            );
          })
        )}
      </ul>

      {/* Popover Footer */}
      <div className="px-3.5 py-2 border-t border-paper/10 bg-paper/5 flex items-center justify-between text-xs">
        {totalUnread > 0 ? (
          <button
            type="button"
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
            className="text-[11px] text-paper/60 hover:text-paper transition-colors disabled:opacity-50 cursor-pointer"
          >
            {markAll.isPending ? 'Marking…' : 'Mark all read'}
          </button>
        ) : (
          <span className="text-[11px] text-paper/40 font-mono">Inbox up to date</span>
        )}

        <button
          type="button"
          onClick={onViewAll}
          className="text-[11px] font-semibold text-paper/80 hover:text-volt transition-colors cursor-pointer"
        >
          Open Inbox →
        </button>
      </div>
    </div>
  );
}
