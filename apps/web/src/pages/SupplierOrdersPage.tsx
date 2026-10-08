import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@vyro/ui';
import { useSupplierId } from '@/supplier/useSupplierId';
import { SupplierErrorState, SupplierLoadingState } from '@/supplier/SupplierPageState';
import { lifecycleErrorMessage } from '@/lib/orderLifecycle';
import { PodDialog, ReasonDialog } from '@/components/orders/LifecycleUi';
import {
  ConsoleHero,
  KpiMatrix,
  OrderDrawer,
  OrderRow,
  PipelineRadar,
  QueueEmpty,
  QueueToolbar,
  type ConsoleOrder,
  type QueueTab,
} from '@/components/orders/console';

interface Offer {
  id: string;
  productId: string;
  active: boolean;
}

const NEXT: Record<string, string | null> = {
  pending: 'accepted',
  accepted: 'preparing',
  preparing: 'ready_for_pickup',
  ready_for_pickup: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

const NEXT_LABEL: Record<string, string> = {
  accepted: 'Accept PO',
  preparing: 'Start Prep',
  ready_for_pickup: 'Ready for Pickup',
  out_for_delivery: 'Dispatch Delivery',
  delivered: 'Confirm Delivered',
};

export function SupplierOrdersPage() {
  const { supplierId, supplierName } = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState<QueueTab>('all');
  const [activeDrawerPoId, setActiveDrawerPoId] = useState<string | null>(null);
  const [rejectPo, setRejectPo] = useState<ConsoleOrder | null>(null);
  const [podPoId, setPodPoId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'po'],
    queryFn: () => api.get<{ orders: ConsoleOrder[] }>(`/purchase-orders?supplierId=${supplierId}`),
    enabled: !!supplierId,
    refetchInterval: 30_000,
  });

  const offersQuery = useQuery({
    queryKey: ['supplier', supplierId, 'offers'],
    queryFn: () => api.get<{ offers: Offer[] }>(`/supplier-products/by-supplier/${supplierId}`),
    enabled: !!supplierId,
  });

  async function refreshOrder(poId: string) {
    await qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'po'] });
    void qc.invalidateQueries({ queryKey: ['supplier-order', poId] });
    if (activeDrawerPoId === poId) {
      await qc.invalidateQueries({ queryKey: ['purchase-order', activeDrawerPoId] });
    }
  }

  async function transition(poId: string, to: string, reason?: string) {
    setBusyId(poId);
    try {
      await api.post(
        `/purchase-orders/${poId}/transition`,
        { to, ...(reason ? { reason } : {}) },
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.show(toast.success(`Order advanced to ${to.replace(/_/g, ' ')}`));
      await refreshOrder(poId);
    } catch (e) {
      if (reason) throw e; // shown inline by the reason dialog
      if (e instanceof ApiError && e.code === 'POD_REQUIRED') {
        setPodPoId(poId);
      } else {
        toast.show(toast.error(lifecycleErrorMessage(e, 'Transition failed')));
      }
    } finally {
      setBusyId(null);
    }
  }

  /** Quick accept = accept every line in full; partial acceptance lives on the order page. */
  async function acceptInFull(poId: string) {
    setBusyId(poId);
    try {
      await api.post(`/purchase-orders/${poId}/accept`, {}, { idempotencyKey: crypto.randomUUID() });
      toast.show(toast.success('Order accepted'));
      await refreshOrder(poId);
    } catch (e) {
      toast.show(toast.error(lifecycleErrorMessage(e, 'Could not accept the order')));
    } finally {
      setBusyId(null);
    }
  }

  const handleRefresh = async () => {
    toast.show(toast.info('Syncing orders with network…'));
    await ordersQuery.refetch();
    toast.show(toast.success('Orders up to date'));
  };

  const orders = ordersQuery.data?.orders ?? [];
  const offers = offersQuery.data?.offers ?? [];

  const pending = useMemo(() => orders.filter((o) => o.status === 'pending'), [orders]);
  const inFulfillment = useMemo(
    () => orders.filter((o) => ['accepted', 'preparing', 'ready_for_pickup'].includes(o.status)),
    [orders],
  );
  const inTransit = useMemo(
    () => orders.filter((o) => o.status === 'out_for_delivery'),
    [orders],
  );
  const done = useMemo(
    () => orders.filter((o) => ['delivered', 'completed', 'rejected', 'cancelled', 'disputed'].includes(o.status)),
    [orders],
  );

  const acceptedCount = useMemo(() => orders.filter((o) => o.status === 'accepted').length, [orders]);
  const preparingCount = useMemo(
    () => orders.filter((o) => ['preparing', 'ready_for_pickup'].includes(o.status)).length,
    [orders],
  );

  const filteredOrders = useMemo(() => {
    let base = orders;
    if (tab === 'incoming') base = pending;
    else if (tab === 'fulfillment') base = [...inFulfillment, ...inTransit];
    else if (tab === 'completed') base = done;

    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter(
      (o) =>
        o.poNumber.toLowerCase().includes(q) ||
        o.deliveryCity?.toLowerCase().includes(q) ||
        o.deliveryDistrict?.toLowerCase().includes(q),
    );
  }, [orders, tab, pending, inFulfillment, inTransit, done, searchQuery]);

  const revenue = orders.reduce((a, b) => a + b.totalCents, 0);

  if (ordersQuery.isLoading) return <SupplierLoadingState label="Connecting to order console" />;
  if (ordersQuery.isError) {
    return (
      <SupplierErrorState
        message="Could not load purchase orders."
        onRetry={() => void ordersQuery.refetch()}
      />
    );
  }

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      <ConsoleHero
        supplierName={supplierName}
        pending={pending.length}
        inFulfillment={inFulfillment.length}
        inTransit={inTransit.length}
        isFetching={ordersQuery.isFetching}
        onRefresh={() => void handleRefresh()}
      />

      <KpiMatrix
        pending={pending.length}
        inFulfillment={inFulfillment.length}
        inTransit={inTransit.length}
        revenueCents={revenue}
      />

      <PipelineRadar
        incoming={pending.length}
        accepted={acceptedCount}
        preparing={preparingCount}
        dispatched={inTransit.length}
        total={orders.length}
      />

      <section className="space-y-4">
        <QueueToolbar
          tab={tab}
          onTabChange={setTab}
          counts={{
            all: orders.length,
            incoming: pending.length,
            fulfillment: inFulfillment.length + inTransit.length,
            completed: done.length,
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {filteredOrders.length === 0 ? (
          <QueueEmpty
            searchQuery={searchQuery}
            offersCount={offers.length}
            onClearSearch={() => setSearchQuery('')}
          />
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((o, i) => {
              const next = NEXT[o.status] ?? null;
              return (
                <OrderRow
                  key={o.id}
                  order={o}
                  index={i}
                  busy={busyId === o.id}
                  next={next}
                  nextLabel={next ? NEXT_LABEL[next] : undefined}
                  onAccept={() => void acceptInFull(o.id)}
                  onReject={() => setRejectPo(o)}
                  onAdvance={() => {
                    if (!next) return;
                    if (next === 'delivered') setPodPoId(o.id);
                    else void transition(o.id, next);
                  }}
                  onQuickView={() => setActiveDrawerPoId(o.id)}
                />
              );
            })}
          </div>
        )}
      </section>

      <ReasonDialog
        open={!!rejectPo}
        title="Reject purchase order"
        {...(rejectPo ? { subtitle: rejectPo.poNumber } : {})}
        description="The buyer will see your reason."
        confirmLabel="Reject order"
        placeholder="e.g. Out of stock until next month"
        onClose={() => setRejectPo(null)}
        onSubmit={(reason) => transition(rejectPo!.id, 'rejected', reason)}
      />

      {podPoId && (
        <PodDialog
          open
          poId={podPoId}
          onClose={() => setPodPoId(null)}
          onCaptured={async () => {
            await api.post(
              `/purchase-orders/${podPoId}/transition`,
              { to: 'delivered' },
              { idempotencyKey: crypto.randomUUID() },
            );
            toast.show(toast.success('Marked delivered'));
            await refreshOrder(podPoId);
          }}
        />
      )}

      {activeDrawerPoId && (
        <OrderDrawer poId={activeDrawerPoId} onClose={() => setActiveDrawerPoId(null)} />
      )}
    </div>
  );
}
