import { useParams } from 'react-router-dom';
import { ErrorBanner } from '@/components/ui';
import { usePermission } from './lib/permissions';
import { useAdminPaymentDetail } from './useAdminPaymentDetail';
import {
  AdminPage,
  AdminPageHeader,
  Callout,
  Card,
  CardHeader,
  DetailList,
  EmptyBlock,
  Pill,
  Skeleton,
  StatCard,
  StatGrid,
  StatusPill,
  TableCard,
} from './ui';

function fmtCents(c: number, currency = 'LKR') {
  return `${(c / 100).toFixed(2)} ${currency}`;
}
function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-xs">{children}</span>;

function Count({ n }: { n: number }) {
  return <Pill className="num-tabular">{n}</Pill>;
}

export function PaymentDetailPage() {
  const can = usePermission('payment:read');
  const { id = '' } = useParams<{ id: string }>();
  const q = useAdminPaymentDetail(id);

  if (!can) return <ErrorBanner message="You need payment:read permission" />;
  if (!id) return <ErrorBanner message="No payment id" />;
  if (q.isLoading) {
    return (
      <AdminPage>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <StatGrid cols={3}>
          {[0, 1, 2].map((i) => <StatCard key={i} label="Loading" value="" loading />)}
        </StatGrid>
        <Skeleton className="h-64 w-full" />
      </AdminPage>
    );
  }
  if (q.isError) return <ErrorBanner message={(q.error as Error).message} />;
  const b = q.data!;
  const p = b.payment;
  const events = b.events ?? [];

  const summaryItems = [
    { key: 'method', label: 'Method', value: p.method },
    { key: 'created', label: 'Created', value: fmtTs(p.createdAt) },
    { key: 'paid', label: 'Paid', value: fmtTs(p.paidAt) },
    { key: 'confirmed', label: 'Confirmed', value: fmtTs(p.confirmedAt) },
    { key: 'confirmedBy', label: 'Confirmed by', value: p.confirmedByUserId ? <Mono>{p.confirmedByUserId}</Mono> : '—' },
    ...(p.transactionReference ? [{ key: 'txn', label: 'Txn ref', value: <Mono>{p.transactionReference}</Mono> }] : []),
    ...(p.gatewayRef ? [{ key: 'gw', label: 'Gateway ref', value: <Mono>{p.gatewayRef}</Mono> }] : []),
    ...(p.idempotencyKey ? [{ key: 'idem', label: 'Idempotency', value: <Mono>{p.idempotencyKey}</Mono> }] : []),
    ...(p.notes ? [{ key: 'notes', label: 'Notes', value: p.notes }] : []),
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/payments', label: 'Back to payments' }}
        kicker="Payments"
        title={<span className="font-mono text-2xl sm:text-3xl">{`Payment ${p.id.slice(0, 24)}…`}</span>}
        description={`${p.poNumber} · ${p.businessName} → ${p.supplierName}`}
        meta={
          <>
            <StatusPill status={p.status} />
            <Pill>{p.method}</Pill>
          </>
        }
      />

      {p.statusReason ? (
        <Callout tone="danger" title="Reason">{p.statusReason}</Callout>
      ) : null}

      <StatGrid cols={3}>
        <StatCard label="Amount" value={<span className="num-tabular">{fmtCents(p.amountCents, p.currency)}</span>} />
        <StatCard label="Fee" value={<span className="num-tabular">{fmtCents(p.feeCents, p.currency)}</span>} />
        <StatCard label="Net" value={<span className="num-tabular">{fmtCents(p.netCents, p.currency)}</span>} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader title="Summary" />
          <DetailList
            className="mt-5"
            items={[{ key: 'status', label: 'Status', value: <StatusPill status={p.status} /> }, ...summaryItems]}
          />
        </Card>

        <Card>
          <CardHeader title="Purchase order" />
          {b.purchaseOrder ? (
            <DetailList
              className="mt-5"
              items={[
                { key: 'po', label: 'PO', value: <span className="font-mono">{b.purchaseOrder.poNumber}</span> },
                { key: 'status', label: 'Status', value: <StatusPill status={b.purchaseOrder.status} /> },
                { key: 'total', label: 'Total', value: <span className="num-tabular">{fmtCents(b.purchaseOrder.totalCents, p.currency)}</span> },
                { key: 'created', label: 'Created', value: fmtTs(b.purchaseOrder.createdAt) },
                { key: 'delivery', label: 'Delivery', value: fmtTs(b.purchaseOrder.deliveryAt) },
              ]}
            />
          ) : <p className="mt-5 text-sm text-ink-4">Not linked</p>}
        </Card>

        <Card>
          <CardHeader title="Parties" />
          <div className="mt-5 space-y-5">
            {b.business ? (
              <DetailList
                items={[
                  { key: 'b', label: 'Business', value: <>{b.business.name} <span className="block font-mono text-xs text-ink-4">{b.business.id}</span></> },
                  { key: 'be', label: 'Email', value: b.business.email ?? '—' },
                ]}
              />
            ) : null}
            {b.supplier ? (
              <DetailList
                className={b.business ? 'border-t border-ink/[0.07] pt-5' : undefined}
                items={[
                  { key: 's', label: 'Supplier', value: <>{b.supplier.name} <span className="block font-mono text-xs text-ink-4">{b.supplier.id}</span></> },
                  { key: 'se', label: 'Email', value: b.supplier.email ?? '—' },
                ]}
              />
            ) : null}
          </div>
        </Card>
      </div>

      {p.gatewayPayload ? (
        <Card>
          <CardHeader title="Gateway payload" description="Raw payload as received from the provider" />
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bone p-3 font-mono text-[11px] text-ink-3 scrollbar-thin">{p.gatewayPayload}</pre>
        </Card>
      ) : null}

      <TableCard title="Refunds" actions={<Count n={b.refunds.length} />}>
        {b.refunds.length ? (
          <table className="admin-table">
            <thead><tr>
              <th>Refund</th><th className="num">Amount</th><th>Status</th><th>Reason</th><th>Processed</th>
            </tr></thead>
            <tbody>
              {b.refunds.map((r) => (
                <tr key={r.id}>
                  <td><Mono>{r.id}</Mono></td>
                  <td className="num">{fmtCents(r.amountCents, p.currency)}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="text-ink-3">{r.reason ?? '—'}</td>
                  <td className="whitespace-nowrap text-ink-3">{fmtTs(r.processedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyBlock className="py-8" title="No refunds" />}
      </TableCard>

      <TableCard title="Chargebacks" actions={<Count n={b.chargebacks.length} />}>
        {b.chargebacks.length ? (
          <table className="admin-table">
            <thead><tr>
              <th>CB</th><th>Status</th><th>Reason</th><th>Opened</th><th>Resolved</th><th>Notes</th>
            </tr></thead>
            <tbody>
              {b.chargebacks.map((cb) => (
                <tr key={cb.id}>
                  <td><Mono>{cb.id}</Mono></td>
                  <td><StatusPill status={cb.status} /></td>
                  <td className="text-ink-3">{cb.reason}</td>
                  <td className="whitespace-nowrap text-ink-3">{fmtTs(cb.createdAt)}</td>
                  <td className="whitespace-nowrap text-ink-3">{fmtTs(cb.resolvedAt)}</td>
                  <td className="text-ink-3">{cb.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyBlock className="py-8" title="No chargebacks" />}
      </TableCard>

      <TableCard title="Notification history" actions={<Count n={events.length} />}>
        {events.length ? (
          <table className="admin-table">
            <thead><tr>
              <th>Received</th><th>Provider</th><th>Event</th><th>Code</th><th>Gateway payment</th><th>Status</th>
            </tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-ink-3">{fmtTs(e.receivedAt)}</td>
                  <td><Mono>{e.provider}</Mono></td>
                  <td><Mono>{e.eventType}</Mono></td>
                  <td className="num-tabular">{e.statusCode ?? '—'}</td>
                  <td><Mono>{e.providerPaymentId ?? '—'}</Mono></td>
                  <td><StatusPill status={e.processingStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyBlock className="py-8" title="No notifications received" />}
      </TableCard>

      <TableCard title="Ledger entries" actions={<Count n={b.ledger.length} />}>
        {b.ledger.length ? (
          <table className="admin-table">
            <thead><tr>
              <th>When</th><th>Account</th><th>Direction</th><th className="num">Amount</th><th>Ref</th><th>Description</th>
            </tr></thead>
            <tbody>
              {b.ledger.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-ink-3">{fmtTs(l.createdAt)}</td>
                  <td><Mono>{l.accountType}</Mono></td>
                  <td><Pill tone={l.direction === 'credit' ? 'success' : 'danger'}>{l.direction}</Pill></td>
                  <td className="num">{fmtCents(l.amountCents, l.currency)}</td>
                  <td><Mono>{l.refType}/{l.refId.slice(0, 12)}</Mono></td>
                  <td className="text-ink-3">{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyBlock className="py-8" title="No ledger activity" />}
      </TableCard>
    </AdminPage>
  );
}
