import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RETURN_REASON_CODES, RETURN_REASON_LABEL, type ReturnReasonCode } from '@vyro/shared';
import { api } from '@/lib/api';
import { Button, EmptyState, ErrorBanner, Input, Label, PageHeader, Select, Textarea } from '@/components/ui';
import { RefreshCwIcon, CheckCircleIcon, XIcon, PackageIcon, ClockIcon, BanknoteIcon } from '@/components/icons';
import { MetricNumber } from '@/components/brand/Surface';
import { formatLKR } from '@/lib/format';
import {
  formatLifecycleDate,
  lifecycleErrorMessage,
  postMultipart,
  returnAttachmentUrl,
  returnedQuantityByItem,
  type LifecycleOrderItem,
  type OrderReturn,
} from '@/lib/orderLifecycle';
import { Modal, ReasonDialog, ReturnStatusBadge } from './LifecycleUi';

/* ── Buyer: request a return ── */

export function RequestReturnDialog({
  poId,
  items,
  returns,
  onClose,
  onCreated,
}: {
  poId: string;
  items: LifecycleOrderItem[];
  returns: OrderReturn[] | undefined;
  onClose: () => void;
  onCreated: () => void;
}) {
  const claimed = useMemo(() => returnedQuantityByItem(returns), [returns]);
  const returnable = items
    .map((it) => ({ item: it, max: Math.max(0, it.quantity - (claimed.get(it.id) ?? 0)) }))
    .filter((r) => r.max > 0);

  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('damaged');
  const [reasonNote, setReasonNote] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [created, setCreated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const lines = returnable
    .map((r) => ({ itemId: r.item.id, quantity: Math.min(r.max, Math.max(0, qty[r.item.id] ?? 0)) }))
    .filter((l) => l.quantity > 0);
  const refundPreview = lines.reduce((sum, l) => {
    const it = items.find((i) => i.id === l.itemId);
    return sum + (it ? it.unitPriceCents * l.quantity : 0);
  }, 0);

  async function submit() {
    if (lines.length === 0) return;
    setBusy(true);
    setErr('');
    try {
      const res = await api.post<{ return: OrderReturn }>(`/purchase-orders/${poId}/returns`, {
        reasonCode,
        ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}),
        lines,
      });
      let uploadFailed = false;
      for (const f of files) {
        const form = new FormData();
        form.set('file', f);
        try {
          await postMultipart(`/returns/${res.return.id}/attachments`, form);
        } catch {
          uploadFailed = true;
        }
      }
      onCreated();
      if (uploadFailed) {
        setCreated(true);
        setErr(`Return ${res.return.rmaNumber} created, but a photo failed to upload.`);
      } else {
        onClose();
      }
    } catch (e) {
      setErr(lifecycleErrorMessage(e, 'Could not request a return'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title="Request a return"
      subtitle="The supplier reviews and approves returns"
      icon={<RefreshCwIcon size={18} />}
      tone="copper"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={lines.length === 0 || created} loading={busy}>
            Submit return
          </Button>
        </>
      }
    >
      <ErrorBanner message={err} />
      {returnable.length === 0 ? (
        <p className="text-sm text-ink-3">Every item on this order is already covered by a return.</p>
      ) : (
        <>
          <div>
            <Label htmlFor="return-reason">Reason</Label>
            <Select
              id="return-reason"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as ReturnReasonCode)}
            >
              {RETURN_REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {RETURN_REASON_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="return-note">Details</Label>
            <Textarea
              id="return-note"
              rows={3}
              maxLength={1000}
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="e.g. 6 cartons crushed on arrival"
            />
          </div>
          <div className="space-y-2">
            <Label>Quantities to return</Label>
            <div className="border border-ink/10 rounded-lg divide-y divide-ink/5">
              {returnable.map(({ item, max }) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-1 truncate">{item.productNameSnapshot}</div>
                    <div className="text-[11px] text-ink-4 font-mono">
                      Up to {max} · {formatLKR(item.unitPriceCents)} each
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={qty[item.id] ?? 0}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [item.id]: Math.min(max, Math.max(0, Number(e.target.value) || 0)) }))
                    }
                    className="!w-24 text-right font-mono"
                    aria-label={`Return quantity for ${item.productNameSnapshot}`}
                  />
                </div>
              ))}
            </div>
            <div className="text-xs text-ink-3 text-right">
              Estimated refund <span className="font-mono font-bold text-ink-1">{formatLKR(refundPreview)}</span>
            </div>
          </div>
          <div>
            <Label htmlFor="return-photos">Photos (optional, JPEG / PNG / WebP / PDF ≤ 8 MB)</Label>
            <input
              id="return-photos"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-xs text-ink-3 file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-paper"
            />
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── Shared return card body ── */

function ReturnSummary({ r }: { r: OrderReturn }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-ink-1">{r.rmaNumber}</span>
          <ReturnStatusBadge status={r.status} />
        </div>
        <span className="text-[11px] font-mono text-ink-4">{formatLifecycleDate(r.requestedAt)}</span>
      </div>
      <div className="text-xs text-ink-3">
        {RETURN_REASON_LABEL[r.reasonCode] ?? r.reasonCode}
        {r.reasonNote ? ` — ${r.reasonNote}` : ''}
      </div>
      <ul className="text-xs text-ink-2 space-y-0.5">
        {r.items.map((it) => (
          <li key={it.id} className="flex justify-between gap-2">
            <span className="truncate">{it.productName}</span>
            <span className="font-mono shrink-0">
              × {it.quantity}
              {it.approvedQuantity != null && it.approvedQuantity !== it.quantity && ` (approved ${it.approvedQuantity})`}
              {it.receivedQuantity != null && ` · received ${it.receivedQuantity}`}
            </span>
          </li>
        ))}
      </ul>
      {r.supplierNote && <p className="text-xs text-ink-3 italic">Supplier: “{r.supplierNote}”</p>}
      {r.rejectionReason && <p className="text-xs text-rose">Rejected: {r.rejectionReason}</p>}
      {r.refundCents != null && r.refundCents > 0 && (
        <div className="text-xs text-mint font-semibold">Refund {formatLKR(r.refundCents)}</div>
      )}
      {r.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {r.attachments.map((a, i) => (
            <a
              key={a.id}
              href={returnAttachmentUrl(r.id, a.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-copper hover:underline"
            >
              Attachment {i + 1}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

/* ── Buyer: list + cancel ── */

export function BuyerReturnsList({ returns, onChanged }: { returns: OrderReturn[]; onChanged: () => void }) {
  const [cancelId, setCancelId] = useState<string | null>(null);
  if (returns.length === 0) return null;
  return (
    <div className="space-y-3">
      {returns.map((r) => (
        <div key={r.id} className="p-4 rounded-xl border border-ink/10 bg-bone/30 space-y-2">
          <ReturnSummary r={r} />
          {(r.status === 'requested' || r.status === 'approved') && (
            <Button size="sm" variant="ghost" onClick={() => setCancelId(r.id)} className="text-rose">
              <XIcon size={12} /> Withdraw return
            </Button>
          )}
        </div>
      ))}
      <ReasonDialog
        open={!!cancelId}
        title="Withdraw return"
        confirmLabel="Withdraw return"
        placeholder="e.g. Resolved directly with the supplier"
        onClose={() => setCancelId(null)}
        onSubmit={async (reason) => {
          await api.post(`/returns/${cancelId}/cancel`, { reason });
          onChanged();
        }}
      />
    </div>
  );
}

/* ── Supplier: approve / reject / receive ── */

export function SupplierReturnsSection({ returns, onChanged }: { returns: OrderReturn[]; onChanged: () => void }) {
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [approve, setApprove] = useState<OrderReturn | null>(null);
  const [receive, setReceive] = useState<OrderReturn | null>(null);

  if (returns.length === 0) {
    return <p className="text-sm text-ink-4">No returns on this order.</p>;
  }
  return (
    <div className="space-y-3">
      {returns.map((r) => (
        <div key={r.id} className="p-4 rounded-xl border border-ink/10 bg-bone/30 space-y-2">
          <ReturnSummary r={r} />
          <div className="flex flex-wrap gap-2 pt-1">
            {r.status === 'requested' && (
              <>
                <Button size="sm" variant="success" onClick={() => setApprove(r)}>
                  <CheckCircleIcon size={12} /> Approve
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRejectId(r.id)}>
                  <XIcon size={12} /> Reject
                </Button>
              </>
            )}
            {r.status === 'approved' && (
              <Button size="sm" variant="success" onClick={() => setReceive(r)}>
                <PackageIcon size={12} /> Mark received
              </Button>
            )}
          </div>
        </div>
      ))}

      <ReasonDialog
        open={!!rejectId}
        title="Reject return"
        confirmLabel="Reject return"
        placeholder="e.g. Photos show goods were damaged after delivery"
        onClose={() => setRejectId(null)}
        onSubmit={async (reason) => {
          await api.post(`/returns/${rejectId}/reject`, { reason });
          onChanged();
        }}
      />
      {approve && <ApproveReturnDialog ret={approve} onClose={() => setApprove(null)} onDone={onChanged} />}
      {receive && <ReceiveReturnDialog ret={receive} onClose={() => setReceive(null)} onDone={onChanged} />}
    </div>
  );
}

function ApproveReturnDialog({ ret, onClose, onDone }: { ret: OrderReturn; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/returns/${ret.id}/approve`, note.trim() ? { note: note.trim() } : {});
      onDone();
      onClose();
    } catch (e) {
      setErr(lifecycleErrorMessage(e, 'Could not approve return'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title={`Approve ${ret.rmaNumber}`}
      subtitle="Buyer will be asked to send the goods back"
      tone="mint"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => void submit()} loading={busy}>
            Approve return
          </Button>
        </>
      }
    >
      <ErrorBanner message={err} />
      <div>
        <Label htmlFor="approve-note">Note to buyer (optional)</Label>
        <Textarea
          id="approve-note"
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Our driver will collect on Thursday"
        />
      </div>
    </Modal>
  );
}

function ReceiveReturnDialog({ ret, onClose, onDone }: { ret: OrderReturn; onClose: () => void; onDone: () => void }) {
  const [lines, setLines] = useState<Record<string, { quantity: number; restock: boolean }>>(() =>
    Object.fromEntries(
      ret.items.map((it) => [it.id, { quantity: it.approvedQuantity ?? it.quantity, restock: true }]),
    ),
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refundPreview = ret.items.reduce(
    (sum, it) => sum + it.unitRefundCents * (lines[it.id]?.quantity ?? 0),
    0,
  );

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      await api.post(`/returns/${ret.id}/receive`, {
        ...(note.trim() ? { note: note.trim() } : {}),
        lines: ret.items.map((it) => ({
          returnItemId: it.id,
          quantity: lines[it.id]?.quantity ?? 0,
          restock: lines[it.id]?.restock ?? false,
        })),
      });
      onDone();
      onClose();
    } catch (e) {
      setErr(lifecycleErrorMessage(e, 'Could not record receipt'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title={`Receive ${ret.rmaNumber}`}
      subtitle="Refund and credit note are issued automatically"
      tone="mint"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="success" onClick={() => void submit()} loading={busy}>
            Confirm receipt · refund {formatLKR(refundPreview)}
          </Button>
        </>
      }
    >
      <ErrorBanner message={err} />
      <div className="border border-ink/10 rounded-lg divide-y divide-ink/5">
        {ret.items.map((it) => {
          const max = it.approvedQuantity ?? it.quantity;
          const line = lines[it.id] ?? { quantity: 0, restock: false };
          return (
            <div key={it.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-1 truncate">{it.productName}</div>
                <div className="text-[11px] text-ink-4 font-mono">Approved {max}</div>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-ink-3">
                  <input
                    type="checkbox"
                    checked={line.restock}
                    onChange={(e) => setLines((l) => ({ ...l, [it.id]: { ...line, restock: e.target.checked } }))}
                    className="accent-copper"
                  />
                  Restock
                </label>
                <Input
                  type="number"
                  min={0}
                  max={max}
                  value={line.quantity}
                  onChange={(e) =>
                    setLines((l) => ({
                      ...l,
                      [it.id]: { ...line, quantity: Math.min(max, Math.max(0, Number(e.target.value) || 0)) },
                    }))
                  }
                  className="!w-24 text-right font-mono"
                  aria-label={`Received quantity for ${it.productName}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <Label htmlFor="receive-note">Condition note (optional)</Label>
        <Textarea id="receive-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/* ── List pages ── */

function ReturnsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="vyro-surface overflow-hidden">
      <div className="divide-y divide-ink/[0.05]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-5 py-4 animate-pulse">
            <div className="w-28 space-y-2">
              <div className="h-3.5 rounded bg-ink/10" />
              <div className="h-2.5 w-2/3 rounded bg-ink/5" />
            </div>
            <div className="h-3.5 w-20 rounded bg-ink/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 rounded bg-ink/10" />
              <div className="h-2.5 w-1/3 rounded bg-ink/5" />
            </div>
            <div className="h-5 w-16 rounded-md bg-ink/10" />
            <div className="h-3.5 w-16 rounded bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReturnsTable({
  returns,
  orderLink,
}: {
  returns: OrderReturn[];
  orderLink: (r: OrderReturn) => string;
}) {
  return (
    <div className="vyro-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink/10 bg-bone/60 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-4">
              <th className="px-5 py-3">RMA</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Refund</th>
              <th className="px-5 py-3 text-right">Requested</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/[0.05]">
            {returns.map((r) => {
              const itemCount = r.items.reduce((n, it) => n + it.quantity, 0);
              return (
                <tr key={r.id} className="transition-colors hover:bg-bone/40">
                  <td className="px-5 py-3.5">
                    <div className="font-mono text-[13px] font-semibold text-ink-1">{r.rmaNumber}</div>
                    <div className="mt-0.5 text-[11px] text-ink-4">
                      {itemCount} {itemCount === 1 ? 'unit' : 'units'} · {r.items.length} {r.items.length === 1 ? 'line' : 'lines'}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <Link
                      to={orderLink(r)}
                      className="font-mono text-[13px] text-copper transition-colors hover:text-ink"
                    >
                      {r.poNumber ?? r.purchaseOrderId.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="max-w-[220px] px-4 py-3.5">
                    <div className="truncate text-xs font-medium text-ink-2">
                      {RETURN_REASON_LABEL[r.reasonCode] ?? r.reasonCode}
                    </div>
                    {r.reasonNote ? (
                      <div className="mt-0.5 truncate text-[11px] text-ink-4" title={r.reasonNote}>
                        {r.reasonNote}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <ReturnStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-[13px] font-semibold">
                    {r.refundCents != null && r.refundCents > 0 ? (
                      formatLKR(r.refundCents)
                    ) : (
                      <span className="font-normal text-ink-4">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-[11px] text-ink-4">
                    {formatLifecycleDate(r.requestedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-ink/[0.06] px-5 py-2.5 text-[11px] text-ink-4">
        Showing <strong className="text-ink-2">{returns.length}</strong> {returns.length === 1 ? 'return' : 'returns'}
      </div>
    </div>
  );
}

const OPEN_STATUSES = 'requested,approved,received';

/** Full-page returns list (buyer, supplier and admin share it). */
export function ReturnsListView({
  kicker,
  title,
  sub,
  queryKey,
  path,
  orderLink,
  enabled = true,
  emptyAction,
}: {
  kicker: ReactNode;
  title: string;
  sub: string;
  queryKey: readonly unknown[];
  /** Endpoint without status filter, e.g. `/returns?businessId=…`. */
  path: string;
  orderLink: (r: OrderReturn) => string;
  enabled?: boolean;
  emptyAction?: ReactNode;
}) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const sep = path.includes('?') ? '&' : '?';
  const statusParam =
    filter === 'open' ? OPEN_STATUSES : 'requested,approved,rejected,received,refunded,cancelled,closed';
  const q = useQuery({
    queryKey: [...queryKey, filter],
    queryFn: () => api.get<{ returns: OrderReturn[] }>(`${path}${sep}status=${statusParam}`),
    enabled,
  });
  const returns = q.data?.returns ?? [];

  const stats = useMemo(() => {
    let awaiting = 0;
    let refundCents = 0;
    for (const r of returns) {
      if (r.status === 'requested') awaiting++;
      if (r.refundCents != null && r.refundCents > 0) refundCents += r.refundCents;
    }
    return { total: returns.length, awaiting, refundCents };
  }, [returns]);

  return (
    <div className="space-y-6 max-w-6xl pb-12">
      <PageHeader
        kicker={kicker}
        title={title}
        sub={sub}
        actions={
          <>
            <div
              role="tablist"
              aria-label="Return status filter"
              className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] p-1"
            >
              {(['open', 'all'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3.5 py-1.5 text-xs transition-colors ${
                    filter === f
                      ? 'bg-ink font-semibold text-paper shadow-sm'
                      : 'font-medium text-ink-3 hover:text-ink'
                  }`}
                >
                  {f === 'open' ? 'Open' : 'All'}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void q.refetch()}
              loading={q.isFetching && !q.isLoading}
              icon={q.isFetching ? undefined : <RefreshCwIcon size={14} />}
            >
              Refresh
            </Button>
          </>
        }
      />

      {q.isError ? (
        <ErrorBanner message={lifecycleErrorMessage(q.error, 'Could not load returns')} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="In view"
            value={String(stats.total)}
            sub="Matching current filter"
            icon={<PackageIcon size={15} />}
            tile="bg-ink/[0.05] text-ink-3"
            loading={q.isLoading}
          />
          <StatTile
            label="Awaiting review"
            value={String(stats.awaiting)}
            sub="Needs a decision"
            icon={<ClockIcon size={15} />}
            tile="bg-amber/15 text-amber"
            valueTone={stats.awaiting > 0 ? 'text-amber' : 'text-ink'}
            loading={q.isLoading}
          />
          <StatTile
            label="Refund value"
            value={formatLKR(stats.refundCents)}
            sub="Issued to buyers"
            icon={<BanknoteIcon size={15} />}
            tile="bg-mint/15 text-mint"
            loading={q.isLoading}
          />
        </div>
      )}

      {q.isLoading ? (
        <ReturnsTableSkeleton />
      ) : q.isError ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void q.refetch()} icon={<RefreshCwIcon size={14} />}>
            Try again
          </Button>
        </div>
      ) : returns.length === 0 ? (
        <div className="space-y-5">
          <EmptyState
            icon={<RefreshCwIcon size={20} />}
            title={filter === 'open' ? 'No open returns' : 'No returns yet'}
            description="Returns raised against delivered orders appear here."
            action={emptyAction}
          />
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="vyro-surface p-5 space-y-2">
              <span className="size-8 rounded-lg bg-ink/[0.05] text-ink-3 flex items-center justify-center">
                <PackageIcon size={15} />
              </span>
              <h4 className="font-display font-semibold text-ink text-sm">Raise a request</h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Open a delivered order and pick the items to send back, with photos as evidence.
              </p>
            </div>
            <div className="vyro-surface p-5 space-y-2">
              <span className="size-8 rounded-lg bg-amber/15 text-amber flex items-center justify-center">
                <ClockIcon size={15} />
              </span>
              <h4 className="font-display font-semibold text-ink text-sm">Supplier review</h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                The supplier approves or rejects each line, then arranges collection of the goods.
              </p>
            </div>
            <div className="vyro-surface p-5 space-y-2">
              <span className="size-8 rounded-lg bg-mint/15 text-mint flex items-center justify-center">
                <BanknoteIcon size={15} />
              </span>
              <h4 className="font-display font-semibold text-ink text-sm">Receive &amp; refund</h4>
              <p className="text-xs text-ink-3 leading-relaxed">
                Receipt is confirmed at the depot and a SVAT refund is issued automatically.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ReturnsTable returns={returns} orderLink={orderLink} />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  icon,
  tile = 'bg-ink/[0.05] text-ink-3',
  valueTone = 'text-ink',
  loading,
}: {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  tile?: string;
  valueTone?: string;
  loading?: boolean;
}) {
  return (
    <div className="vyro-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-4">{label}</span>
        <span className={`flex size-8 items-center justify-center rounded-lg ${tile}`}>{icon}</span>
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded bg-ink/10" />
      ) : (
        <MetricNumber size="sm" className={`mt-2 ${valueTone}`}>{value}</MetricNumber>
      )}
      <div className="mt-0.5 text-[11px] text-ink-4">{sub}</div>
    </div>
  );
}
