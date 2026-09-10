import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAdminOrder } from './useAdminOrders';
import { StatusBadge, Surface, EmptyState } from '@/components/ui';
import { ArrowLeftIcon, Building2Icon, StoreIcon, PackageIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon } from '@/components/icons';
import { formatLKR } from '@/lib/format';

const OVERRIDE_STATUSES = ['pending', 'accepted', 'rejected', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'disputed'] as const;

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

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { data, isLoading, isError, refetch } = useAdminOrder(id);
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof OVERRIDE_STATUSES)[number]>('cancelled');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const override = useMutation({
    mutationFn: (body: { status: string; reason: string; expectedUpdatedAt?: number | undefined }) =>
      api.post<{ ok: true }>(`/admin/orders/${id}/override`, body),
    onSuccess: () => {
      setError(null);
      setReason('');
      setSuccessMsg('Status override applied and recorded in security audit trail.');
      qc.invalidateQueries({ queryKey: ['admin-order', id] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (e: unknown) => {
      setSuccessMsg(null);
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Override failed');
    },
  });

  const order = data?.order;
  const items = data?.items ?? [];
  const events = data?.events ?? [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* 1. Navigation & Breadcrumb */}
      <div className="flex items-center justify-between border-b border-ink/10 pb-4">
        <Link
          to="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-ink-3 hover:text-ink transition"
        >
          <ArrowLeftIcon size={14} />
          <span>Back to Orders Control</span>
        </Link>

        {order && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-ink-4">Order ID: {order.id}</span>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-xs font-mono text-ink-3 hover:text-ink underline ml-2"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-ink border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-ink-4">Loading purchase order details…</p>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <Surface className="p-8 text-center border-rose/30 bg-rose/5">
          <AlertCircleIcon size={32} className="mx-auto text-rose mb-3" />
          <h2 className="vyro-display text-xl text-rose font-bold">Purchase Order Not Found</h2>
          <p className="text-xs text-ink-3 mt-1 max-w-sm mx-auto">
            The requested order ID does not exist or you do not have administrative privileges to view it.
          </p>
          <div className="mt-4">
            <Link to="/admin/orders" className="text-xs font-mono underline font-medium text-ink">
              ← Return to Orders List
            </Link>
          </div>
        </Surface>
      )}

      {/* Order Content */}
      {order && (
        <>
          {/* Header Banner */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-paper p-5 border border-ink/10 shadow-sm">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="vyro-display text-3xl font-mono font-bold tracking-tight text-ink">
                  {order.poNumber ?? order.id}
                </h1>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-ink-4 font-mono">
                <span>Placed: {formatFullDate(order.createdAt)}</span>
                <span>•</span>
                <span>Last Updated: {formatFullDate(order.updatedAt)}</span>
              </div>
            </div>

            <div className="text-right md:border-l md:border-ink/10 md:pl-6">
              <div className="text-[11px] font-mono uppercase tracking-wider text-ink-4">Total Amount</div>
              <div className="text-2xl font-bold font-mono text-ink tracking-tight">
                {formatLKR(order.totalCents ?? 0)}
              </div>
              <div className="text-[10px] text-ink-4 uppercase font-mono">{order.currency ?? 'LKR'}</div>
            </div>
          </div>

          {/* 2-Column Grid: Left is Counterparties & Items, Right is Override & Financials */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
              {/* Counterparties: Buyer & Supplier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Buyer Card */}
                <Surface className="p-4 border border-ink/10 bg-paper space-y-3">
                  <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                    <div className="flex items-center gap-2">
                      <StoreIcon size={16} className="text-copper" />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink">Buyer (Business)</span>
                    </div>
                    {order.businessId && (
                      <Link
                        to={`/admin/businesses/${order.businessId}`}
                        className="text-[11px] font-mono text-copper hover:underline"
                      >
                        Inspect →
                      </Link>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-sm text-ink">
                      {order.businessName ?? 'Direct Buyer'}
                    </div>
                    {order.businessContactPerson && (
                      <div className="text-ink-3">
                        <span className="text-ink-4">Contact: </span>
                        {order.businessContactPerson}
                      </div>
                    )}
                    {order.businessPhone && (
                      <div className="text-ink-3">
                        <span className="text-ink-4">Phone: </span>
                        <a href={`tel:${order.businessPhone}`} className="hover:underline font-mono">
                          {order.businessPhone}
                        </a>
                      </div>
                    )}
                    {order.businessEmail && (
                      <div className="text-ink-3">
                        <span className="text-ink-4">Email: </span>
                        <a href={`mailto:${order.businessEmail}`} className="hover:underline">
                          {order.businessEmail}
                        </a>
                      </div>
                    )}
                    <div className="pt-2 border-t border-ink/5 mt-2">
                      <span className="text-[10px] font-mono uppercase text-ink-4 block mb-0.5">Delivery Destination</span>
                      <div className="text-ink-3 font-medium">
                        {order.deliveryAddress || 'No address specified'}
                      </div>
                      <div className="text-ink-4 font-mono text-[11px]">
                        {[order.deliveryCity, order.deliveryDistrict].filter(Boolean).join(', ')}
                      </div>
                    </div>
                  </div>
                </Surface>

                {/* Supplier Card */}
                <Surface className="p-4 border border-ink/10 bg-paper space-y-3">
                  <div className="flex items-center justify-between border-b border-ink/10 pb-2">
                    <div className="flex items-center gap-2">
                      <Building2Icon size={16} className="text-ink-3" />
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink">Supplier Merchant</span>
                    </div>
                    {order.supplierId && (
                      <Link
                        to={`/admin/suppliers/${order.supplierId}`}
                        className="text-[11px] font-mono text-copper hover:underline"
                      >
                        Inspect →
                      </Link>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="font-semibold text-sm text-ink">
                      {order.supplierName ?? 'Direct Supplier'}
                    </div>
                    {order.supplierContactPerson && (
                      <div className="text-ink-3">
                        <span className="text-ink-4">Contact: </span>
                        {order.supplierContactPerson}
                      </div>
                    )}
                    {order.supplierPhone && (
                      <div className="text-ink-3">
                        <span className="text-ink-4">Phone: </span>
                        <a href={`tel:${order.supplierPhone}`} className="hover:underline font-mono">
                          {order.supplierPhone}
                        </a>
                      </div>
                    )}
                    {order.supplierEmail && (
                      <div className="text-ink-3">
                        <span className="text-ink-4">Email: </span>
                        <a href={`mailto:${order.supplierEmail}`} className="hover:underline">
                          {order.supplierEmail}
                        </a>
                      </div>
                    )}
                    {order.supplierAddress && (
                      <div className="pt-2 border-t border-ink/5 mt-2">
                        <span className="text-[10px] font-mono uppercase text-ink-4 block mb-0.5">Merchant Location</span>
                        <div className="text-ink-3">{order.supplierAddress}</div>
                      </div>
                    )}
                  </div>
                </Surface>
              </div>

              {/* Line Items Table */}
              <Surface className="border border-ink/10 bg-paper overflow-hidden">
                <div className="p-4 border-b border-ink/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PackageIcon size={16} className="text-ink-3" />
                    <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">
                      Line Items ({items.length})
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-ink-4">
                    Subtotal: {formatLKR(order.subtotalCents ?? 0)}
                  </span>
                </div>

                {items.length === 0 ? (
                  <div className="p-6 text-center text-xs text-ink-4 font-mono">
                    No line items snapshot recorded for this purchase order.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-sand/30 border-b border-ink/10 text-ink-4 font-mono uppercase text-[10px]">
                        <th className="py-2.5 px-4">Item Snapshot</th>
                        <th className="py-2.5 px-4 text-right">Quantity</th>
                        <th className="py-2.5 px-4 text-right">Unit Price</th>
                        <th className="py-2.5 px-4 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink/5 font-mono">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-sand/15 transition">
                          <td className="py-3 px-4 font-sans font-medium text-ink">
                            {item.productNameSnapshot}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums">
                            {item.quantity}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-ink-3">
                            {formatLKR(item.unitPriceCents)}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-ink">
                            {formatLKR(item.lineTotalCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Surface>

              {/* Order Notes & Reasons */}
              {(order.notes || order.rejectionReason || order.cancelledReason) && (
                <Surface className="p-4 border border-ink/10 bg-paper space-y-2 text-xs">
                  <h3 className="font-mono font-bold uppercase text-[11px] text-ink-4">Operational Notes & Exceptions</h3>
                  {order.notes && (
                    <div className="p-3 bg-sand/30 border border-ink/10 text-ink-3">
                      <strong className="text-ink block mb-0.5">Order Notes:</strong>
                      {order.notes}
                    </div>
                  )}
                  {order.rejectionReason && (
                    <div className="p-3 bg-rose/10 border border-rose/20 text-rose">
                      <strong className="block mb-0.5 font-bold">Supplier Rejection Reason:</strong>
                      {order.rejectionReason}
                    </div>
                  )}
                  {order.cancelledReason && (
                    <div className="p-3 bg-rose/10 border border-rose/20 text-rose">
                      <strong className="block mb-0.5 font-bold">Cancellation Reason:</strong>
                      {order.cancelledReason}
                    </div>
                  )}
                </Surface>
              )}

              {/* Order Audit Events Timeline */}
              <Surface className="border border-ink/10 bg-paper p-4 space-y-3">
                <div className="flex items-center gap-2 border-b border-ink/10 pb-2.5">
                  <ClockIcon size={16} className="text-ink-3" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink">
                    Audit Trail & Lifecycle Events ({events.length})
                  </h3>
                </div>

                {events.length === 0 ? (
                  <p className="text-xs text-ink-4 font-mono py-2">No lifecycle events recorded yet.</p>
                ) : (
                  <div className="space-y-3 pt-1">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-3 text-xs">
                        <div className="w-2 h-2 rounded-full bg-ink/40 mt-1.5 shrink-0" />
                        <div className="flex-1 border-b border-ink/5 pb-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-ink">
                              {ev.fromStatus ? `${ev.fromStatus} → ` : ''}{ev.toStatus}
                            </span>
                            <span className="text-[11px] font-mono text-ink-4">
                              {formatFullDate(ev.createdAt)}
                            </span>
                          </div>
                          {ev.reason && (
                            <p className="text-ink-3 mt-1 italic bg-sand/30 px-2 py-1 border border-ink/5">
                              "{ev.reason}"
                            </p>
                          )}
                          {ev.actorUserId && (
                            <div className="text-[10px] font-mono text-ink-4 mt-1">
                              Actor ID: {ev.actorUserId}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Surface>
            </div>

            {/* Right Sidebar: Status Override & Financial Summary */}
            <div className="space-y-6">
              {/* Financial Summary Box */}
              <Surface className="p-4 border border-ink/10 bg-paper space-y-3">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink border-b border-ink/10 pb-2">
                  Financial Breakdown
                </h3>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between text-ink-3">
                    <span>Subtotal:</span>
                    <span>{formatLKR(order.subtotalCents ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-ink-3">
                    <span>Delivery Fee:</span>
                    <span>{formatLKR(order.deliveryFeeCents ?? 0)}</span>
                  </div>
                  <div className="pt-2 border-t border-ink/10 flex justify-between font-bold text-sm text-ink">
                    <span>Total Amount:</span>
                    <span>{formatLKR(order.totalCents ?? 0)}</span>
                  </div>
                </div>
              </Surface>

              {/* Administrative Status Override Panel */}
              <Surface className="p-4 border-2 border-ink/20 bg-sand/10 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-ink uppercase tracking-wider">
                  <AlertCircleIcon size={15} className="text-amber" />
                  <span>Administrative Override</span>
                </div>

                <p className="text-[11px] text-ink-4 leading-relaxed">
                  Bypasses normal state machine workflows. Every override action is permanently signed and audited in the platform security ledger.
                </p>

                {successMsg && (
                  <div className="p-2.5 bg-mint/10 border border-mint/25 text-mint text-xs flex items-center gap-1.5">
                    <CheckCircleIcon size={14} />
                    <span>{successMsg}</span>
                  </div>
                )}

                {error && (
                  <div className="p-2.5 bg-rose/10 border border-rose/25 text-rose text-xs flex items-center gap-1.5">
                    <AlertCircleIcon size={14} />
                    <span>{error}</span>
                  </div>
                )}

                <form
                  className="space-y-3 pt-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    override.mutate({
                      status,
                      reason,
                      ...(order.updatedAt ? { expectedUpdatedAt: order.updatedAt } : {}),
                    });
                  }}
                >
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-ink-4 mb-1">
                      Target Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as typeof status)}
                      className="w-full h-9 px-2.5 text-xs font-mono border border-ink/20 bg-paper focus:outline-none focus:border-ink"
                    >
                      {OVERRIDE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono uppercase text-ink-4 mb-1">
                      Audit Reason (Mandatory, min 5 chars)
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="Specify explicit operational reason for override…"
                      className="w-full p-2 text-xs border border-ink/20 bg-paper focus:outline-none focus:border-ink resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={override.isPending || reason.trim().length < 5}
                    className="w-full py-2 bg-ink text-paper text-xs font-mono font-bold hover:bg-ink-2 transition disabled:opacity-40"
                  >
                    {override.isPending ? 'Signing & Applying…' : 'Apply Audited Override'}
                  </button>
                </form>
              </Surface>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

