import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { PageHeader, Button, EmptyState, ErrorBanner, Input, Label } from '@/components/ui';
import { useToast } from '@vyro/ui';
import { Money, Stat, StatusPill, time, useConfirm } from '@/accounts/shared';
import { useSupplierId } from './useSupplierId';

type Tab = 'earnings' | 'settlements' | 'payouts' | 'transactions' | 'bank';

export function SupplierAccountsPage() {
  const { supplierId } = useSupplierId();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'earnings';
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p);
  };
  const overview = useQuery({
    queryKey: ['supplier-accounts', 'overview', supplierId],
    queryFn: () => api.get<{
      grossCents: number; commissionCents: number; refundCents: number; adjustmentCents: number;
      netCents: number; paidOutCents: number; pendingSettlementCents: number; availableCents: number;
      todayCents: number; monthCents: number;
    }>(`/finance/supplier/overview?supplierId=${supplierId}`),
  });

  return (
    <div className="mx-auto max-w-7xl pb-12">
      <PageHeader kicker="Supplier" title="Accounts" sub="How much you sold, what VYRO took, what you are owed, what was paid out." />
      {overview.data && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Gross sales" cents={overview.data.grossCents} />
          <Stat label="VYRO fees" cents={overview.data.commissionCents} />
          <Stat label="Net earnings" cents={overview.data.netCents} sub={`Today ${overview.data.todayCents / 100} · Month ${overview.data.monthCents / 100}`} />
          <Stat label="Available to settle" cents={overview.data.availableCents} sub={`Paid out ${overview.data.paidOutCents / 100}`} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-2 border-b border-ink/10 pb-3">
        {(['earnings', 'settlements', 'payouts', 'transactions', 'bank'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${tab === t ? 'bg-ink text-paper' : 'text-ink-3 hover:bg-ink/5'}`}
          >
            {t === 'bank' ? 'Bank details' : t}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'earnings' && <Earnings supplierId={supplierId} />}
        {tab === 'settlements' && <Settlements supplierId={supplierId} />}
        {tab === 'payouts' && <Payouts supplierId={supplierId} />}
        {tab === 'transactions' && <Transactions supplierId={supplierId} />}
        {tab === 'bank' && <BankDetails supplierId={supplierId} />}
      </div>
    </div>
  );
}

function Earnings({ supplierId }: { supplierId: string }) {
  const [eligibility, setEligibility] = useState('');
  const q = useQuery({
    queryKey: ['supplier-accounts', 'earnings', supplierId, eligibility],
    queryFn: () => api.get<{ earnings: Array<{ id: string; purchaseOrderId: string; grossCents: number; commissionBps: number; commissionCents: number; refundCents: number; netCents: number; eligibility: string; createdAt: number }> }>(
      `/finance/supplier/earnings?supplierId=${supplierId}${eligibility ? `&status=${eligibility}` : ''}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading earnings…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const earnings = q.data?.earnings ?? [];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {['', 'eligible', 'ineligible', 'held', 'settled'].map((e) => (
          <button key={e} onClick={() => setEligibility(e)} className={`rounded-full px-3 py-1 text-xs font-semibold ${eligibility === e ? 'bg-ink text-paper' : 'bg-ink/5 text-ink-3'}`}>
            {e === '' ? 'All' : e}
          </button>
        ))}
      </div>
      {earnings.length === 0 && <EmptyState title="No earnings" description="Earnings appear when buyer payments confirm." />}
      {earnings.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div>
            <div className="font-medium">Gross <Money cents={e.grossCents} /> <span className="text-ink-4">− commission {e.commissionBps}bps (<Money cents={e.commissionCents} />){e.refundCents > 0 && <> − refunds <Money cents={e.refundCents} /></>}</span></div>
            <div className="text-xs text-ink-4">{time(e.createdAt)}</div>
          </div>
          <div className="flex items-center gap-3"><StatusPill status={e.eligibility} /><Money cents={e.netCents} /></div>
        </div>
      ))}
    </div>
  );
}

function Settlements({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier-accounts', 'settlements', supplierId],
    queryFn: () => api.get<{ settlements: Array<{ id: string; settlementNumber: string; netCents: number; status: string; createdAt: number }> }>(
      `/finance/supplier/settlements?supplierId=${supplierId}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading settlements…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const settlements = q.data?.settlements ?? [];
  return (
    <div className="space-y-2">
      {settlements.length === 0 && <EmptyState title="No settlements" description="Settlements group your eligible earnings for payout." />}
      {settlements.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{s.settlementNumber}</span> <span className="text-xs text-ink-4">{time(s.createdAt)}</span></div>
          <div className="flex items-center gap-3"><StatusPill status={s.status} /><Money cents={s.netCents} /></div>
        </div>
      ))}
    </div>
  );
}

function Payouts({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier-accounts', 'payouts', supplierId],
    queryFn: () => api.get<{ items: Array<{ id: string; payoutNumber: string | null; netCents: number; status: string; method: string; externalReference: string | null; createdAt: number }> }>(
      `/payouts?supplierId=${supplierId}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading payouts…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const payouts = q.data?.items ?? [];
  return (
    <div className="space-y-2">
      {payouts.length === 0 && <EmptyState title="No payouts" description="Completed payouts will appear here." />}
      {payouts.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><span className="font-semibold">{p.payoutNumber ?? p.id.slice(0, 8)}</span> <span className="text-xs capitalize text-ink-4">{p.method}{p.externalReference ? ` · ${p.externalReference}` : ''}</span></div>
          <div className="flex items-center gap-3"><StatusPill status={p.status} /><Money cents={p.netCents} /></div>
        </div>
      ))}
    </div>
  );
}

function Transactions({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier-accounts', 'transactions', supplierId],
    queryFn: () => api.get<{ transactions: Array<{ id: string; direction: string; amountCents: number; category: string | null; refType: string; description: string; createdAt: number }> }>(
      `/finance/supplier/transactions?supplierId=${supplierId}`,
    ),
  });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading transactions…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const transactions = q.data?.transactions ?? [];
  return (
    <div className="space-y-2">
      {transactions.length === 0 && <EmptyState title="No transactions" description="Sales, commissions, settlements and payouts will appear here." />}
      {transactions.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
          <div><div className="font-medium">{t.description}</div><div className="text-xs text-ink-4">{t.category ?? t.refType} · {time(t.createdAt)}</div></div>
          <Money cents={t.direction === 'credit' ? t.amountCents : -t.amountCents} />
        </div>
      ))}
    </div>
  );
}

function BankDetails({ supplierId }: { supplierId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { ask, dialog } = useConfirm();
  const q = useQuery({
    queryKey: ['supplier-accounts', 'bank', supplierId],
    queryFn: () => api.get<{ accounts: Array<{ id: string; bankName: string; accountHolder: string; accountNumberMasked: string; branch: string | null; verificationStatus: string; isDefault: boolean }> }>(
      `/finance/supplier/bank-accounts?supplierId=${supplierId}`,
    ),
  });
  const [form, setForm] = useState({ bankName: '', accountHolder: '', accountNumber: '', branch: '', accountType: '' });
  if (q.isLoading) return <div className="text-sm text-ink-4">Loading bank details…</div>;
  if (q.isError) return <ErrorBanner message={(q.error as ApiError).message} />;
  const accounts = q.data?.accounts ?? [];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-2">
        {accounts.length === 0 && <EmptyState title="No payout account" description="Add a bank account to receive settlements." />}
        {accounts.map((a) => (
          <div key={a.id} className="rounded-xl border border-ink/10 bg-paper px-4 py-3 text-sm">
            <div className="font-semibold">{a.bankName} {a.isDefault && <span className="text-xs text-ink-4">(default)</span>}</div>
            <div className="font-mono">{a.accountNumberMasked}</div>
            <div className="text-xs text-ink-4">{a.accountHolder}{a.branch ? ` · ${a.branch}` : ''}</div>
            <div className="mt-1"><StatusPill status={a.verificationStatus} /></div>
          </div>
        ))}
        <p className="text-xs text-ink-4">Full account numbers are never stored or displayed — only a masked reference. Changes are audited.</p>
      </div>
      <form
        className="space-y-3 rounded-xl border border-ink/10 bg-paper p-5"
        onSubmit={(e) => {
          e.preventDefault();
          ask({
            title: 'Add payout account?',
            confirmLabel: 'Save account',
            body: <p>Account <strong>{form.bankName}</strong> ending <strong>{form.accountNumber.slice(-4)}</strong> will be saved for {supplierId.slice(0, 8)}. Only masked details are ever displayed.</p>,
            action: async () => {
              await api.post('/finance/supplier/bank-accounts', { supplierId, ...form });
              toast.success('Bank account saved — pending verification');
              setForm({ bankName: '', accountHolder: '', accountNumber: '', branch: '', accountType: '' });
              void qc.invalidateQueries({ queryKey: ['supplier-accounts', 'bank', supplierId] });
            },
          });
        }}
      >
        <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-ink-3">Add account</h3>
        <div><Label>Bank name</Label><Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required /></div>
        <div><Label>Account holder</Label><Input value={form.accountHolder} onChange={(e) => setForm({ ...form, accountHolder: e.target.value })} required /></div>
        <div><Label>Account number</Label><Input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required inputMode="numeric" /></div>
        <div><Label>Branch (optional)</Label><Input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></div>
        <Button type="submit">Save account</Button>
      </form>
      {dialog}
    </div>
  );
}
