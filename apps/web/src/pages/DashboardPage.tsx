import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { TimeSeries } from '@/components/ui';
import { Button } from '@/components/ui';
import { MetricStack, StatusDots } from '@/components/ui';
import type { OrderStatus } from '@/components/ui';
import { PackageIcon, ShoppingCartIcon, TruckIcon, AlertCircleIcon, StoreIcon } from '@/components/icons';
import { formatCompactLKR, formatLKR, greetingForNow } from '@/lib/format';
import { FlowLine } from '@/components/brand/FlowLine';
import { MetricNumber, Surface } from '@/components/brand/Surface';

interface OrderRow {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
  supplierName?: string;
  supplierId?: string;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DashboardPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const businessName = user?.memberships?.[0]?.businessName;

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['business-orders-dash', businessId],
    queryFn: () => api.get<{ orders: OrderRow[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: spendData } = useQuery({
    queryKey: ['business-monthly-spend', businessId],
    queryFn: () =>
      api.get<{ buckets: { month: string; totalCents: number }[] }>(
        `/analytics/business/monthly-spend?months=12`
      ),
    enabled: !!businessId,
  });

  const orders = ordersData?.orders ?? [];
  const stats = useMemo(() => {
    const inFlight = orders.filter((o) => ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery'].includes(o.status)).length;
    const completed = orders.filter((o) => o.status === 'completed').length;
    const disputed = orders.filter((o) => o.status === 'disputed').length;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const lifetimeCents = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((a, b) => a + b.totalCents, 0);
    return { total: orders.length, inFlight, completed, disputed, pending, lifetimeCents };
  }, [orders]);

  const monthlyBuckets = spendData?.buckets ?? [];
  const monthlyValues = monthlyBuckets.map((b) => b.totalCents);
  const monthlyLabels = monthlyBuckets.map((b) => {
    const [, mm] = b.month.split('-');
    return MONTH_LABELS[Number(mm) - 1] ?? b.month;
  });
  const recent = orders.slice(0, 6);

  if (!user) {
    return (
      <div className="max-w-xl py-12">
        <div className="vyro-kicker">Command</div>
        <h2 className="mt-2 vyro-display text-4xl">Sign in to your command center.</h2>
        <p className="mt-3 text-ink-4">Procurement, orders and supplier movement live here.</p>
        <Link to="/login" className="mt-6 inline-block">
          <Button>Sign in</Button>
        </Link>
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="max-w-xl py-12">
        <div className="vyro-kicker">Command</div>
        <h2 className="mt-2 vyro-display text-4xl">Connect a business first.</h2>
        <p className="mt-3 text-ink-4">Associate this account with a business to open the command center.</p>
        <Link to="/onboarding/business" className="mt-6 inline-block">
          <Button>Register business</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="grid lg:grid-cols-[1.4fr_0.8fr] gap-6 items-end">
        <div>
          <div className="vyro-kicker">{businessName}</div>
          <h1 className="mt-2 vyro-display text-4xl sm:text-5xl text-balance">
            {greetingForNow()}. Here’s your business.
          </h1>
        </div>
        <Link to="/search" className="lg:justify-self-end">
          <Button>Start procurement</Button>
        </Link>
      </header>

      <div className="grid lg:grid-cols-12 gap-4">
        <Surface kind="ink" className="lg:col-span-7 p-8 sm:p-10 relative overflow-hidden">
          <div className="text-[11px] uppercase tracking-[0.16em] text-volt">Lifetime spend</div>
          <MetricNumber size="xl" className="mt-3 text-paper">
            {formatCompactLKR(stats.lifetimeCents)}
          </MetricNumber>
          <p className="mt-3 text-paper/50 text-sm">{stats.total} purchase orders on record</p>
          <div className="mt-8">
            <FlowLine
              tone="paper"
              nodes={[
                { label: 'Procurement', state: 'done' },
                { label: 'Orders', state: stats.inFlight ? 'active' : 'done' },
                { label: 'Delivery', state: stats.inFlight ? 'active' : 'idle' },
                { label: 'Business', state: 'idle' },
              ]}
            />
          </div>
        </Surface>

        <Surface kind="floating" className="lg:col-span-5 p-7">
          <div className="vyro-kicker">Pending actions</div>
          <MetricStack
            className="mt-5"
            items={[
              { label: 'Awaiting supplier', value: String(stats.pending), accent: stats.pending > 0 ? 'amber' : 'ink' },
              { label: 'In movement', value: String(stats.inFlight), accent: 'volt' },
              { label: 'Disputes', value: String(stats.disputed), accent: stats.disputed > 0 ? 'rose' : 'ink' },
            ]}
          />
          <Link to="/orders" className="mt-6 inline-block text-sm text-copper">
            Review orders →
          </Link>
        </Surface>

        <Surface kind="flat" className="lg:col-span-8 p-6 sm:p-8">
          <div className="flex items-end justify-between mb-6">
            <div>
              <h2 className="font-display text-2xl">Procurement activity</h2>
              <p className="text-xs text-ink-4 mt-1">Monthly wholesale movement</p>
            </div>
            <span className="vyro-metric text-lg text-copper">{formatCompactLKR(monthlyValues.reduce((a, b) => a + b, 0))}</span>
          </div>
          <TimeSeries values={monthlyValues} labels={monthlyLabels} tone="cyan" height={168} formatValue={(v: number) => formatLKR(v)} />
        </Surface>

        <Surface kind="split" className="lg:col-span-4 grid grid-rows-3">
          <SplitStat label="Active orders" value={String(stats.inFlight)} />
          <SplitStat label="Completed" value={String(stats.completed)} />
          <SplitStat
            label="Suppliers engaged"
            value={String(new Set(orders.map((o) => o.supplierId ?? o.supplierName ?? '').filter(Boolean)).size)}
          />
        </Surface>

        <Surface kind="flat" className="lg:col-span-4 p-6 space-y-3">
          <h2 className="font-display text-lg">Action queue</h2>
          <ActionRow icon={TruckIcon} label="In transit" value={stats.inFlight} />
          <ActionRow icon={PackageIcon} label="Awaiting your action" value={stats.pending} />
          <ActionRow icon={AlertCircleIcon} label="Disputed" value={stats.disputed} danger />
        </Surface>

        <Surface kind="flat" className="lg:col-span-7 p-0 overflow-hidden">
          <div className="px-6 py-5 flex items-center justify-between border-b border-ink/10">
            <h2 className="font-display text-xl">Live orders</h2>
            <Link to="/orders" className="text-xs text-copper">
              All
            </Link>
          </div>
          {isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-mist animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="p-10 text-center">
              <PackageIcon size={22} className="mx-auto text-ink-4" />
              <p className="mt-2 text-sm text-ink-4">No orders yet.</p>
            </div>
          ) : (
            <ul>
              {recent.map((o) => (
                <li key={o.id} className="border-b border-ink/5 last:border-0">
                  <Link to={`/orders/${o.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-mist/60">
                    <span className="vyro-metric text-sm w-28 truncate">{o.poNumber}</span>
                    <span className="flex-1">
                      <StatusDots status={(o.status as OrderStatus) ?? 'pending'} />
                    </span>
                    <span className="vyro-metric text-sm">{formatCompactLKR(o.totalCents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface kind="ink" className="lg:col-span-5 p-7 flex flex-col justify-between">
          <div>
            <StoreIcon size={18} className="text-volt" />
            <h2 className="mt-4 font-display text-2xl text-paper">Supplier activity</h2>
            <p className="mt-2 text-sm text-paper/50">Savings appear as you compare and choose best-value offers.</p>
          </div>
          <Link to="/search" className="mt-8 inline-flex items-center gap-2 text-volt text-sm">
            <ShoppingCartIcon size={14} /> Open catalog
          </Link>
        </Surface>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof TruckIcon;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm text-ink-3">
        <Icon size={14} />
        {label}
      </span>
      <span className={`vyro-metric text-xl ${danger && value > 0 ? 'text-rose' : 'text-ink'}`}>{value}</span>
    </div>
  );
}

function SplitStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 border-b border-ink/10 last:border-0">
      <div className="text-[11px] uppercase tracking-[0.14em] text-ink-4">{label}</div>
      <MetricNumber size="md" className="mt-1">
        {value}
      </MetricNumber>
    </div>
  );
}
