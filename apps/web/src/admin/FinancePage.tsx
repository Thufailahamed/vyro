import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useFailedPayouts, useRetryPayout, useIssueRefund } from './useAdminFinance';

type Tab = 'payouts' | 'refunds' | 'invoices' | 'ledger';

export function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'payouts';
  const switchTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', next);
    setParams(p);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header>
        <p className="vyro-kicker">Operations</p>
        <h1 className="vyro-display text-2xl">Finance</h1>
      </header>
      <nav className="flex gap-2 border-b border-ink/10">
        <TabBtn active={tab === 'payouts'} onClick={() => switchTab('payouts')}>Payout retries</TabBtn>
        <TabBtn active={tab === 'refunds'} onClick={() => switchTab('refunds')}>Issue refund</TabBtn>
        <TabBtn active={tab === 'invoices'} onClick={() => switchTab('invoices')}>Invoices</TabBtn>
        <TabBtn active={tab === 'ledger'} onClick={() => switchTab('ledger')}>Ledger</TabBtn>
      </nav>
      {tab === 'payouts' ? <PayoutRetryTab /> : null}
      {tab === 'refunds' ? <IssueRefundTab /> : null}
      {tab === 'invoices' ? <InvoicesTab /> : null}
      {tab === 'ledger' ? <LedgerTab /> : null}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${active ? 'border-volt text-volt' : 'border-transparent text-ink-500 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function PayoutRetryTab() {
  const { data, isLoading, isError, refetch } = useFailedPayouts();
  const retry = useRetryPayout();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const failed = data?.failedPayouts ?? [];

  return (
    <div className="space-y-3">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (min 5 chars, required for retry)"
        className="w-full max-w-xl border px-2 py-1 text-sm"
      />
      {error ? <p className="text-xs text-rose">{error}</p> : null}
      {isLoading ? <p className="text-sm text-ink-4">Loading…</p> : null}
      {isError ? (
        <p className="text-sm text-rose">Failed to load. <button type="button" className="underline" onClick={() => refetch()}>Retry</button></p>
      ) : null}
      {!isLoading && !isError ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase text-ink-4">
              <th className="py-2">Payout</th>
              <th className="py-2">Status</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {failed.map((p) => (
              <tr key={p.id} className="border-t border-ink/10">
                <td className="py-2 font-mono text-xs">{p.id}</td>
                <td className="py-2">{p.status}</td>
                <td className="py-2">
                  <button
                    type="button"
                    disabled={retry.isPending || reason.trim().length < 5}
                    onClick={() =>
                      retry.mutate(
                        { id: p.id, reason, idempotencyKey: crypto.randomUUID() },
                        { onError: (e: unknown) => setError(e instanceof ApiError ? `${e.code}: ${e.message}` : 'Retry failed') },
                      )
                    }
                    className="px-2 py-1 bg-ink text-paper text-xs disabled:opacity-50"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
            {failed.length === 0 ? (
              <tr><td colSpan={3} className="py-6 text-center text-ink-4">No failed payouts.</td></tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      <p className="text-xs text-ink-4">
        Full payout batches: <Link to="/admin/money?tab=payouts" className="underline">Money → Payouts</Link>
      </p>
    </div>
  );
}

function IssueRefundTab() {
  const issue = useIssueRefund();
  const [paymentId, setPaymentId] = useState('');
  const [amountCents, setAmountCents] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <form
      className="space-y-2 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setDone(false);
        issue.mutate(
          { paymentId, amountCents: Number(amountCents), reason, idempotencyKey: crypto.randomUUID() },
          {
            onSuccess: () => { setDone(true); setPaymentId(''); setAmountCents(''); setReason(''); },
            onError: (er: unknown) => setError(er instanceof ApiError ? `${er.code}: ${er.message}` : 'Issue failed'),
          },
        );
      }}
    >
      <input value={paymentId} onChange={(e) => setPaymentId(e.target.value)} placeholder="Payment ID" className="w-full border px-2 py-1 text-sm" />
      <input value={amountCents} onChange={(e) => setAmountCents(e.target.value)} placeholder="Amount (cents)" inputMode="numeric" className="w-full border px-2 py-1 text-sm" />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (min 5 chars, required)" className="w-full border px-2 py-1 text-sm" />
      {error ? <p className="text-xs text-rose">{error}</p> : null}
      {done ? <p className="text-xs text-mint">Refund issued and audited.</p> : null}
      <button
        type="submit"
        disabled={issue.isPending || !paymentId || !amountCents || reason.trim().length < 5}
        className="px-3 py-1 bg-ink text-paper text-sm disabled:opacity-50"
      >
        {issue.isPending ? 'Issuing…' : 'Issue refund'}
      </button>
      <p className="text-xs text-ink-4">
        Refund queue: <Link to="/admin/money?tab=refunds" className="underline">Money → Refunds</Link>
      </p>
    </form>
  );
}

function InvoicesTab() {
  return (
    <div className="space-y-2 text-sm">
      <p>Issue, void, and reissue invoices from the Money workspace.</p>
      <p><Link to="/admin/money?tab=refunds" className="underline">Money → Refunds</Link> · <Link to="/admin/payments" className="underline">All payments →</Link></p>
      <p><a className="underline" href="/api/admin/audit/export?limit=1000">Export audit CSV</a></p>
    </div>
  );
}

function LedgerTab() {
  return (
    <div className="space-y-2 text-sm">
      <p>Immutable ledger viewer lives in the Money workspace.</p>
      <p><Link to="/admin/money?tab=ledger" className="underline">Money → Ledger</Link></p>
      <p><a className="underline" href="/api/admin/audit/export?limit=1000">Export audit CSV</a></p>
    </div>
  );
}
