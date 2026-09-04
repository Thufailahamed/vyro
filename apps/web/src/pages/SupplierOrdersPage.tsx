import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatLKR } from '@/lib/format';
import {
  StoreIcon,
  CheckCircleIcon,
  XIcon,
  ClockIcon,
  ChevronRightIcon,
  AlertCircleIcon,
} from '@/components/icons';

interface Order {
  id: string;
  poNumber: string;
  status: string;
  totalCents: number;
  createdAt: number;
}

export function SupplierOrdersPage() {
  const { user } = useAuth();
  const supplierId = user?.supplierMemberships?.[0]?.supplierId;
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['supplier-orders', supplierId],
    queryFn: () => api.get<{ orders: Order[] }>(`/purchase-orders?supplierId=${supplierId}`),
    enabled: !!supplierId,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function transition(poId: string, to: string) {
    setBusyId(poId);
    try {
      await api.post(`/purchase-orders/${poId}/transition`, { to });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  if (!user || !supplierId) {
    return (
      <div className="max-w-md mx-auto py-12 text-center">
        <Card className="p-8 space-y-4">
          <StoreIcon size={32} className="mx-auto text-slate-400" />
          <h2 className="text-xl font-bold text-slate-800">Supplier Access Required</h2>
          <p className="text-xs text-slate-500">Sign in with an authorized supplier account to access the merchant orders inbox.</p>
          <Link to="/onboarding/supplier">
            <Button>List as Supplier</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto py-4">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-48 bg-slate-100 rounded-2xl animate-pulse border border-slate-200" />
      </div>
    );
  }

  const pending = data?.orders.filter((o) => o.status === 'pending') ?? [];
  const active = data?.orders.filter((o) => o.status !== 'pending') ?? [];

  return (
    <div className="space-y-10 max-w-6xl mx-auto">
      <header>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider bg-cyan/15 text-cyan-deep mb-3">
          <StoreIcon size={12} /> Merchant operations
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-950 text-balance">
          Supplier order inbox
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review incoming purchase orders from Sri Lankan buyers, confirm acceptance, and update fulfillment milestones.
        </p>
      </header>

      {/* Pending Incoming Orders Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <span className="size-7 rounded-md bg-amber/15 text-amber inline-flex items-center justify-center"><AlertCircleIcon size={14} /></span>
            <h2 className="text-lg font-semibold text-slate-950">Awaiting acceptance</h2>
            {pending.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber text-white animate-pulse num-tabular">
                {pending.length} NEW
              </span>
            )}
          </div>
          <span className="text-xs text-slate-500 font-mono">24h SLA target</span>
        </div>

        {pending.length === 0 ? (
          <Card className="p-10 text-center text-slate-500 bg-pearl border-slate-200">
            <CheckCircleIcon size={28} className="mx-auto text-mint mb-3" />
            <h3 className="font-semibold text-slate-950 text-base">All caught up</h3>
            <p className="text-xs text-slate-500 mt-1">No pending purchase orders waiting for your review.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((o) => (
              <Card
                key={o.id}
                hoverEffect
                className="p-5 border-l-4 border-l-amber bg-paper border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-soft-sm"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-sm text-slate-950 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                      {o.poNumber}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ClockIcon size={13} className="text-slate-400" />
                    <span className="num-tabular">Received {new Date(o.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 border-t sm:border-t-0 pt-3 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Order value
                    </div>
                    <div className="text-xl font-bold font-mono text-slate-950 num-tabular">
                      {formatLKR(o.totalCents)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      disabled={busyId === o.id}
                      loading={busyId === o.id}
                      onClick={() => transition(o.id, 'accepted')}
                    >
                      <CheckCircleIcon size={14} /> Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId === o.id}
                      onClick={() => transition(o.id, 'rejected')}
                    >
                      <XIcon size={14} /> Reject
                    </Button>
                    <Link to={`/orders/${o.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Active & Completed Orders History */}
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Fulfillment & History</h2>
          <span className="text-xs text-slate-500">{active.length} order{active.length === 1 ? '' : 's'}</span>
        </div>

        {active.length === 0 ? (
          <Card className="p-8 text-center text-slate-500 bg-slate-50/60 border-slate-200">
            <p className="text-xs text-slate-500">No historical purchase orders recorded yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {active.map((o) => (
              <Card
                key={o.id}
                hoverEffect
                className="p-5 border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                      {o.poNumber}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ClockIcon size={13} className="text-slate-400" />
                    <span>{new Date(o.createdAt).toLocaleString('en-US', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 border-t sm:border-t-0 pt-3 sm:pt-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Amount
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
    </div>
  );
}
