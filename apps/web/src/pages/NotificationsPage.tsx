import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import {
  BellIcon,
  PackageIcon,
  TruckIcon,
  FileTextIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  ShoppingCartIcon,
  SearchIcon,
  SparklesIcon,
} from '@/components/icons';

interface Note {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: number | null;
  createdAt: number;
  type: string;
}

type CategoryTab = 'all' | 'unread' | 'order' | 'delivery' | 'payment';

function getNotificationIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes('delivery') || t.includes('dispatch') || t.includes('truck') || t.includes('freight')) {
    return <TruckIcon size={18} className="text-copper" />;
  }
  if (t.includes('invoice') || t.includes('payment') || t.includes('paid') || t.includes('credit')) {
    return <FileTextIcon size={18} className="text-mint" />;
  }
  if (t.includes('dispute') || t.includes('alert') || t.includes('security') || t.includes('suspend')) {
    return <AlertCircleIcon size={18} className="text-rose" />;
  }
  return <PackageIcon size={18} className="text-volt-deep" />;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NotificationsPage() {
  usePageTitle('Notifications & Activity Signals');
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cursor, setCursor] = useState<number | null>(null);

  // 1. Notifications Query
  const { data, isLoading } = useQuery({
    queryKey: ['notifications-page', activeTab === 'unread', cursor],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' });
      if (activeTab === 'unread') params.set('unread', '1');
      if (cursor) params.set('before', String(cursor));
      return api.get<{ notifications: Note[]; unreadCount: number; nextCursor: number | null }>(
        `/notifications/me?${params.toString()}`,
      );
    },
    enabled: !!user,
    refetchInterval: 30_000,
  });

  // 2. Active Cart Query (for cart readiness context)
  const { data: cartData } = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: Array<{ id: string }>; totalCents?: number }>(`/cart?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 10_000,
  });

  const cartCount = cartData?.items?.length ?? 0;

  const mark = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications-page'] });
      void qc.invalidateQueries({ queryKey: ['notifications-me'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post<{ updated: number }>('/notifications/me/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications-page'] });
      void qc.invalidateQueries({ queryKey: ['notifications-me'] });
    },
  });

  const notes = data?.notifications ?? [];
  const unread = data?.unreadCount ?? 0;

  // Filtered by category tab and search query
  const filteredNotes = useMemo(() => {
    let list = notes;

    if (activeTab === 'unread') {
      list = list.filter((n) => !n.readAt);
    } else if (activeTab === 'order') {
      list = list.filter((n) => n.type.toLowerCase().includes('order'));
    } else if (activeTab === 'delivery') {
      list = list.filter(
        (n) =>
          n.type.toLowerCase().includes('delivery') ||
          n.type.toLowerCase().includes('dispatch') ||
          n.type.toLowerCase().includes('truck'),
      );
    } else if (activeTab === 'payment') {
      list = list.filter(
        (n) =>
          n.type.toLowerCase().includes('payment') ||
          n.type.toLowerCase().includes('invoice') ||
          n.type.toLowerCase().includes('credit'),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          (n.body && n.body.toLowerCase().includes(q)) ||
          n.type.toLowerCase().includes(q),
      );
    }

    return list;
  }, [notes, activeTab, searchQuery]);

  if (!user) {
    return (
      <div className="py-16 text-center space-y-4 max-w-lg mx-auto">
        <div className="size-12 bg-ink text-volt mx-auto flex items-center justify-center">
          <BellIcon size={24} />
        </div>
        <h2 className="vyro-display text-3xl text-ink">Sign in to view signals</h2>
        <p className="text-sm text-ink-3">
          Sign in to your authenticated commercial workspace to access real-time order dispatch alerts and digital GRN notifications.
        </p>
        <Link to="/login" className="mt-4 inline-block">
          <Button>Sign in to Workspace</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Executive Page Header */}
      <PageHeader
        kicker={
          <div className="flex flex-wrap items-center gap-2">
            <span className="vyro-kicker text-copper">Activity Stream</span>
            <span className="text-ink-4">/</span>
            <span className="text-[11px] font-mono text-ink-3">Live Dispatch & Audit Signals</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-volt/15 border border-volt/30 text-[10px] font-mono font-bold text-ink uppercase tracking-wider">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Push Gateway Connected
            </span>
          </div>
        }
        title="Notifications & Activity"
        sub="Real-time procurement updates across order milestones, driver vehicle staging, dockside Goods Receipt (GRN) sign-offs, and digital SVAT settlements."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="secondary"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
              className="text-xs uppercase tracking-wider font-semibold bg-paper"
            >
              <CheckCircleIcon size={14} className="text-mint" />
              <span>Mark All Read</span>
            </Button>
          </div>
        }
      />

      {/* Active Cart Notification Banner (if buyer has cart items waiting) */}
      {cartCount > 0 && (
        <div className="p-4 bg-paper border border-ink/15 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="size-8 bg-ink text-volt flex items-center justify-center shrink-0">
              <ShoppingCartIcon size={16} />
            </div>
            <div>
              <div className="text-xs font-semibold text-ink">
                You have {cartCount} item{cartCount === 1 ? '' : 's'} waiting in your active cart
              </div>
              <p className="text-[11px] text-ink-4">
                Confirm your order to begin receiving automated driver dispatch and tracking notifications.
              </p>
            </div>
          </div>
          <Link to="/cart">
            <Button size="sm" className="text-xs uppercase tracking-wider font-bold">
              Review Cart →
            </Button>
          </Link>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All Signals' },
            { id: 'unread', label: 'Unread', badge: unread },
            { id: 'order', label: 'Orders & Staging' },
            { id: 'delivery', label: 'Freight & Dispatch' },
            { id: 'payment', label: 'Invoices & SVAT' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as CategoryTab)}
                className={`h-8 px-3 text-xs font-mono tracking-wide transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-ink text-volt font-bold shadow-sm'
                    : 'bg-paper text-ink-3 border border-ink/15 hover:border-ink hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${active ? 'bg-volt text-ink' : 'bg-volt/20 text-ink'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {notes.length > 0 && (
          <div className="relative min-w-[220px]">
            <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="text"
              placeholder="Filter notifications…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 bg-paper border border-ink/15 text-xs text-ink placeholder:text-ink-4 outline-none focus:border-ink"
            />
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-paper border border-ink/10 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty State / Signal Guidance Hub (When 0 notifications) */}
      {!isLoading && notes.length === 0 && (
        <div className="space-y-8">
          <div className="bg-paper border border-ink/15 p-8 sm:p-12 text-center space-y-6 shadow-sm">
            <div className="size-14 bg-ink text-volt mx-auto flex items-center justify-center shadow-md">
              <BellIcon size={28} />
            </div>

            <div className="space-y-2 max-w-lg mx-auto">
              <div className="vyro-kicker text-copper">Activity Stream Clear</div>
              <h3 className="vyro-display text-2xl sm:text-3xl text-ink font-bold">
                No active signals yet
              </h3>
              <p className="text-sm text-ink-3 leading-relaxed">
                As soon as you issue purchase orders, assign deliveries, or receive SVAT digital invoices, real-time audit updates and driver plate assignments will surface here.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link to="/search">
                <Button className="bg-ink text-paper hover:bg-charcoal px-6 py-2.5 text-xs uppercase tracking-wider font-bold">
                  <SearchIcon size={14} />
                  <span>Browse Wholesale Catalog</span>
                </Button>
              </Link>
              <Link to="/orders">
                <Button variant="secondary" className="px-5 py-2.5 text-xs uppercase tracking-wider font-semibold">
                  <PackageIcon size={14} className="text-copper" />
                  <span>View Purchase Orders</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Real-time Signals Architecture */}
          <div className="space-y-3">
            <div className="vyro-kicker text-copper">Automated Signal Lifecycle</div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="p-5 bg-paper border border-ink/10 space-y-2">
                <div className="size-8 bg-bone text-ink flex items-center justify-center">
                  <TruckIcon size={18} className="text-copper" />
                </div>
                <h4 className="font-display font-semibold text-ink text-sm">
                  Driver Plate & Freight Dispatch
                </h4>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Real-time alerts when supplier warehouses stage orders, assign commercial vehicle plate numbers, and commence route transit.
                </p>
              </div>

              <div className="p-5 bg-paper border border-ink/10 space-y-2">
                <div className="size-8 bg-bone text-ink flex items-center justify-center">
                  <PackageIcon size={18} className="text-volt-deep" />
                </div>
                <h4 className="font-display font-semibold text-ink text-sm">
                  Dockside Goods Receipt (GRN)
                </h4>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Instant prompt when pallets reach your receiving facility for digital delivery confirmation and discrepancy logging.
                </p>
              </div>

              <div className="p-5 bg-paper border border-ink/10 space-y-2">
                <div className="size-8 bg-bone text-ink flex items-center justify-center">
                  <FileTextIcon size={18} className="text-mint" />
                </div>
                <h4 className="font-display font-semibold text-ink text-sm">
                  SVAT Digital Tax Invoices
                </h4>
                <p className="text-xs text-ink-3 leading-relaxed">
                  Automated electronic tax invoices and settlement confirmations issued directly to your commercial finance ledger.
                </p>
              </div>
            </div>
          </div>

          {/* Active Delivery Channels Card */}
          <div className="p-4 bg-bone/60 border border-ink/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon size={16} className="text-volt-deep shrink-0" />
              <div className="text-ink-3">
                <span className="font-semibold text-ink">Connected Channels:</span> In-App Stream (Active) · Primary Email ({user.email}) · Sri Lanka SMS Gateway
              </div>
            </div>
            <span className="text-[10px] font-mono text-ink-4">Instant Broadcast Ready</span>
          </div>
        </div>
      )}

      {/* Filtered Empty State */}
      {!isLoading && notes.length > 0 && filteredNotes.length === 0 && (
        <EmptyState
          icon={<BellIcon size={20} />}
          title="No signals match this filter"
          description={`No activity alerts found under "${activeTab}" tab matching "${searchQuery}".`}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setActiveTab('all');
                setSearchQuery('');
              }}
            >
              Reset Filters
            </Button>
          }
        />
      )}

      {/* Notification Signal Items */}
      {!isLoading && filteredNotes.length > 0 && (
        <div className="space-y-3">
          {filteredNotes.map((n) => {
            const isUnread = !n.readAt;
            return (
              <div
                key={n.id}
                className={`bg-paper border transition-all duration-150 p-4 sm:p-5 flex items-start justify-between gap-4 shadow-sm ${
                  isUnread
                    ? 'border-ink/30 bg-paper/95 border-l-4 border-l-volt'
                    : 'border-ink/10 opacity-75 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className="size-9 bg-bone border border-ink/10 flex items-center justify-center shrink-0 mt-0.5">
                    {getNotificationIcon(n.type)}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isUnread && (
                        <span className="size-2 rounded-full bg-volt shrink-0 animate-pulse" title="Unread" />
                      )}
                      <h4 className="font-display font-semibold text-base text-ink leading-snug">
                        {n.title}
                      </h4>
                      <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 bg-mist text-ink-3 font-bold border border-line">
                        {n.type}
                      </span>
                    </div>

                    {n.body && (
                      <p className="text-xs sm:text-sm text-ink-3 leading-relaxed">
                        {n.body}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] font-mono text-ink-4">
                      <span>{formatRelativeTime(n.createdAt)}</span>
                      <span>·</span>
                      <span>{new Date(n.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                      {n.link && (
                        <>
                          <span>·</span>
                          <Link
                            to={n.link}
                            className="text-copper hover:text-ink font-semibold flex items-center gap-1 transition-colors"
                          >
                            <span>Open Details</span>
                            <ArrowRightIcon size={12} />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isUnread && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => mark.mutate(n.id)}
                      className="text-[11px] font-semibold px-2.5 py-1 bg-bone hover:bg-paper"
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {data?.nextCursor && (
            <div className="pt-4 flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setCursor(data.nextCursor)}
                className="text-xs uppercase tracking-wider font-semibold"
              >
                Load Older Signals
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
