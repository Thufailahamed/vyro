import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, StatusBadge, Button, EmptyState } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import {
  PackageIcon,
  ClockIcon,
  ChevronRightIcon,
  SearchIcon,
  Building2Icon,
  FileTextIcon,
} from '@/components/icons';

interface Order {
  id: string;
  poNumber: string;
  supplierId: string;
  status: string;
  totalCents: number;
  currency: string;
  createdAt: number;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'All Orders' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed', label: 'Disputed' },
];

export function OrdersPage() {
  const { user } = useAuth();
  const businessId = user?.memberships?.[0]?.businessId;
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?businessId=${businessId}`),
    enabled: !!businessId,
  });

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <PackageIcon size={32} className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">Sign in to view orders</h2>
          <p className="text-xs text-slate-500">Access your historical and active purchase orders.</p>
          <Link to="/login">
            <Button>Sign In</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <Building2Icon size={32} className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">No Business Registered</h2>
          <p className="text-xs text-slate-500">Set up your business to begin ordering and track procurement history.</p>
          <Link to="/onboarding/business">
            <Button>Register Business</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto py-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse border border-slate-200" />
      </div>
    );
  }

  const allOrders = data?.orders ?? [];
  const filteredOrders =
    filter === 'all'
      ? allOrders
      : allOrders.filter((o) => o.status.toLowerCase() === filter.toLowerCase());

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <header>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-cyan/15 text-cyan-deep">Orders</span>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-950 text-balance">
          My purchase orders
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor incoming fulfillment milestones, delivery receipts, and supplier status updates.
        </p>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((tab) => {
          const count =
            tab.id === 'all'
              ? allOrders.length
              : allOrders.filter((o) => o.status.toLowerCase() === tab.id).length;
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`inline-flex items-center gap-2 h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
                active
                  ? 'bg-slate-950 text-white border-slate-950'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-950'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold num-tabular ${
                  active ? 'bg-cyan text-slate-950' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={<PackageIcon size={28} />}
          title={filter === 'all' ? 'No orders placed yet' : `No ${filter} orders`}
          description={
            filter === 'all'
              ? 'Find verified wholesale items from our catalog and create your first purchase order.'
              : `You have no orders currently in "${filter}" state.`
          }
          action={
            <Link to="/search">
              <Button>
                <SearchIcon size={16} /> Search Products
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((o) => (
            <Card
              key={o.id}
              hoverEffect
              className="p-5 border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-sm text-slate-950 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 group-hover:border-cyan/50 transition-colors">
                    {o.poNumber}
                  </span>
                  <StatusBadge status={o.status} />
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ClockIcon size={13} className="text-slate-400" />
                  <span>Placed on {new Date(o.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}</span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0">
                <div className="text-left sm:text-right">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    PO Value
                  </div>
                  <div className="text-lg font-black text-slate-900">
                    {formatLKR(o.totalCents)}
                  </div>
                </div>

                <Link to={`/orders/${o.id}`}>
                  <Button variant="outline" size="sm" className="group-hover:border-brand-300 group-hover:text-brand-700">
                    <span>Details</span>
                    <ChevronRightIcon size={15} />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
