import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, EmptyState } from '@/components/ui';
import { BellIcon } from '@/components/icons';
import { Surface } from '@/components/brand/Surface';

interface Note {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
}

export function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notifications-me'],
    queryFn: () => api.get<{ notifications: Note[] }>('/notifications/me'),
    enabled: !!user,
  });
  const mark = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications-me'] }),
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

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <div className="vyro-kicker">Signals</div>
        <h1 className="mt-2 vyro-display text-4xl">Notifications</h1>
      </header>
      {isLoading ? (
        <div className="h-40 bg-mist animate-pulse" />
      ) : notes.length === 0 ? (
        <EmptyState icon={<BellIcon size={20} />} title="No signals yet." description="Order movement will appear here." />
      ) : (
        <div className="divide-y divide-ink/10 border-y border-ink/10">
          {notes.map((n) => (
            <Surface key={n.id} kind="flat" className={`p-5 shadow-none ${n.readAt ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-lg">{n.title}</h3>
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
        </div>
      )}
    </div>
  );
}
