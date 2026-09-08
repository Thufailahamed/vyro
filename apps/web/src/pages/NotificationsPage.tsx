import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { BellIcon } from '@/components/icons';
import { Surface } from '@/components/brand/Surface';

interface Note {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
  type: string;
}

export function NotificationsPage() {
  usePageTitle('Notifications');
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [cursor, setCursor] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', filter, cursor],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '30' });
      if (filter === 'unread') params.set('unread', '1');
      if (cursor) params.set('before', String(cursor));
      return api.get<{ notifications: Note[]; unreadCount: number; nextCursor: number | null }>(
        `/notifications/me?${params.toString()}`,
      );
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const mark = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-page'] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post<{ updated: number }>('/notifications/me/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-page'] }),
  });

  if (!user) {
    return (
      <div className="py-12">
        <h2 className="vyro-display text-3xl">Sign in to see signals</h2>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  const notes = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  return (
    <div className="space-y-8 max-w-3xl">
      <PageHeader kicker="Signals" title="Notifications." sub="Order movement, deliveries, payments and stock." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={filter === 'all' ? 'primary' : 'secondary'} onClick={() => setFilter('all')}>
            All
          </Button>
          <Button size="sm" variant={filter === 'unread' ? 'primary' : 'secondary'} onClick={() => setFilter('unread')}>
            Unread {unread > 0 && <span className="ml-1 font-mono">({unread})</span>}
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          Mark all read
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 bg-mist animate-pulse" />
      ) : notes.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={20} />}
          title={filter === 'unread' ? 'No unread signals.' : 'No signals yet.'}
          description={filter === 'unread' ? 'Inbox zero. New activity will surface here.' : 'Order movement will appear here.'}
        />
      ) : (
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {notes.map((n) => (
            <Surface key={n.id} kind="flat" className={`p-5 shadow-none ${n.readAt ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.readAt && <span className="size-2 bg-volt rounded-full shrink-0" aria-label="unread" />}
                    <h3 className="font-display text-lg">{n.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-ink-4 vyro-metric">{n.type}</span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-ink-4">{n.body}</p>}
                  <p className="mt-2 text-[11px] text-ink-4 vyro-metric">
                    {new Date(n.createdAt).toLocaleString('en-GB')}
                  </p>
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="secondary" onClick={() => mark.mutate(n.id)}>
                    Mark read
                  </Button>
                )}
              </div>
              {n.link && (
                <Link to={n.link} className="mt-3 inline-block text-sm text-copper">
                  Open →
                </Link>
              )}
            </Surface>
          ))}
          {data?.nextCursor && (
            <div className="py-4 flex justify-center">
              <Button size="sm" variant="secondary" onClick={() => setCursor(data.nextCursor)}>
                Load older
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
