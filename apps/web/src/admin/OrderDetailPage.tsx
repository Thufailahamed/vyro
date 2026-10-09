import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { allowedTransitions, type OrderStatus } from '@vyro/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@vyro/ui';
import { api, ApiError } from '@/lib/api';
import { useAdminOrder, type AdminOrder } from './useAdminOrders';
import { Button } from '@/components/ui';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Building2Icon,
  StoreIcon,
  PackageIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  MailIcon,
  PhoneIcon,
  MapPinIcon,
  UserIcon,
  RefreshCwIcon,
  XIcon,
  BanknoteIcon,
  ShieldCheckIcon,
  FileTextIcon,
} from '@/components/icons';
import { formatLKR } from '@/lib/format';
import { PaymentPanel } from '@/components/payments/PaymentPanel';
import { DisputeResolutionPanel } from './DisputeResolutionPanel';
import {
  AdminPage,
  Callout,
  Card,
  EmptyBlock,
  Panel,
  Pill,
  Skeleton,
  StatusPill,
  TableCard,
  controlClass,
} from './ui';
import { CopyId, Monogram, relativeTime } from './registryUi';
import { ORDER_STAGES } from './OrdersPage';

function formatFullDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-5';

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError, isFetching, refetch } = useAdminOrder(id);
  const qc = useQueryClient();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin-order', id] });
    void qc.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  const override = useMutation({
    mutationFn: (body: { status: string; reason: string; expectedUpdatedAt?: number | undefined }) =>
      api.post<{ ok: true }>(`/admin/orders/${id}/override`, body),
    onSuccess: () => {
      setError(null);
      setReason('');
      setSuccessMsg('Status override applied and recorded in security audit trail.');
      invalidate();
    },
    onError: (e: unknown) => {
      setSuccessMsg(null);
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Override failed');
    },
  });

  const order = data?.order;
  const items = data?.items ?? [];
  const events = data?.events ?? [];

  // Only legal admin edges; `disputed` has none (resolved via the dispute panel).
  const overrideOptions = useMemo(
    () => (order?.status ? allowedTransitions(order.status as OrderStatus, 'admin') : []),
    [order?.status],
  );
  useEffect(() => {
    setStatus((cur) => (cur && overrideOptions.includes(cur) ? cur : (overrideOptions[0] ?? '')));
  }, [overrideOptions]);

  if (isLoading) {
    return (
      <AdminPage>
        <Skeleton className="h-52" />
        <Skeleton className="h-28" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      </AdminPage>
    );
  }

  if (isError || !order) {
    return (
      <AdminPage>
        <BackLink />
        <Card>
          <EmptyBlock
            icon={<AlertCircleIcon size={22} />}
            title="Purchase order not found"
            description={
              <>
                No order with ID <code className="font-mono text-ink">{id}</code> exists, or you don't have
                administrative access to it.
              </>
            }
            action={
              <Link to="/admin/orders" className="admin-btn admin-btn-secondary admin-btn-sm">
                Return to orders
                <ArrowRightIcon size={13} />
              </Link>
            }
          />
        </Card>
      </AdminPage>
    );
  }

  const crossBorder = order.direction && order.direction !== 'domestic';
  const itemCount = items.reduce((n, it) => n + it.quantity, 0);

  return (
    <AdminPage>
      {/* Hero */}
      <section className="vyro-surface relative overflow-hidden">
        <div
          className="pointer-events-none absolute -right-32 -top-40 size-96 rounded-full bg-volt/25 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(12,14,11,0.07)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(110deg,transparent_45%,black)]"
          aria-hidden
        />
        <div className="relative p-5 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <BackLink />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              loading={isFetching}
              icon={isFetching ? undefined : <RefreshCwIcon size={13} />}
            >
              Refresh
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-4">
                <span className="size-1.5 rotate-45 bg-volt-deep" aria-hidden />
                Purchase order
              </div>
              <h1 className="mt-2 break-all font-mono text-[1.625rem] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[2rem]">
                {order.poNumber ?? order.id}
              </h1>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <StatusPill status={order.status} />
                {crossBorder ? (
                  <Pill tone={order.direction === 'export' ? 'brand' : 'info'} className="capitalize">
                    {order.direction}
                    {order.incoterms ? ` · ${order.incoterms}` : ''}
                  </Pill>
                ) : (
                  <Pill tone="neutral">Domestic</Pill>
                )}
                <span className="mx-1 h-4 w-px bg-ink/10" aria-hidden />
                <CopyId id={order.id} />
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-4">
                  <ClockIcon size={12} className="text-ink-5" />
                  Placed {formatFullDate(order.createdAt)}
                  {order.updatedAt ? ` · updated ${relativeTime(order.updatedAt)}` : ''}
                </span>
              </div>
            </div>
            <div className="shrink-0 md:text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">Order total</div>
              <div className="vyro-metric mt-1.5 text-[2.25rem] leading-none text-ink">{formatLKR(order.totalCents ?? 0)}</div>
              <div className="mt-2 text-xs text-ink-4">
                {items.length} {items.length === 1 ? 'line' : 'lines'} · {itemCount} units · {order.currency ?? 'LKR'}
              </div>
            </div>
          </div>
        </div>

        <div className="relative border-t border-ink/[0.07] bg-bone/40 px-5 py-5 sm:px-7">
          <LifecycleTracker order={order} />
        </div>
      </section>

      {order.status === 'disputed' ? (
        <Callout tone="danger" title="This order is in dispute">
          {order.disputeReason ? <>&ldquo;{order.disputeReason}&rdquo; — </> : null}
          resolve it from the arbitration panel on the right.
        </Callout>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <PartyCard
              role="Buyer"
              icon={<StoreIcon size={13} />}
              name={order.businessName ?? 'Direct buyer'}
              seed={order.businessId}
              href={order.businessId ? `/admin/businesses/${order.businessId}` : undefined}
              contact={order.businessContactPerson}
              phone={order.businessPhone}
              email={order.businessEmail}
              addressLabel="Delivers to"
              address={order.deliveryAddress || 'No address specified'}
              addressSub={[order.deliveryCity, order.deliveryDistrict].filter(Boolean).join(', ')}
            />
            <PartyCard
              role="Supplier"
              icon={<Building2Icon size={13} />}
              name={order.supplierName ?? 'Direct supplier'}
              seed={order.supplierId}
              href={order.supplierId ? `/admin/suppliers/${order.supplierId}` : undefined}
              contact={order.supplierContactPerson}
              phone={order.supplierPhone}
              email={order.supplierEmail}
              addressLabel="Ships from"
              address={order.supplierAddress}
              addressSub={order.supplierCity}
            />
          </div>

          <TableCard
            title={
              <span className="inline-flex items-center gap-2">
                <PackageIcon size={15} className="text-ink-3" />
                Line items
              </span>
            }
            description={`${items.length} ${items.length === 1 ? 'product' : 'products'} snapshotted at order time`}
            footer={
              items.length > 0 ? (
                <>
                  <span>Subtotal</span>
                  <span className="font-mono text-sm font-semibold text-ink">{formatLKR(order.subtotalCents ?? 0)}</span>
                </>
              ) : undefined
            }
          >
            {items.length === 0 ? (
              <EmptyBlock
                icon={<PackageIcon size={22} />}
                title="No line items"
                description="No line-item snapshot was recorded for this purchase order."
              />
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit price</th>
                    <th className="num">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Monogram name={item.productNameSnapshot} seed={item.supplierProductId} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{item.productNameSnapshot}</div>
                            {item.discountPctSnapshot ? (
                              <div className="mt-0.5 text-xs text-mint">{item.discountPctSnapshot}% discount applied</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="num">× {item.quantity}</td>
                      <td className="num text-ink-3">{formatLKR(item.unitPriceCents)}</td>
                      <td className="num font-semibold">{formatLKR(item.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>

          {order.notes || order.rejectionReason || order.cancelledReason ? (
            <Panel title="Notes & exceptions" icon={<FileTextIcon size={16} />} bodyClassName="space-y-3">
              {order.notes ? (
                <div className="rounded-xl bg-bone/60 p-4 text-sm text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                  <div className={labelClass}>Buyer note</div>
                  {order.notes}
                </div>
              ) : null}
              {order.rejectionReason ? (
                <Callout tone="danger" title="Supplier rejection reason">
                  {order.rejectionReason}
                </Callout>
              ) : null}
              {order.cancelledReason ? (
                <Callout tone="warning" title="Cancellation reason">
                  {order.cancelledReason}
                </Callout>
              ) : null}
            </Panel>
          ) : null}

          <Panel
            title="Audit trail"
            description={`${events.length} lifecycle ${events.length === 1 ? 'event' : 'events'}, newest last`}
            icon={<ClockIcon size={16} />}
          >
            {events.length === 0 ? (
              <p className="text-sm text-ink-4">No lifecycle events recorded yet.</p>
            ) : (
              <ol className="relative">
                {events.map((ev, i) => {
                  const last = i === events.length - 1;
                  return (
                    <li key={ev.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {!last ? (
                        <span className="absolute bottom-0 left-[11px] top-7 w-px bg-ink/10" aria-hidden />
                      ) : null}
                      <span
                        className={cn(
                          'relative z-[1] mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-paper',
                          last ? 'bg-ink text-volt' : 'bg-bone text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12)]',
                        )}
                      >
                        {last ? <span className="size-1.5 rounded-full bg-volt" /> : <CheckIcon size={11} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {ev.fromStatus ? (
                              <>
                                <span className="text-xs text-ink-4">{humanize(ev.fromStatus)}</span>
                                <ArrowRightIcon size={11} className="text-ink-5" />
                              </>
                            ) : null}
                            <StatusPill status={ev.toStatus} />
                          </div>
                          <time className="text-xs text-ink-4" title={formatFullDate(ev.createdAt)}>
                            {formatFullDate(ev.createdAt)}
                          </time>
                        </div>
                        {ev.reason ? (
                          <p className="mt-2 rounded-lg bg-bone/60 px-3 py-2 text-[13px] text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.05)]">
                            {ev.reason}
                          </p>
                        ) : null}
                        {ev.actorUserId ? (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-4">
                            <UserIcon size={11} className="text-ink-5" />
                            <CopyId id={ev.actorUserId} label="Actor" />
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        {/* Sidebar */}
        <aside className="space-y-6">
          <Panel title="Financials" icon={<BanknoteIcon size={16} />}>
            <dl className="space-y-2.5 text-sm">
              <MoneyRow label="Subtotal" cents={order.subtotalCents ?? 0} />
              <MoneyRow label="Delivery fee" cents={order.deliveryFeeCents ?? 0} />
              {order.originalTotalCents != null && order.originalTotalCents !== order.totalCents ? (
                <MoneyRow label="Original total" cents={order.originalTotalCents} muted strike />
              ) : null}
              <div className="flex items-baseline justify-between border-t border-ink/[0.08] pt-3">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="vyro-metric text-xl text-ink">{formatLKR(order.totalCents ?? 0)}</dd>
              </div>
            </dl>
          </Panel>

          <PaymentPanel
            viewer="admin"
            purchaseOrderId={order.id}
            poStatus={order.status}
            totalCents={order.totalCents ?? 0}
            {...(order.businessId ? { businessId: order.businessId } : {})}
            {...(order.supplierId ? { supplierId: order.supplierId } : {})}
            onChanged={invalidate}
          />

          {crossBorder ? (
            <Panel title="Cross-border" icon={<ShieldCheckIcon size={16} />}>
              <dl className="space-y-2.5 text-sm">
                <Row label="Direction">
                  <span className="capitalize">{order.direction}</span>
                </Row>
                {order.incoterms ? <Row label="Incoterms">{order.incoterms}</Row> : null}
                {order.fxSnapshotId ? (
                  <Row label="FX snapshot">
                    <CopyId id={order.fxSnapshotId} label="" />
                  </Row>
                ) : null}
                {order.declaredShippingCostCents != null ? (
                  <Row label="Declared shipping">{formatLKR(order.declaredShippingCostCents)}</Row>
                ) : null}
                {order.declaredDutyCents != null ? <Row label="Declared duty">{formatLKR(order.declaredDutyCents)}</Row> : null}
                {order.commercialInvoiceNo ? <Row label="Commercial invoice">{order.commercialInvoiceNo}</Row> : null}
                {order.customsStatus ? (
                  <Row label="Customs">
                    <StatusPill status={order.customsStatus} />
                  </Row>
                ) : null}
              </dl>
            </Panel>
          ) : null}

          {crossBorder && order.status === 'pending' ? <WireReceivedPanel orderId={order.id} onRecorded={invalidate} /> : null}

          {order.wireRef ? (
            <section className="vyro-surface overflow-hidden">
              <div className="flex items-center gap-2 bg-mint/[0.08] px-5 py-3 text-sm font-semibold text-mint sm:px-6">
                <CheckCircleIcon size={15} />
                Wire settled
              </div>
              <dl className="space-y-2.5 px-5 py-4 text-sm sm:px-6">
                <Row label="Reference">
                  <span className="font-mono text-xs">{order.wireRef}</span>
                </Row>
                {order.wireReceivedCurrency && order.wireReceivedAmountCents != null ? (
                  <Row label="Received">
                    {(order.wireReceivedAmountCents / 100).toLocaleString()} {order.wireReceivedCurrency}
                  </Row>
                ) : null}
                {order.wireReceivedAt ? <Row label="At">{formatFullDate(order.wireReceivedAt)}</Row> : null}
              </dl>
            </section>
          ) : null}

          {order.status === 'disputed' ? (
            <Panel
              title="Dispute arbitration"
              description="The only exit from the disputed state."
              icon={<AlertCircleIcon size={16} className="text-rose" />}
              className="shadow-[inset_0_0_0_1px_rgba(196,90,74,0.3)]"
            >
              <DisputeResolutionPanel
                poId={order.id}
                totalCents={order.totalCents ?? 0}
                defaultOpen
                onResolved={invalidate}
              />
            </Panel>
          ) : null}

          {overrideOptions.length > 0 ? (
            <Panel
              title="Administrative override"
              description="Moves the order along a legal lifecycle edge with the full pipeline (refunds, stock, notifications). Every override is signed and audited."
              icon={<AlertCircleIcon size={16} className="text-amber" />}
            >
              {successMsg ? (
                <Callout tone="success" className="mb-4">
                  {successMsg}
                </Callout>
              ) : null}
              {error ? (
                <Callout tone="danger" className="mb-4">
                  {error}
                </Callout>
              ) : null}
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!status) return;
                  override.mutate({
                    status,
                    reason,
                    ...(order.updatedAt ? { expectedUpdatedAt: order.updatedAt } : {}),
                  });
                }}
              >
                <div>
                  <label htmlFor="override-status" className={labelClass}>
                    Move to
                  </label>
                  <div className="flex items-center gap-2">
                    <StatusPill status={order.status} />
                    <ArrowRightIcon size={12} className="shrink-0 text-ink-5" />
                    <select
                      id="override-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as OrderStatus)}
                      className={cn(controlClass, 'min-w-0 flex-1')}
                    >
                      {overrideOptions.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="override-reason" className={labelClass}>
                      Audit reason
                    </label>
                    <span className="mb-1.5 font-mono text-[10px] text-ink-4">min 5 chars</span>
                  </div>
                  <textarea
                    id="override-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Explain why this override is needed…"
                    className={cn(controlClass, 'h-auto w-full resize-none py-2')}
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="w-full justify-center"
                  loading={override.isPending}
                  disabled={override.isPending || !status || reason.trim().length < 5}
                >
                  {override.isPending ? 'Signing & applying…' : 'Apply audited override'}
                </Button>
              </form>
            </Panel>
          ) : null}
        </aside>
      </div>
    </AdminPage>
  );
}

function BackLink() {
  return (
    <Link
      to="/admin/orders"
      className="group flex w-fit items-center gap-1.5 rounded-full bg-paper py-1 pl-2 pr-3 text-xs font-medium text-ink-3 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all hover:text-ink hover:shadow-[inset_0_0_0_1px_rgba(12,14,11,0.25)]"
    >
      <ArrowLeftIcon size={13} className="transition-transform group-hover:-translate-x-0.5" />
      Orders control
    </Link>
  );
}

const STAGE_TIMESTAMP: Record<string, keyof AdminOrder> = {
  pending: 'createdAt',
  accepted: 'acceptedAt',
  preparing: 'preparedAt',
  ready_for_pickup: 'readyAt',
  out_for_delivery: 'dispatchedAt',
  delivered: 'deliveredAt',
  completed: 'completedAt',
};

/** Horizontal happy-path tracker; exception states are shown as a terminal marker. */
function LifecycleTracker({ order }: { order: AdminOrder }) {
  const idx = ORDER_STAGES.findIndex((s) => s.key === order.status);
  // For exception states, the stage after the furthest timestamped one is where it broke off.
  const lastStamped = ORDER_STAGES.reduce(
    (acc, s, i) => (order[STAGE_TIMESTAMP[s.key] as keyof AdminOrder] ? i : acc),
    0,
  );
  const reached = idx >= 0 ? idx : Math.min(lastStamped + 1, ORDER_STAGES.length - 1);
  const exception = idx < 0 ? order.status : null;
  const exceptionAt = order.status === 'cancelled' ? order.cancelledAt : order.status === 'rejected' ? order.rejectedAt : null;

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <ol className="flex min-w-[680px] items-start">
        {ORDER_STAGES.map((s, i) => {
          const done = i < reached || (i === reached && !exception && s.key === 'completed');
          const current = i === reached && !done;
          const ts = order[STAGE_TIMESTAMP[s.key] as keyof AdminOrder] as number | null | undefined;
          const blocked = current && exception;
          return (
            <li key={s.key} className="relative flex flex-1 flex-col items-start pr-2">
              {i < ORDER_STAGES.length - 1 ? (
                <span
                  className={cn('absolute left-7 right-1 top-[11px] h-0.5 rounded-full', i < reached ? 'bg-ink/50' : 'bg-ink/10')}
                  aria-hidden
                />
              ) : null}
              <span
                className={cn(
                  'relative z-[1] flex size-6 items-center justify-center rounded-full ring-4 ring-bone',
                  blocked
                    ? 'bg-rose text-paper'
                    : done
                      ? 'bg-ink text-volt'
                      : current
                        ? 'bg-volt text-ink shadow-[0_0_0_6px_rgba(198,220,74,0.3)]'
                        : 'bg-paper text-ink-5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)]',
                )}
              >
                {blocked ? (
                  <XIcon size={11} />
                ) : done ? (
                  <CheckIcon size={11} />
                ) : current ? (
                  <span className="size-1.5 rounded-full bg-ink" />
                ) : (
                  <span className="text-[9px] font-bold">{i + 1}</span>
                )}
              </span>
              <span className={cn('mt-2.5 text-xs font-semibold', done || current ? 'text-ink' : 'text-ink-4')}>
                {s.label}
              </span>
              <span className="mt-0.5 text-[11px] text-ink-4">
                {blocked
                  ? `${humanize(exception)}${exceptionAt ? ` · ${relativeTime(exceptionAt)}` : ''}`
                  : ts
                    ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : current
                      ? 'In progress'
                      : '—'}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PartyCard({
  role,
  icon,
  name,
  seed,
  href,
  contact,
  phone,
  email,
  addressLabel,
  address,
  addressSub,
}: {
  role: string;
  icon: ReactNode;
  name: string;
  seed: string | undefined;
  href: string | undefined;
  contact: string | null | undefined;
  phone: string | null | undefined;
  email: string | null | undefined;
  addressLabel: string;
  address: string | null | undefined;
  addressSub: string | null | undefined;
}) {
  return (
    <section className="vyro-surface flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-4">
          <span className="text-ink-5">{icon}</span>
          {role}
        </span>
        {href ? (
          <Link
            to={href}
            className="group inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-ink-3 transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            Inspect
            <ArrowRightIcon size={12} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>
      <div className="flex items-center gap-3 px-5 pt-3">
        <Monogram name={name} seed={seed} />
        <div className="min-w-0">
          <div className="truncate text-[0.9375rem] font-semibold text-ink">{name}</div>
          {contact ? <div className="truncate text-xs text-ink-4">{contact}</div> : null}
        </div>
      </div>
      <div className="space-y-1.5 px-5 pb-4 pt-3.5 text-[13px]">
        {email ? (
          <a href={`mailto:${email}`} className="flex items-center gap-2 text-ink-3 transition-colors hover:text-copper-deep">
            <MailIcon size={13} className="shrink-0 text-ink-5" />
            <span className="truncate">{email}</span>
          </a>
        ) : null}
        {phone ? (
          <a href={`tel:${phone}`} className="flex items-center gap-2 font-mono text-xs text-ink-3 transition-colors hover:text-ink">
            <PhoneIcon size={13} className="shrink-0 text-ink-5" />
            {phone}
          </a>
        ) : null}
        {!email && !phone ? <div className="text-xs text-ink-5">No contact details on file</div> : null}
      </div>
      {address || addressSub ? (
        <div className="mt-auto flex items-start gap-2 border-t border-ink/[0.07] bg-bone/40 px-5 py-3">
          <MapPinIcon size={13} className="mt-0.5 shrink-0 text-ink-5" />
          <div className="min-w-0 text-[13px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-5">{addressLabel}</div>
            {address ? <div className="mt-0.5 text-ink-3">{address}</div> : null}
            {addressSub ? <div className="mt-0.5 text-xs capitalize text-ink-4">{addressSub}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MoneyRow({ label, cents, muted, strike }: { label: string; cents: number; muted?: boolean; strike?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-4">{label}</dt>
      <dd className={cn('font-mono text-[13px] num-tabular', muted ? 'text-ink-4' : 'text-ink', strike && 'line-through')}>
        {formatLKR(cents)}
      </dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-4">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  );
}

function WireReceivedPanel({ orderId, onRecorded }: { orderId: string; onRecorded: () => void }) {
  const [wireRef, setWireRef] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ status: string; deltaBps: number }>(`/admin/orders/${orderId}/wire-received`, {
        wireRef,
        receivedAmountCents: Math.round(Number(amount) * 100),
        receivedCurrency: currency,
        acknowledgeMismatch: ack,
      }),
    onSuccess: () => {
      setErr(null);
      setWireRef('');
      setAmount('');
      onRecorded();
    },
    onError: (e: unknown) => {
      setErr(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Failed');
    },
  });

  return (
    <Panel
      title="Record wire receipt"
      description="Cross-border orders settle via wire/SWIFT. Recording the receipt marks the order paid. A delta over 1% needs explicit acknowledgement."
      icon={<Building2Icon size={16} className="text-copper" />}
    >
      {err ? (
        <Callout tone="danger" className="mb-4">
          {err}
        </Callout>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="wire-ref" className={labelClass}>
            Wire reference
          </label>
          <input
            id="wire-ref"
            value={wireRef}
            onChange={(e) => setWireRef(e.target.value)}
            required
            placeholder="e.g. SBI-IN-2026-001234"
            className={cn(controlClass, 'w-full font-mono')}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label htmlFor="wire-amount" className={labelClass}>
              Amount
            </label>
            <input
              id="wire-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className={cn(controlClass, 'w-full font-mono')}
            />
          </div>
          <div>
            <label htmlFor="wire-currency" className={labelClass}>
              Currency
            </label>
            <select id="wire-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={controlClass}>
              {['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'JPY', 'CNY'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-3">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="accent-copper" />
          Acknowledge FX delta above the 1% threshold
        </label>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="w-full justify-center"
          loading={submit.isPending}
          disabled={submit.isPending || !wireRef.trim() || !amount}
        >
          {submit.isPending ? 'Reconciling…' : 'Record wire & mark paid'}
        </Button>
      </form>
    </Panel>
  );
}
