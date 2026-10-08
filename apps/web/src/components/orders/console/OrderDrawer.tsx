import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, StatusDots, type OrderStatus } from '@/components/ui';
import { PaymentStateBadge } from '@/components/orders/LifecycleUi';
import { ArrowRightIcon, ClockIcon, MapPinIcon, XIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';
import type { ConsoleOrderDetail } from './types';

function DrawerSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-ink/[0.05]" />
      ))}
      <div className="h-14 animate-pulse rounded-xl bg-ink/[0.07]" />
    </div>
  );
}

export function OrderDrawer({ poId, onClose }: { poId: string; onClose: () => void }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const query = useQuery({
    queryKey: ['purchase-order', poId],
    queryFn: () => api.get<ConsoleOrderDetail>(`/purchase-orders/${poId}`),
  });

  const detail = query.data;
  const order = detail?.order;

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick order view" className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-ink/45 backdrop-blur-sm transition-opacity duration-320 ease-vyro ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-line bg-paper shadow-soft-xl transition-transform duration-320 ease-vyro ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Spec header */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-ink-4">
              <span className="size-1.5 rounded-full bg-volt" />
              Purchase Order Specification
            </div>
            {order ? (
              <>
                <h2 className="vyro-display mt-1.5 truncate text-xl text-ink">{order.poNumber}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  <StatusDots status={(order.status as OrderStatus) ?? 'pending'} />
                  <PaymentStateBadge state={order.paymentState} />
                </div>
              </>
            ) : (
              <div className="mt-2 h-6 w-44 animate-pulse rounded-md bg-ink/[0.06]" />
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick view"
            className="rounded-lg p-2 text-ink-4 transition-colors duration-200 hover:bg-mist hover:text-ink"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5 sm:px-7">
          {query.isLoading ? (
            <DrawerSkeleton />
          ) : detail && order ? (
            <>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-ink">
                  Ordered Line Items
                </div>
                <span className="font-mono text-[11px] text-ink-4">
                  {detail.items.length} line{detail.items.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {detail.items.map((item) => {
                  const name = item.productNameSnapshot ?? item.productName ?? 'Line item';
                  const unitCents = item.unitPriceCentsSnapshot ?? item.unitPriceCents ?? 0;
                  const total = item.lineTotalCents ?? item.totalCents ?? 0;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-4 p-4 transition-colors duration-200 hover:bg-bone/60"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{name}</div>
                        <div className="mt-1 font-mono text-[11px] text-ink-4">
                          {item.quantity} {item.unit ?? 'units'} @ {formatLKR(unitCents)}
                        </div>
                      </div>
                      <div className="vyro-metric shrink-0 text-sm font-bold text-ink">
                        {formatLKR(total)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-bone px-5 py-4">
                <span className="text-xs font-bold uppercase tracking-[0.1em] text-ink">Order Net Total</span>
                <span className="vyro-metric text-xl font-bold text-ink">{formatLKR(order.totalCents)}</span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-paper p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
                    <MapPinIcon size={11} className="text-copper" />
                    Dock Destination
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-ink">
                    {order.deliveryCity
                      ? `${order.deliveryCity}${order.deliveryDistrict ? `, ${order.deliveryDistrict}` : ''}`
                      : 'Commercial Dock Delivery'}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-paper p-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
                    <ClockIcon size={11} />
                    Placed
                  </div>
                  <div className="mt-1.5 font-mono text-sm font-semibold text-ink">
                    {new Date(order.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4 sm:px-7">
          <Link
            to={`/supplier/orders/${poId}`}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-copper transition-colors duration-200 hover:text-copper-deep"
          >
            Open full order
            <ArrowRightIcon
              size={12}
              className="transition-transform duration-200 ease-vyro group-hover:translate-x-0.5"
            />
          </Link>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  );
}
