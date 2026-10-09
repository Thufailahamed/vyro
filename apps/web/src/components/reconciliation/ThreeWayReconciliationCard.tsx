import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button, Textarea } from '@/components/ui';
import { cn, useToast } from '@vyro/ui';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  FileTextIcon,
  ScaleIcon,
  UploadCloudIcon,
} from '@/components/icons';
import type { ThreeWayReconciliationResult } from '@vyro/ai';

/** Persisted auto-reconciliation loaded by the parent (GET /documents/by-po/:id/auto-reconciliation). */
export interface AutoReconciliation {
  status: string;
  payload: ThreeWayReconciliationResult | null;
  uploadId?: string;
}

interface ThreeWayReconciliationCardProps {
  orderId: string;
  poNumber: string;
  poTotalCents: number;
  orderStatus: string;
  onReleasePayment?: () => void;
  autoReconciliation?: AutoReconciliation | null;
}

export function ThreeWayReconciliationCard({
  orderId,
  poNumber,
  poTotalCents,
  orderStatus,
  onReleasePayment,
  autoReconciliation,
}: ThreeWayReconciliationCardProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [manualResult, setManualResult] = useState<ThreeWayReconciliationResult | null>(null);
  const [showClaimDrawer, setShowClaimDrawer] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');

  // Auto result hydrates the card; a manual audit always overrides it.
  const autoResult =
    autoReconciliation &&
    (autoReconciliation.status === 'passed' || autoReconciliation.status === 'discrepancy')
      ? (autoReconciliation.payload ?? null)
      : null;
  const result = manualResult ?? autoResult;
  const autoChecked = autoResult !== null && manualResult === null;

  async function handleRunAudit() {
    setLoading(true);
    try {
      const res = await api.post<{ reconciliation: ThreeWayReconciliationResult }>(
        `/purchase-orders/${orderId}/reconciliation`,
        {
          invoiceData: {
            invoiceNumber: `INV-${poNumber}`,
            totalCents: poTotalCents,
            items: [
              {
                description: `Authorized wholesale line items (${poNumber})`,
                quantity: 1,
                unitPriceCents: poTotalCents,
                totalCents: poTotalCents,
              },
            ],
          },
        },
      );
      setManualResult(res.reconciliation);
      if (res.reconciliation.draftClaimNote) {
        setClaimMessage(res.reconciliation.draftClaimNote);
      }
      toast.show(toast.success('3-Way reconciliation audit complete!'));
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Audit failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitClaim() {
    if (!claimMessage.trim() || !result) return;
    setClaimLoading(true);
    try {
      await api.post(`/purchase-orders/${orderId}/reconciliation/claim`, {
        claimMessage,
        discrepancyCents: result.netDifferenceCents,
        affectedLineItems: result.lines.map((l) => l.poItemId ?? l.description),
      });
      toast.show(toast.success('Discrepancy claim submitted to supplier.'));
      setShowClaimDrawer(false);
    } catch (e) {
      toast.show(toast.error(e instanceof Error ? e.message : 'Failed to submit claim'));
    } finally {
      setClaimLoading(false);
    }
  }

  const lkr = (c: number) =>
    `Rs. ${(c / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const verdict =
    result?.status === 'perfect_match'
      ? { tone: 'mint' as const, label: 'Matched' }
      : result?.status === 'discrepancy_detected'
        ? { tone: 'amber' as const, label: 'Discrepancy' }
        : result
          ? { tone: 'rose' as const, label: 'Needs review' }
          : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.03),0_16px_36px_-26px_rgba(0,0,0,0.3)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/[0.07] px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-volt">
            <ScaleIcon size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-copper">
              Invoice check
              {autoChecked && (
                <span className="rounded-full bg-mint/10 px-1.5 py-px text-[9px] tracking-wider text-mint ring-1 ring-mint/25">
                  Checked automatically
                </span>
              )}
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink-1">
              3-way reconciliation
            </h3>
            <p className="mt-0.5 text-xs text-ink-3">
              PO rates · dock delivery · supplier invoice lines
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {autoReconciliation?.uploadId && result?.lines.some((line) => line.aiSuggestion) && (
            <Link
              to={`/invoices/${autoReconciliation.uploadId}/review`}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber ring-1 ring-amber/30 transition-colors hover:bg-amber/10"
            >
              Review invoice lines
            </Link>
          )}
          <Link
            to={`/invoices/upload?poId=${orderId}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-2 ring-1 ring-ink/15 transition-colors hover:bg-bone/60"
          >
            <UploadCloudIcon size={13} /> Upload supplier invoice
          </Link>
          <Button onClick={handleRunAudit} loading={loading} disabled={loading} size="sm">
            {loading ? 'Auditing…' : result ? 'Re-run 3-Way Audit' : 'Run 3-Way Audit'}
          </Button>
        </div>
      </header>

      {!result ? (
        <div className="flex items-center gap-3 px-6 py-5 text-xs text-ink-3">
          <FileTextIcon size={15} className="shrink-0 text-ink-4" />
          No supplier invoice checked yet. Upload one to have it reconciled against this PO
          automatically.
        </div>
      ) : (
        <div className="space-y-4 p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Pillar
              n={1}
              label="PO authorised"
              value={lkr(result.poTotalCents)}
              note="Approved order value"
            />
            <Pillar
              n={2}
              label="Delivery"
              value={result.isDeliveryConfirmed ? 'Verified' : 'Pending'}
              note={`Order ${orderStatus.replace(/_/g, ' ')}`}
              tone={result.isDeliveryConfirmed ? 'mint' : 'amber'}
            />
            <Pillar
              n={3}
              label="Supplier invoice"
              value={lkr(result.invoiceTotalCents)}
              note={
                result.netDifferenceCents === 0
                  ? 'No variance'
                  : `Variance ${lkr(result.netDifferenceCents)}`
              }
              tone={result.netDifferenceCents === 0 ? 'mint' : 'rose'}
            />
          </div>

          {verdict && (
            <div
              className={cn(
                'flex items-start gap-3 rounded-xl p-4 ring-1',
                verdict.tone === 'mint' && 'bg-mint/[0.07] ring-mint/25',
                verdict.tone === 'amber' && 'bg-amber/[0.08] ring-amber/30',
                verdict.tone === 'rose' && 'bg-rose/[0.06] ring-rose/25',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 shrink-0',
                  verdict.tone === 'mint'
                    ? 'text-mint'
                    : verdict.tone === 'amber'
                      ? 'text-amber'
                      : 'text-rose',
                )}
              >
                {verdict.tone === 'mint' ? (
                  <CheckCircleIcon size={17} />
                ) : (
                  <AlertTriangleIcon size={17} />
                )}
              </span>
              <div className="min-w-0 text-xs">
                <div className="text-sm font-semibold text-ink-1">{result.summary}</div>
                <div className="mt-1 text-ink-3">
                  {(result.matchConfidence * 100).toFixed(0)}% confidence · Recommended:{' '}
                  <span className="font-mono text-ink-2">{result.recommendedAction}</span>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl ring-1 ring-ink/[0.08]">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink/[0.03] text-[10px] font-mono uppercase tracking-[0.12em] text-ink-4">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Item</th>
                  <th className="px-3 py-2.5 font-bold">PO qty · rate</th>
                  <th className="px-3 py-2.5 font-bold">Billed qty · rate</th>
                  <th className="px-3 py-2.5 text-right font-bold">Variance</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06]">
                {result.lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-3 font-medium text-ink-1">
                      <div>{l.description}</div>
                      {l.matchSource === 'ai' && (
                        <div className="mt-1 text-[10px] font-semibold text-copper">
                          AI match · {Math.round((l.matchConfidence ?? 0) * 100)}%
                        </div>
                      )}
                      {l.matchExplanation && l.matchSource === 'ai' && (
                        <div className="mt-0.5 text-[10px] font-normal text-ink-4">
                          {l.matchExplanation}
                        </div>
                      )}
                      {l.aiSuggestion && (
                        <div className="mt-1 text-[10px] font-normal text-amber">
                          Possible PO match: {l.aiSuggestion.productName} ·{' '}
                          {Math.round(l.aiSuggestion.confidence * 100)}% — {l.aiSuggestion.reason}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-ink-2">
                      {l.poQuantity ?? '—'} · {l.poUnitPriceCents ? lkr(l.poUnitPriceCents) : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-ink-2">
                      {l.billedQuantity ?? '—'} ·{' '}
                      {l.billedUnitPriceCents ? lkr(l.billedUnitPriceCents) : '—'}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-3 text-right font-mono',
                        l.varianceCents !== 0 ? 'font-semibold text-rose' : 'text-ink-4',
                      )}
                    >
                      {lkr(l.varianceCents)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[9.5px] font-mono font-bold uppercase tracking-wider ring-1',
                          l.status === 'matched'
                            ? 'bg-mint/10 text-mint ring-mint/25'
                            : l.status === 'price_variance'
                              ? 'bg-rose/10 text-rose ring-rose/25'
                              : l.status === 'quantity_variance'
                                ? 'bg-amber/10 text-amber ring-amber/30'
                                : 'bg-ink/[0.06] text-ink-3 ring-ink/15',
                        )}
                      >
                        {l.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {result.status === 'perfect_match' ? (
              <Button variant="success" size="sm" onClick={onReleasePayment}>
                <CheckCircleIcon size={14} /> Approve invoice &amp; release escrow
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowClaimDrawer(true)}>
                <AlertTriangleIcon size={14} /> File discrepancy claim
              </Button>
            )}
          </div>

          {showClaimDrawer && (
            <div className="space-y-3 rounded-xl bg-amber/[0.06] p-4 ring-1 ring-amber/30">
              <div>
                <h4 className="text-sm font-semibold text-ink-1">Claim to supplier</h4>
                <p className="mt-0.5 text-xs text-ink-3">
                  Drafted from the line discrepancies. Review and edit before sending.
                </p>
              </div>
              <Textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                rows={4}
                className="bg-paper text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowClaimDrawer(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitClaim}
                  loading={claimLoading}
                  disabled={claimLoading || !claimMessage.trim()}
                >
                  Send claim
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Pillar({
  n,
  label,
  value,
  note,
  tone,
}: {
  n: number;
  label: string;
  value: string;
  note: string;
  tone?: 'mint' | 'amber' | 'rose';
}) {
  return (
    <div className="rounded-xl bg-bone/30 p-4 ring-1 ring-ink/[0.07]">
      <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
        <span className="flex size-4 items-center justify-center rounded-full bg-ink text-[9px] text-volt">
          {n}
        </span>
        {label}
      </div>
      <div className="mt-2 font-mono text-base font-bold tabular-nums text-ink-1">{value}</div>
      <div
        className={cn(
          'mt-0.5 text-[11px] capitalize',
          tone === 'mint'
            ? 'text-mint'
            : tone === 'amber'
              ? 'text-amber'
              : tone === 'rose'
                ? 'font-semibold text-rose'
                : 'text-ink-4',
        )}
      >
        {note}
      </div>
    </div>
  );
}
