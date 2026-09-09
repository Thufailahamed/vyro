import { Link, useParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner } from '@/components/ui';
import { usePermission } from './lib/permissions';
import { useAdminPaymentDetail } from './useAdminPaymentDetail';

function fmtCents(c: number, currency = 'LKR') {
  return `${(c / 100).toFixed(2)} ${currency}`;
}
function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

export function PaymentDetailPage() {
  const can = usePermission('payment:read');
  const { id = '' } = useParams<{ id: string }>();
  const q = useAdminPaymentDetail(id);

  if (!can) return <ErrorBanner message="You need payment:read permission" />;
  if (!id) return <ErrorBanner message="No payment id" />;
  if (q.isLoading) return <div className="text-sm text-ink-500">Loading…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} />;
  const b = q.data!;
  const p = b.payment;

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <Link to="/admin/payments" className="text-volt underline">← Back to payments</Link>
      </div>
      <PageHeader
        title={`Payment ${p.id.slice(0, 24)}…`}
        sub={`${p.poNumber} · ${p.businessName} → ${p.supplierName}`}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Surface className="p-4">
          <h3 className="text-xs text-ink-500 uppercase mb-2">Summary</h3>
          <dl className="text-sm space-y-1">
            <Row label="Status"><span className="font-mono uppercase">{p.status}</span></Row>
            <Row label="Method">{p.method}</Row>
            <Row label="Amount">{fmtCents(p.amountCents, p.currency)}</Row>
            <Row label="Fee">{fmtCents(p.feeCents, p.currency)}</Row>
            <Row label="Net">{fmtCents(p.netCents, p.currency)}</Row>
            <Row label="Created">{fmtTs(p.createdAt)}</Row>
            <Row label="Paid">{fmtTs(p.paidAt)}</Row>
            <Row label="Confirmed">{fmtTs(p.confirmedAt)}</Row>
            <Row label="Confirmed by">{p.confirmedByUserId ?? '—'}</Row>
            {p.transactionReference ? <Row label="Txn ref"><span className="font-mono text-xs">{p.transactionReference}</span></Row> : null}
            {p.gatewayRef ? <Row label="Gateway ref"><span className="font-mono text-xs">{p.gatewayRef}</span></Row> : null}
            {p.idempotencyKey ? <Row label="Idempotency"><span className="font-mono text-xs">{p.idempotencyKey}</span></Row> : null}
            {p.statusReason ? <Row label="Reason"><span className="text-rose">{p.statusReason}</span></Row> : null}
            {p.notes ? <Row label="Notes">{p.notes}</Row> : null}
          </dl>
        </Surface>

        <Surface className="p-4">
          <h3 className="text-xs text-ink-500 uppercase mb-2">Purchase order</h3>
          {b.purchaseOrder ? (
            <dl className="text-sm space-y-1">
              <Row label="PO"><span className="font-mono">{b.purchaseOrder.poNumber}</span></Row>
              <Row label="Status">{b.purchaseOrder.status}</Row>
              <Row label="Total">{fmtCents(b.purchaseOrder.totalCents, p.currency)}</Row>
              <Row label="Created">{fmtTs(b.purchaseOrder.createdAt)}</Row>
              <Row label="Delivery">{fmtTs(b.purchaseOrder.deliveryAt)}</Row>
            </dl>
          ) : <div className="text-sm text-ink-500">Not linked</div>}
        </Surface>

        <Surface className="p-4">
          <h3 className="text-xs text-ink-500 uppercase mb-2">Parties</h3>
          {b.business ? (
            <dl className="text-sm space-y-1">
              <Row label="Business"><span className="font-mono">{b.business.id}</span> · {b.business.name}</Row>
              <Row label="Email">{b.business.email ?? '—'}</Row>
            </dl>
          ) : null}
          {b.supplier ? (
            <dl className="text-sm space-y-1 mt-2">
              <Row label="Supplier"><span className="font-mono">{b.supplier.id}</span> · {b.supplier.name}</Row>
              <Row label="Email">{b.supplier.email ?? '—'}</Row>
            </dl>
          ) : null}
        </Surface>
      </div>

      {p.gatewayPayload ? (
        <Surface className="p-4">
          <h3 className="text-xs text-ink-500 uppercase mb-2">Gateway payload</h3>
          <pre className="text-[10px] whitespace-pre-wrap break-all bg-bone p-2 rounded">{p.gatewayPayload}</pre>
        </Surface>
      ) : null}

      <Surface className="p-4">
        <h3 className="text-xs text-ink-500 uppercase mb-2">Refunds ({b.refunds.length})</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500">
            <th>Refund</th><th>Amount</th><th>Status</th><th>Reason</th><th>Processed</th>
          </tr></thead>
          <tbody>
            {b.refunds.map((r) => (
              <tr key={r.id} className="border-t border-ink/10">
                <td className="font-mono text-xs">{r.id}</td>
                <td>{fmtCents(r.amountCents, p.currency)}</td>
                <td>{r.status}</td>
                <td className="text-xs">{r.reason ?? '—'}</td>
                <td className="text-xs">{fmtTs(r.processedAt)}</td>
              </tr>
            ))}
            {!b.refunds.length ? <tr><td colSpan={5} className="py-3 text-center text-ink-500">No refunds</td></tr> : null}
          </tbody>
        </table>
      </Surface>

      <Surface className="p-4">
        <h3 className="text-xs text-ink-500 uppercase mb-2">Chargebacks ({b.chargebacks.length})</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500">
            <th>CB</th><th>Status</th><th>Reason</th><th>Opened</th><th>Resolved</th><th>Notes</th>
          </tr></thead>
          <tbody>
            {b.chargebacks.map((cb) => (
              <tr key={cb.id} className="border-t border-ink/10">
                <td className="font-mono text-xs">{cb.id}</td>
                <td>{cb.status}</td>
                <td className="text-xs">{cb.reason}</td>
                <td className="text-xs">{fmtTs(cb.createdAt)}</td>
                <td className="text-xs">{fmtTs(cb.resolvedAt)}</td>
                <td className="text-xs">{cb.notes ?? '—'}</td>
              </tr>
            ))}
            {!b.chargebacks.length ? <tr><td colSpan={6} className="py-3 text-center text-ink-500">No chargebacks</td></tr> : null}
          </tbody>
        </table>
      </Surface>

      <Surface className="p-4">
        <h3 className="text-xs text-ink-500 uppercase mb-2">Ledger entries ({b.ledger.length})</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-500">
            <th>When</th><th>Account</th><th>Dir</th><th>Amount</th><th>Ref</th><th>Description</th>
          </tr></thead>
          <tbody>
            {b.ledger.map((l) => (
              <tr key={l.id} className="border-t border-ink/10">
                <td className="text-xs">{fmtTs(l.createdAt)}</td>
                <td className="font-mono text-xs">{l.accountType}</td>
                <td className={l.direction === 'credit' ? 'text-mint' : 'text-rose'}>{l.direction}</td>
                <td className="tabular-nums">{fmtCents(l.amountCents, l.currency)}</td>
                <td className="font-mono text-xs">{l.refType}/{l.refId.slice(0, 12)}</td>
                <td className="text-xs">{l.description}</td>
              </tr>
            ))}
            {!b.ledger.length ? <tr><td colSpan={6} className="py-3 text-center text-ink-500">No ledger activity</td></tr> : null}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
