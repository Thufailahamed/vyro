import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, StatusDots, type OrderStatus } from '@/components/ui';
import { PaymentStateBadge } from '@/components/orders/LifecycleUi';
import { ArrowRightIcon, CalendarIcon, MapPinIcon, PackageIcon, XIcon } from '@/components/icons';
import { OrderProgress } from '@/components/orders/OrderProgress';
import { statusLabel } from '@/lib/orderLifecycle';
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

  const lineCount = detail?.items.length ?? 0;
  const recent = detail ? [...detail.events].reverse().slice(0, 4) : [];

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick order view" className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-ink/45 backdrop-blur-sm transition-opacity duration-320 ease-vyro ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-paper shadow-soft-xl transition-transform duration-320 ease-vyro ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Ink header */}
        <div className="grain relative overflow-hidden bg-ink px-6 pb-6 pt-5 text-paper sm:px-7">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-volt/[0.14] blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 size-56 rounded-full bg-copper/[0.2] blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-volt">
                <PackageIcon size={12} />
                Quick view
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close quick view"
                className="rounded-lg p-1.5 text-paper/50 transition-colors duration-200 hover:bg-paper/10 hover:text-paper"
              >
                <XIcon size={18} />
              </button>
            </div>

            {order ? (
              <>
                <h2 className="vyro-display mt-3 truncate text-2xl text-paper">{order.poNumber}</h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-paper/15 bg-paper/[0.07] px-2.5 py-0.5 text-paper [&_span]:!text-paper">
                    <StatusDots status={(order.status as OrderStatus) ?? 'pending'} />
                  </span>
                  <PaymentStateBadge state={order.paymentState} />
                </div>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper/45">Order total</div>
                    <div className="vyro-metric mt-1 text-3xl leading-none text-paper">{formatLKR(order.totalCents)}</div>
                  </div>
                  <div className="text-right font-mono text-[11px] text-paper/45">
                    {lineCount} line{lineCount === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="mt-5">
                  <OrderProgress status={order.status} events={detail?.events ?? []} tone="dark" compact />
                </div>
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="h-7 w-48 animate-pulse rounded-md bg-paper/10" />
                <div className="h-9 w-36 animate-pulse rounded-md bg-paper/10" />
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-7">
          {query.isLoading ? (
            <DrawerSkeleton />
          ) : detail && order ? (
            <>
              <section>
                <SectionLabel title="Line items" meta={`${lineCount} line${lineCount === 1 ? '' : 's'}`} />
                <div className="mt-3 divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-paper">
                  {detail.items.map((item) => {
                    const name = item.productNameSnapshot ?? item.productName ?? 'Line item';
                    const unitCents = item.unitPriceCentsSnapshot ?? item.unitPriceCents ?? 0;
                    const total = item.lineTotalCents ?? item.totalCents ?? 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 p-3.5 transition-colors duration-200 hover:bg-bone/60"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink font-display text-xs font-bold text-volt">
                          {name.trim().charAt(0).toUpperCase() || '·'}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink">{name}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-ink-4">
                            {item.quantity} {item.unit ?? 'units'} × {formatLKR(unitCents)}
                          </div>
                        </div>
                        <div className="vyro-metric shrink-0 text-sm font-bold text-ink">{formatLKR(total)}</div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between bg-bone/60 px-4 py-3">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink">Net total</span>
                    <span className="vyro-metric text-base font-bold text-ink">{formatLKR(order.totalCents)}</span>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InfoTile icon={<MapPinIcon size={13} />} label="Deliver to">
                  {order.deliveryCity
                    ? `${order.deliveryCity}${order.deliveryDistrict ? `, ${order.deliveryDistrict}` : ''}`
                    : 'Commercial dock delivery'}
                </InfoTile>
                <InfoTile icon={<CalendarIcon size={13} />} label="Placed">
                  <span className="font-mono">
                    {new Date(order.createdAt).toLocaleString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </InfoTile>
              </section>

              {recent.length > 0 && (
                <section>
                  <SectionLabel title="Recent activity" meta={`${detail.events.length} total`} />
                  <ol className="relative mt-3 space-y-3.5">
                    <span aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-ink/10" />
                    {recent.map((e, i) => (
                      <li key={e.id} className="relative flex items-start gap-3">
                        <span
                          className={`relative z-10 mt-1 size-[11px] shrink-0 rounded-full border-2 ${
                            i === 0 ? 'border-ink bg-volt' : 'border-ink/20 bg-paper'
                          }`}
                        />
                        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                          <span className={`text-sm ${i === 0 ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                            {statusLabel(e.toStatus)}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-ink-4">
                            {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-line bg-bone/40 px-6 py-4 sm:px-7">
          <Button variant="ghost" size="md" onClick={onClose}>
            Close
          </Button>
          <Link
            to={`/supplier/orders/${poId}`}
            className="vyro-btn vyro-btn-primary h-10 flex-1 justify-center gap-2 px-4 text-sm"
          >
            Open full order
            <ArrowRightIcon size={15} className="vyro-btn-arrow shrink-0" />
          </Link>
        </div>
      </aside>
    </div>
  );
}

function SectionLabel({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink">{title}</span>
      {meta && <span className="font-mono text-[11px] text-ink-4">{meta}</span>}
    </div>
  );
}

function InfoTile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-copper/10 text-copper">{icon}</span>
      <div className="min-w-0">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-4">{label}</div>
        <div className="mt-1 truncate text-sm font-semibold text-ink">{children}</div>
      </div>
    </div>
  );
}
