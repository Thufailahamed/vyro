import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Surface, ErrorBanner, Button } from '@/components/ui';
import { usePermission } from './lib/permissions';
import {
  useRefundQueue,
  useApproveRefund,
  useRejectRefund,
  usePayoutBatchQueue,
  useCreatePayoutBatch,
  useApprovePayoutBatch,
  useLedgerSummary,
  useOpenChargebacks,
  useResolveChargeback,
} from './useAdminMoney';

type Tab = 'refunds' | 'payouts' | 'ledger' | 'chargebacks';

export function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'refunds';
  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Money & Orders" sub="Approve refunds, payout batches, view ledger, resolve chargebacks" />
      <div className="text-xs">
        <Link to="/admin/payments" className="text-volt underline">All payments →</Link>
      </div>
      <nav className="flex gap-2 border-b border-ink/10">
        <TabBtn active={tab === 'refunds'} onClick={() => switchTab('refunds')}>Refund queue</TabBtn>
        <TabBtn active={tab === 'payouts'} onClick={() => switchTab('payouts')}>Payout batches</TabBtn>
        <TabBtn active={tab === 'ledger'} onClick={() => switchTab('ledger')}>Ledger</TabBtn>
        <TabBtn active={tab === 'chargebacks'} onClick={() => switchTab('chargebacks')}>Chargebacks</TabBtn>
      </nav>
      {tab === 'refunds' ? <RefundQueueTab /> : null}
      {tab === 'payouts' ? <PayoutBatchesTab /> : null}
      {tab === 'ledger' ? <LedgerTab /> : null}
      {tab === 'chargebacks' ? <ChargebacksTab /> : null}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active ? 'border-volt text-volt' : 'border-transparent text-ink-500 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function fmtCents(c: number) {
  return `${(c / 100).toFixed(2)} LKR`;
}

function fmtTs(t: number | null | undefined) {
  if (!t) return '—';
  return new Date(t).toISOString().slice(0, 16).replace('T', ' ');
}

function RefundQueueTab() {
  const canRefund = usePermission('payment:refund');
  const queue = useRefundQueue();
  const approve = useApproveRefund();
  const reject = useRejectRefund();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  if (!canRefund) return <ErrorBanner message="You need payment:refund permission" />;
  return (
    <Surface className="p-4">
      {queue.isError ? <ErrorBanner message={(queue.error as Error).message} /> : null}
      {reject.isError ? <ErrorBanner message={(reject.error as Error).message} /> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="py-2">Refund</th>
            <th>Payment</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Requested</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(queue.data ?? []).map((r) => (
            <tr key={r.id} className="border-t border-ink/10">
              <td className="py-2 font-mono text-xs">{r.id}</td>
              <td className="font-mono text-xs">{r.paymentId}</td>
              <td>{fmtCents(r.amountCents)}</td>
              <td>{r.status}</td>
              <td>{fmtTs(r.createdAt)}</td>
              <td className="space-x-2 text-right">
                {r.status === 'requested' ? (
                  rejecting === r.id ? (
                    <span className="inline-flex gap-2 items-center">
                      <input
                        autoFocus
                        placeholder="Rejection reason"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="border border-ink/20 rounded px-2 py-1 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!rejectReason.trim() || reject.isPending}
                        onClick={() =>
                          reject.mutate(
                            { id: r.id, reason: rejectReason.trim() },
                            {
                              onSuccess: () => {
                                setRejecting(null);
                                setRejectReason('');
                              },
                            },
                          )
                        }
                      >
                        Confirm
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <>
                      <Button size="sm" variant="primary" onClick={() => approve.mutate(r.id)}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejecting(r.id);
                          setRejectReason('');
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )
                ) : null}
              </td>
            </tr>
          ))}
          {!queue.data?.length ? (
            <tr><td colSpan={6} className="py-4 text-center text-ink-500">No pending refunds</td></tr>
          ) : null}
        </tbody>
      </table>
    </Surface>
  );
}

function PayoutBatchesTab() {
  const canApprove = usePermission('payout:approve');
  const canRead = usePermission('payout:read');
  const queue = usePayoutBatchQueue();
  const create = useCreatePayoutBatch();
  const approve = useApprovePayoutBatch();
  const [note, setNote] = useState('');
  if (!canRead) return <ErrorBanner message="You need payout:read permission" />;
  return (
    <div className="space-y-4">
      {canApprove ? (
        <Surface className="p-4">
          <h3 className="text-sm font-medium mb-2">Create batch</h3>
          <p className="text-xs text-ink-500 mb-2">
            Groups every unbatched pending payout into one approval batch.
          </p>
          {create.isError ? <ErrorBanner message={(create.error as Error).message} /> : null}
          <div className="flex gap-2 items-end">
            <label className="flex flex-col text-xs flex-1">
              <span className="text-ink-500">Note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                className="border border-ink/20 rounded px-2 py-1"
              />
            </label>
            <Button
              variant="primary"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(note.trim() ? { note: note.trim() } : {}, {
                  onSuccess: () => setNote(''),
                })
              }
            >
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </Surface>
      ) : null}
      <Surface className="p-4">
        {queue.isError ? <ErrorBanner message={(queue.error as Error).message} /> : null}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="py-2">Batch</th>
              <th>Created</th>
              <th>Note</th>
              <th>Total</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(queue.data ?? []).map((b) => (
              <tr key={b.id} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{b.id}</td>
                <td className="text-xs">{fmtTs(b.createdAt)}</td>
                <td className="text-xs">{b.note ?? '—'}</td>
                <td>{fmtCents(b.totalCents)}</td>
                <td>{b.status}</td>
                <td className="text-right">
                  {canApprove && b.status === 'pending' ? (
                    <Button size="sm" variant="primary" onClick={() => approve.mutate(b.id)}>
                      Approve
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!queue.data?.length ? (
              <tr><td colSpan={6} className="py-4 text-center text-ink-500">No batches</td></tr>
            ) : null}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}

function LedgerTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const summary = useLedgerSummary({
    from: from ? new Date(from).getTime() : undefined,
    to: to ? new Date(to).getTime() : undefined,
  });
  return (
    <Surface className="p-4 space-y-4">
      <div className="flex gap-2 items-end">
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">From</span>
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-ink/20 rounded px-2 py-1" />
        </label>
        <label className="flex flex-col text-xs">
          <span className="text-ink-500">To</span>
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="border border-ink/20 rounded px-2 py-1" />
        </label>
      </div>
      {summary.isError ? <ErrorBanner message={(summary.error as Error).message} /> : null}
      {summary.data ? (
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Credit" value={fmtCents(summary.data.totalCreditCents)} />
          <Stat label="Debit" value={fmtCents(summary.data.totalDebitCents)} />
          <Stat label="Net" value={fmtCents(summary.data.netCents)} />
        </div>
      ) : null}
      {summary.data ? (
        <div>
          <h3 className="text-sm font-medium mb-2">By account type</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-2">Account</th>
                <th>Credit</th>
                <th>Debit</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.byAccountType.map((row) => (
                <tr key={row.accountType} className="border-t border-ink/10">
                  <td className="py-2">{row.accountType}</td>
                  <td>{fmtCents(row.creditCents)}</td>
                  <td>{fmtCents(row.debitCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Surface>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 rounded p-3">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}

function ChargebacksTab() {
  const canRefund = usePermission('payment:refund');
  const list = useOpenChargebacks();
  const resolve = useResolveChargeback();
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!canRefund) return <ErrorBanner message="You need payment:refund permission" />;
  return (
    <Surface className="p-4">
      {list.isError ? <ErrorBanner message={(list.error as Error).message} /> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-500">
            <th className="py-2">CB</th>
            <th>Payment</th>
            <th>Reason</th>
            <th>Opened</th>
            <th>Notes</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((cb) => (
            <tr key={cb.id} className="border-t border-ink/10">
              <td className="py-2 font-mono text-xs">{cb.id}</td>
              <td className="font-mono text-xs">{cb.paymentId}</td>
              <td>{cb.reason}</td>
              <td>{fmtTs(cb.createdAt)}</td>
              <td>
                <input
                  className="border border-ink/20 rounded px-2 py-1 w-40"
                  value={notes[cb.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [cb.id]: e.target.value })}
                  placeholder="Optional notes"
                />
              </td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    resolve.mutate({
                      id: cb.id,
                      ...(notes[cb.id] ? { notes: notes[cb.id] } : {}),
                    })
                  }
                >
                  Resolve
                </Button>
              </td>
            </tr>
          ))}
          {!list.data?.length ? (
            <tr><td colSpan={6} className="py-4 text-center text-ink-500">No open chargebacks</td></tr>
          ) : null}
        </tbody>
      </table>
    </Surface>
  );
}
