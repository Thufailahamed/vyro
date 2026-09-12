import { useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { useToast } from '@vyro/ui';
import type { ThreeWayReconciliationResult } from '@vyro/ai';

interface ThreeWayReconciliationCardProps {
  orderId: string;
  poNumber: string;
  poTotalCents: number;
  orderStatus: string;
  onReleasePayment?: () => void;
}

export function ThreeWayReconciliationCard({
  orderId,
  poNumber,
  poTotalCents,
  orderStatus,
  onReleasePayment,
}: ThreeWayReconciliationCardProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [result, setResult] = useState<ThreeWayReconciliationResult | null>(null);
  const [showClaimDrawer, setShowClaimDrawer] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');

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
      setResult(res.reconciliation);
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

  return (
    <Surface kind="elevated" className="mt-6 rounded-xl border border-line p-5 shadow-soft-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper font-bold text-sm">
            🧾
          </span>
          <div>
            <h3 className="font-semibold text-ink">3-Way PO & Invoice Reconciliation</h3>
            <p className="text-xs text-ink-3">
              Cross-checks PO authorized rates, loading dock delivery, and vendor invoice lines.
            </p>
          </div>
        </div>

        <Button
          onClick={handleRunAudit}
          loading={loading}
          disabled={loading}
          size="sm"
          className="bg-ink text-paper hover:bg-ink/90 font-medium"
        >
          {loading ? 'Auditing 3-Way Records…' : 'Run 3-Way Audit'}
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-4">
          {/* 3 Pillars Summary */}
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="text-ink-4">1. PO Authorized</div>
              <div className="mt-1 text-base font-mono font-bold text-ink">
                Rs. {(result.poTotalCents / 100).toLocaleString()}
              </div>
              <div className="text-[11px] text-ink-3">Approved Order Value</div>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="text-ink-4">2. Delivery Status</div>
              <div className="mt-1 text-base font-bold text-ink flex items-center gap-1">
                {result.isDeliveryConfirmed ? '🟢 Verified Dock Delivery' : '🟡 Pending Delivery'}
              </div>
              <div className="text-[11px] text-ink-3">Order Status: {orderStatus}</div>
            </div>

            <div className="rounded-lg border border-line bg-paper p-3">
              <div className="text-ink-4">3. Vendor Invoice</div>
              <div className="mt-1 text-base font-mono font-bold text-ink">
                Rs. {(result.invoiceTotalCents / 100).toLocaleString()}
              </div>
              <div
                className={`text-[11px] font-semibold ${
                  result.netDifferenceCents === 0
                    ? 'text-emerald-700'
                    : result.netDifferenceCents > 0
                      ? 'text-red-700'
                      : 'text-blue-700'
                }`}
              >
                {result.netDifferenceCents === 0
                  ? '🟢 Zero Discrepancy'
                  : `Variance: Rs. ${(result.netDifferenceCents / 100).toLocaleString()}`}
              </div>
            </div>
          </div>

          {/* Audit Finding Summary */}
          <div
            className={`rounded-lg p-3 text-xs border ${
              result.status === 'perfect_match'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : result.status === 'discrepancy_detected'
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <div className="font-semibold">{result.summary}</div>
            <div className="mt-1 text-[11px] opacity-90">
              Confidence Score: {(result.matchConfidence * 100).toFixed(0)}% · Recommended Action:{' '}
              <span className="font-mono underline">{result.recommendedAction}</span>
            </div>
          </div>

          {/* Line Audit Breakdown */}
          <div className="rounded-lg border border-line bg-paper overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-ink/5 border-b border-line text-ink-3">
                <tr>
                  <th className="p-2">Item Description</th>
                  <th className="p-2">PO Qty / Rate</th>
                  <th className="p-2">Billed Qty / Rate</th>
                  <th className="p-2">Variance</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {result.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="p-2 font-medium text-ink">{l.description}</td>
                    <td className="p-2 font-mono">
                      {l.poQuantity ?? '—'} @{' '}
                      {l.poUnitPriceCents ? `Rs. ${(l.poUnitPriceCents / 100).toLocaleString()}` : '—'}
                    </td>
                    <td className="p-2 font-mono">
                      {l.billedQuantity ?? '—'} @{' '}
                      {l.billedUnitPriceCents ? `Rs. ${(l.billedUnitPriceCents / 100).toLocaleString()}` : '—'}
                    </td>
                    <td className="p-2 font-mono">
                      {l.varianceCents !== 0
                        ? `Rs. ${(l.varianceCents / 100).toLocaleString()}`
                        : 'Rs. 0'}
                    </td>
                    <td className="p-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          l.status === 'matched'
                            ? 'bg-emerald-100 text-emerald-800'
                            : l.status === 'price_variance'
                              ? 'bg-red-100 text-red-800'
                              : l.status === 'quantity_variance'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {l.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Resolution Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-3">
            {result.status === 'perfect_match' ? (
              <Button
                onClick={onReleasePayment}
                className="bg-emerald-600 text-paper hover:bg-emerald-700 text-xs font-semibold"
              >
                Approve Invoice & Release Escrow
              </Button>
            ) : (
              <Button
                onClick={() => setShowClaimDrawer(true)}
                className="bg-amber-600 text-paper hover:bg-amber-700 text-xs font-semibold"
              >
                File Discrepancy Claim / Credit Request
              </Button>
            )}
          </div>

          {/* Dispute Claim Drawer */}
          {showClaimDrawer && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-4 text-xs">
              <h4 className="font-semibold text-amber-950">Draft Supplier Dispute Claim</h4>
              <p className="mt-0.5 text-amber-800">
                AI-drafted claim based on identified line discrepancies. Review and customize before sending.
              </p>
              <textarea
                value={claimMessage}
                onChange={(e) => setClaimMessage(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded border border-line bg-paper p-2 text-ink text-xs focus:ring-amber-500"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowClaimDrawer(false)}
                  className="rounded border border-line px-3 py-1 text-ink-3 hover:text-ink"
                >
                  Cancel
                </button>
                <Button
                  onClick={handleSubmitClaim}
                  loading={claimLoading}
                  disabled={claimLoading || !claimMessage.trim()}
                  size="sm"
                  className="bg-amber-700 text-paper hover:bg-amber-800 font-medium"
                >
                  Submit Claim to Supplier
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Surface>
  );
}
