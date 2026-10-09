import { useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { postMultipart } from '@/lib/orderLifecycle';
import { Button, ErrorBanner, Input } from '@/components/ui';
import { formatLKR } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { cn } from '@vyro/ui';
import {
  BanknoteIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  UploadCloudIcon,
  WarehouseIcon,
  XCircleIcon,
  XIcon,
} from '@/components/icons';
import { LocalImagePreview, ProofPreview } from './ProofPreview';

interface Payment {
  id: string;
  purchaseOrderId: string;
  method: 'cash' | 'bank_transfer' | 'online';
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'chargeback' | 'refunded';
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  transactionReference: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  notes: string | null;
  statusReason?: string | null;
  createdAt: number;
  bankTransfer?: BankTransferInfo;
}

interface BankTransferInfo {
  id: string;
  referenceNumber: string;
  status: string;
  bankReference: string | null;
  hasProof: boolean;
  proofFileName: string | null;
  proofMimeType: string | null;
  proofUploadedAt: number | null;
  rejectionReason: string | null;
}

/** VYRO's collection account. Buyers pay VYRO; VYRO verifies and settles the supplier. */
interface CollectionAccount {
  accountName: string;
  bankName: string;
  branch: string | null;
  accountNumber: string;
  sandbox: boolean;
}

const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const PROOF_MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  purchaseOrderId: string;
  poStatus: string;
  totalCents: number;
  /** Buyer business on this PO — controls who sees pay / report-transfer actions. */
  businessId?: string;
  /** Supplier on this PO — controls who sees the confirm-receipt action. */
  supplierId?: string;
  /**
   * Which portal is rendering the panel. Actions follow the page, not the
   * account: an admin who is also the buyer sees only buyer actions on the
   * buyer page, and seller actions only on the supplier page.
   */
  viewer: 'buyer' | 'supplier' | 'admin';
  /** Called after any payment state change so the host page can refresh the order. */
  onChanged?: () => void;
}

const METHOD_META: Record<Payment['method'], { label: string; icon: ReactNode }> = {
  cash: { label: 'Cash', icon: <BanknoteIcon size={16} /> },
  bank_transfer: { label: 'Bank transfer', icon: <WarehouseIcon size={16} /> },
  online: { label: 'Card · payments.lk', icon: <CreditCardIcon size={16} /> },
};

const STATUS_STYLE: Record<Payment['status'], { label: string; cls: string }> = {
  confirmed: { label: 'Confirmed', cls: 'bg-mint/15 text-mint ring-mint/25' },
  pending: { label: 'Awaiting confirmation', cls: 'bg-amber/15 text-amber ring-amber/30' },
  failed: { label: 'Not accepted', cls: 'bg-rose/10 text-rose ring-rose/25' },
  cancelled: { label: 'Cancelled', cls: 'bg-ink/[0.06] text-ink-3 ring-ink/15' },
  chargeback: { label: 'Chargeback', cls: 'bg-rose/10 text-rose ring-rose/25' },
  refunded: { label: 'Refunded', cls: 'bg-ink/[0.06] text-ink-3 ring-ink/15' },
};

const when = (ts: number) =>
  new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function PaymentPanel({
  purchaseOrderId,
  poStatus,
  totalCents,
  businessId,
  supplierId,
  viewer,
  onChanged,
}: Props) {
  const { user } = useAuth();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<'card' | 'bank'>('card');
  const [ref, setRef] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRecord, setShowRecord] = useState(false);
  const [recordMethod, setRecordMethod] = useState<'bank_transfer' | 'cash'>(
    viewer === 'admin' ? 'bank_transfer' : 'cash',
  );
  const [recordRef, setRecordRef] = useState('');
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // Role = the portal rendering the panel AND membership on THIS order.
  const isAdmin = viewer === 'admin' && !!user?.isAdmin;
  const isBuyer =
    viewer === 'buyer' &&
    (businessId
      ? !!user?.memberships?.some((m) => m.businessId === businessId)
      : !!user?.memberships?.length);
  const isSeller =
    viewer === 'supplier' &&
    (supplierId
      ? !!user?.supplierMemberships?.some((m) => m.supplierId === supplierId)
      : !!user?.supplierMemberships?.length);
  const buyerBusinessId = businessId ?? user?.memberships?.[0]?.businessId ?? '';

  const { data, refetch } = useQuery({
    queryKey: ['payments', purchaseOrderId],
    queryFn: () =>
      api.get<{ payments: Payment[]; collectionAccount?: CollectionAccount | null }>(
        `/payments/by-po/${purchaseOrderId}`,
      ),
  });

  const payments = [...(data?.payments ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const collectionAccount = data?.collectionAccount ?? null;
  const refreshAll = async () => {
    await refetch();
    onChanged?.();
  };
  const confirmedTotal = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((s, p) => s + p.amountCents, 0);
  // Only offline money the buyer says they sent is "in review"; an unfinished
  // card checkout has moved nothing yet.
  const pendingTotal = payments
    .filter((p) => p.status === 'pending' && p.method !== 'online')
    .reduce((s, p) => s + p.amountCents, 0);
  const outstanding = Math.max(0, totalCents - confirmedTotal);
  const pct = (c: number) => (totalCents > 0 ? Math.min(100, (c / totalCents) * 100) : 0);
  const fullyPaid = outstanding === 0 && totalCents > 0;

  const { data: cardsData } = useQuery({
    queryKey: ['saved-cards', buyerBusinessId],
    queryFn: () =>
      api.get<{
        cards: Array<{
          id: string;
          brand: string | null;
          last4: string | null;
          expiryMonth: number | null;
          expiryYear: number | null;
        }>;
      }>(`/payments/saved-cards?businessId=${buyerBusinessId}`),
    enabled: isBuyer && !!buyerBusinessId,
  });
  const savedCards = cardsData?.cards ?? [];
  const [useCardId, setUseCardId] = useState('');

  const open = poStatus !== 'cancelled' && poStatus !== 'rejected';
  const pendingBank = payments.find((p) => p.status === 'pending' && p.method === 'bank_transfer');
  const pendingOnline = payments.find((p) => p.status === 'pending' && p.method === 'online');
  const canPay = isBuyer && outstanding > 0 && open;
  const canConfirm = isSeller || isAdmin;
  // Bank transfers land in VYRO's account, so only VYRO finance verifies them.
  const canReview = (p: Payment) => (p.method === 'bank_transfer' ? isAdmin : canConfirm);
  const lastFailed = payments.find((p) => ['failed', 'cancelled', 'chargeback'].includes(p.status));

  async function payOnline(paymentId: string) {
    setErr('');
    setBusy('online');
    try {
      const r = await api.post<{
        redirectUrl?: string;
        isMock: boolean;
        provider: string;
        status?: string;
      }>(`/payments/${paymentId}/checkout`, useCardId ? { useSavedCardId: useCardId } : {});
      if (r.status === 'succeeded') {
        await refreshAll();
        return;
      }
      if (r.isMock) {
        setErr(
          'Online checkout is running against the staging payment simulator — no real money will move. Configure payments.lk credentials for live payments.',
        );
      }
      window.location.href = r.redirectUrl!;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Checkout failed');
    } finally {
      setBusy(null);
    }
  }

  async function startOnline() {
    setErr('');
    setBusy('online');
    try {
      const id =
        pendingOnline?.id ??
        (
          await api.post<{ id: string }>(`/payments`, {
            purchaseOrderId,
            method: 'online',
            notes: lastFailed ? `Retry after ${lastFailed.status}` : 'Pay online via payments.lk',
          })
        ).id;
      await payOnline(id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Pay online failed');
      setBusy(null);
    }
  }

  function validateProof(f: File | null): string | null {
    if (!f)
      return 'Attach your bank receipt (photo or PDF) so VYRO finance can verify the transfer.';
    if (!PROOF_ACCEPT.split(',').includes(f.type))
      return 'Receipt must be a JPEG, PNG, WebP or PDF file.';
    if (f.size > PROOF_MAX_BYTES) return 'Receipt must be 10 MB or smaller.';
    return null;
  }

  async function uploadProof(paymentId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    await postMultipart(`/finance/payments/${paymentId}/bank-transfer/proof`, form);
  }

  async function reportBankTransfer() {
    setErr('');
    const problem = validateProof(proofFile);
    if (problem) return setErr(problem);
    setBusy('bank');
    try {
      const created = await api.post<{ id: string }>(
        `/payments`,
        {
          purchaseOrderId,
          method: 'bank_transfer',
          transactionReference: ref.trim() || undefined,
          notes: 'Bank transfer reported by buyer from order detail',
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      await api.post(`/finance/payments/${created.id}/bank-transfer`, {
        transferredCents: outstanding,
        ...(ref.trim() ? { bankReference: ref.trim() } : {}),
      });
      await uploadProof(created.id, proofFile!);
      setRef('');
      setProofFile(null);
      await refreshAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not report the transfer');
      await refreshAll();
    } finally {
      setBusy(null);
    }
  }

  async function attachProof(paymentId: string, file: File | null) {
    setErr('');
    const problem = validateProof(file);
    if (problem) return setErr(problem);
    setBusy(`proof:${paymentId}`);
    try {
      await uploadProof(paymentId, file!);
      setUploadFor(null);
      setReplaceFile(null);
      await refreshAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  }

  async function confirmPayment(paymentId: string) {
    setErr('');
    setBusy(paymentId);
    try {
      await api.post(`/payments/${paymentId}/confirm`, { status: 'confirmed' });
      await refreshAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Confirm failed');
    } finally {
      setBusy(null);
    }
  }

  async function rejectPayment(paymentId: string) {
    setErr('');
    if (rejectReason.trim().length < 3)
      return setErr('Tell the buyer why the transfer was not accepted.');
    setBusy(paymentId);
    try {
      await api.post(`/payments/${paymentId}/confirm`, {
        status: 'failed',
        reason: rejectReason.trim(),
      });
      setRejectFor(null);
      setRejectReason('');
      await refreshAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Reject failed');
    } finally {
      setBusy(null);
    }
  }

  /** Seller/admin: payment arrived outside the platform — record it and mark it paid in one step. */
  async function recordReceived() {
    setErr('');
    setBusy('record');
    try {
      const created = await api.post<{ id: string }>(
        `/payments`,
        {
          purchaseOrderId,
          method: recordMethod,
          transactionReference: recordRef.trim() || undefined,
          notes: `Recorded as received by ${isSeller ? 'supplier' : 'admin'}`,
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      await api.post(`/payments/${created.id}/confirm`, { status: 'confirmed' });
      setRecordRef('');
      setShowRecord(false);
      await refreshAll();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not record the payment');
      await refreshAll();
    } finally {
      setBusy(null);
    }
  }

  const state: { label: string; tone: 'mint' | 'amber' | 'paper' } = fullyPaid
    ? { label: 'Paid', tone: 'mint' }
    : pendingTotal > 0
      ? { label: 'Verifying', tone: 'amber' }
      : confirmedTotal > 0
        ? { label: 'Part paid', tone: 'amber' }
        : { label: 'Unpaid', tone: 'paper' };

  const headline = fullyPaid
    ? 'Paid in full'
    : canConfirm
      ? pendingBank
        ? isAdmin
          ? 'Transfer to verify'
          : 'VYRO is verifying the transfer'
        : 'Awaiting buyer payment'
      : pendingBank
        ? 'Transfer under review'
        : 'Payment due';

  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.04),0_24px_48px_-28px_rgba(0,0,0,0.35)]">
      {/* ── Amount header ───────────────────────────── */}
      <header className="relative overflow-hidden bg-ink px-5 pb-5 pt-4 text-paper">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-volt/15 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-volt/60 to-transparent"
        />
        <div className="relative flex items-center justify-between gap-3">
          <div className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-volt">
            Settlement
          </div>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider ring-1',
              state.tone === 'mint' && 'bg-mint/20 text-[#9fe0c4] ring-mint/40',
              state.tone === 'amber' && 'bg-amber/20 text-[#f2c48d] ring-amber/40',
              state.tone === 'paper' && 'bg-paper/10 text-paper/70 ring-paper/20',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                state.tone === 'mint'
                  ? 'bg-[#9fe0c4]'
                  : state.tone === 'amber'
                    ? 'animate-pulse bg-[#f2c48d]'
                    : 'bg-paper/50',
              )}
            />
            {state.label}
          </span>
        </div>
        <div className="relative mt-4 text-sm text-paper/70">{headline}</div>
        <div className="relative mt-1 font-mono text-[2rem] font-bold leading-none tracking-tight tabular-nums whitespace-nowrap">
          {formatLKR(fullyPaid ? totalCents : outstanding)}
        </div>

        <div
          className="relative mt-5 flex h-2 w-full overflow-hidden rounded-full bg-paper/10"
          role="progressbar"
          aria-valuenow={Math.round(pct(confirmedTotal))}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Amount paid"
        >
          <div
            className="h-full bg-volt transition-all duration-500"
            style={{ width: `${pct(confirmedTotal)}%` }}
          />
          <div
            className="h-full bg-[repeating-linear-gradient(45deg,rgba(242,196,141,0.85)_0_4px,rgba(242,196,141,0.45)_4px_8px)] transition-all duration-500"
            style={{ width: `${Math.min(pct(pendingTotal), 100 - pct(confirmedTotal))}%` }}
          />
        </div>
        <dl className="relative mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="Total" value={formatLKR(totalCents)} />
          <Stat label="Paid" value={formatLKR(confirmedTotal)} dot="bg-volt" />
          <Stat label="In review" value={formatLKR(pendingTotal)} dot="bg-[#f2c48d]" />
        </dl>
      </header>

      <div className="space-y-5 p-5">
        <ErrorBanner message={err} />

        {/* ── Buyer: choose how to pay ─────────────────── */}
        {canPay && !pendingBank && (
          <div className="space-y-4">
            <div
              className="grid grid-cols-2 gap-1 rounded-xl bg-ink/[0.05] p-1"
              role="tablist"
              aria-label="Payment method"
            >
              <MethodTab
                active={tab === 'card'}
                onClick={() => setTab('card')}
                icon={<CreditCardIcon size={15} />}
              >
                Card
              </MethodTab>
              <MethodTab
                active={tab === 'bank'}
                onClick={() => setTab('bank')}
                icon={<WarehouseIcon size={15} />}
              >
                Bank transfer
              </MethodTab>
            </div>

            {tab === 'card' ? (
              <div className="space-y-3">
                {savedCards.length > 0 && !pendingOnline && (
                  <select
                    className="w-full rounded-xl border border-ink/10 bg-paper px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-volt/60"
                    value={useCardId}
                    onChange={(e) => setUseCardId(e.target.value)}
                    aria-label="Use a saved card"
                  >
                    <option value="">New card (hosted checkout)</option>
                    {savedCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.brand ?? 'Card'} ····{c.last4} (exp {c.expiryMonth}/{c.expiryYear})
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={pendingOnline ? () => payOnline(pendingOnline.id) : startOnline}
                  loading={busy === 'online'}
                >
                  {pendingOnline
                    ? 'Resume secure checkout'
                    : `Pay ${formatLKR(outstanding)} securely`}
                </Button>
                <TrustNote icon={<ShieldCheckIcon size={13} />}>
                  {pendingOnline
                    ? 'You started a card checkout that was not finished. Resume it, or switch to bank transfer.'
                    : '3-D Secure card payment through payments.lk. Vyro never sees or stores your card details.'}
                </TrustNote>
              </div>
            ) : (
              <ol className="space-y-4">
                <Step n={1} title="Transfer the amount">
                  <div className="rounded-xl border border-ink/10 bg-bone/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-ink-4">Amount to send</span>
                      <CopyChip
                        value={(outstanding / 100).toFixed(2)}
                        label={formatLKR(outstanding)}
                      />
                    </div>
                    {collectionAccount ? (
                      <CollectionAccountCard account={collectionAccount} className="mt-3" />
                    ) : (
                      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
                        VYRO's bank details are unavailable right now. Pay by card, or contact VYRO
                        support.
                      </p>
                    )}
                    <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-4">
                      <ShieldCheckIcon size={11} className="mt-px shrink-0 text-mint" />
                      Pay VYRO only — never a supplier's personal account. VYRO holds the money and
                      pays the supplier after delivery.
                    </p>
                  </div>
                </Step>
                <Step n={2} title="Add your bank reference" optional>
                  <Input
                    placeholder="e.g. CEFT 4821 9930"
                    value={ref}
                    onChange={(e) => setRef(e.target.value)}
                    aria-label="Bank reference or transaction ID"
                  />
                </Step>
                <Step n={3} title="Upload the receipt" last>
                  <ReceiptDropzone file={proofFile} onFile={setProofFile} onError={setErr} />
                </Step>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={reportBankTransfer}
                  loading={busy === 'bank'}
                  disabled={!proofFile}
                >
                  <UploadCloudIcon size={15} /> Submit receipt
                </Button>
                <TrustNote icon={<ClockIcon size={13} />}>
                  VYRO finance checks the receipt against VYRO's bank statement and marks the order
                  paid — usually within one business day.
                </TrustNote>
              </ol>
            )}
          </div>
        )}

        {/* ── Payment history ─────────────────────────── */}
        {payments.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-mono font-bold uppercase tracking-[0.16em] text-ink-4">
                Payments
              </h4>
              <span className="text-[10px] font-mono text-ink-4">{payments.length}</span>
            </div>
            <ul className="space-y-2.5">
              {payments.map((p) => {
                const st =
                  p.status === 'pending' && p.method === 'online'
                    ? {
                        label: 'Checkout not finished',
                        cls: 'bg-ink/[0.06] text-ink-3 ring-ink/15',
                      }
                    : STATUS_STYLE[p.status];
                const meta = METHOD_META[p.method];
                const bt = p.bankTransfer;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'rounded-xl border p-3.5 transition-colors',
                      p.status === 'pending'
                        ? 'border-amber/30 bg-amber/[0.04]'
                        : 'border-ink/10 bg-ink/[0.015]',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg',
                          p.status === 'confirmed'
                            ? 'bg-mint/15 text-mint'
                            : 'bg-ink/[0.06] text-ink-3',
                        )}
                      >
                        {p.status === 'confirmed' ? <CheckIcon size={16} /> : meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                          <span className="whitespace-nowrap font-mono text-sm font-bold tabular-nums text-ink-1">
                            {formatLKR(p.amountCents)}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[9.5px] font-mono font-bold uppercase tracking-wider ring-1',
                              st.cls,
                            )}
                          >
                            {st.label}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-ink-4">
                          {meta.label} · {when(p.paidAt ?? p.createdAt)}
                          {p.transactionReference ? ` · Ref ${p.transactionReference}` : ''}
                        </div>
                      </div>
                    </div>

                    {p.status === 'failed' && (p.statusReason || bt?.rejectionReason) && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose/[0.06] p-2.5 text-[11px] text-rose">
                        <XCircleIcon size={13} className="mt-px shrink-0" />
                        <span>{p.statusReason ?? bt?.rejectionReason}</span>
                      </div>
                    )}

                    {p.method === 'bank_transfer' && collectionAccount && (
                      <div className="mt-3">
                        <div className="mb-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.14em] text-ink-4">
                          {p.status === 'pending' && isBuyer ? 'Send to' : 'Paid into'}
                        </div>
                        <CollectionAccountCard
                          account={collectionAccount}
                          compact={p.status !== 'pending'}
                          reference={
                            p.status === 'pending' && isBuyer ? bt?.referenceNumber : undefined
                          }
                        />
                      </div>
                    )}

                    {p.method === 'bank_transfer' && bt && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-mono text-ink-4">{bt.referenceNumber}</span>
                          {bt.hasProof ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-mint">
                              <CheckCircleIcon size={12} /> Receipt attached
                            </span>
                          ) : (
                            <span className="font-semibold text-amber">No receipt yet</span>
                          )}
                        </div>
                        {bt.hasProof && (
                          <ProofPreview
                            key={`${bt.id}:${bt.proofUploadedAt ?? ''}`}
                            bankTransferId={bt.id}
                            mimeType={bt.proofMimeType}
                            fileName={bt.proofFileName}
                          />
                        )}
                        {bt.hasProof && bt.proofUploadedAt && (
                          <div className="truncate text-[10.5px] text-ink-4">
                            {bt.proofFileName} · uploaded {when(bt.proofUploadedAt)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Seller: VYRO verifies bank transfers, not the seller */}
                    {p.status === 'pending' && p.method === 'bank_transfer' && isSeller && (
                      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber/[0.08] p-2.5 text-[11px] leading-relaxed text-ink-3 ring-1 ring-amber/20">
                        <ClockIcon size={13} className="mt-px shrink-0 text-amber" />
                        <span>
                          The buyer paid into VYRO's account. VYRO finance is verifying it — you'll
                          be notified once the funds are confirmed. No action needed from you.
                        </span>
                      </div>
                    )}

                    {/* Admin (bank transfers) / seller (cash) review */}
                    {p.status === 'pending' && p.method !== 'online' && canReview(p) && (
                      <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
                        <p className="text-[11px] leading-relaxed text-ink-3">
                          {p.method === 'bank_transfer'
                            ? bt?.hasProof
                              ? "Check the receipt against VYRO's collection account statement, then confirm once the funds have landed."
                              : "No receipt yet. Confirm only once the funds are in VYRO's account."
                            : 'Confirm once you have collected the cash.'}
                        </p>
                        {rejectFor === p.id ? (
                          <div className="space-y-2">
                            <Input
                              placeholder="Reason (e.g. amount not received)"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              autoFocus
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setRejectFor(null)}
                              >
                                Back
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() => rejectPayment(p.id)}
                                loading={busy === p.id}
                              >
                                Reject transfer
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => confirmPayment(p.id)}
                              loading={busy === p.id}
                            >
                              <CheckIcon size={14} /> Mark as paid
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRejectFor(p.id);
                                setRejectReason('');
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Buyer: attach or replace the receipt */}
                    {p.status === 'pending' && p.method === 'bank_transfer' && isBuyer && (
                      <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
                        <p className="text-[11px] leading-relaxed text-ink-3">
                          {bt?.hasProof
                            ? 'Sent to VYRO. Your order is marked paid as soon as VYRO finance verifies the transfer.'
                            : 'Upload your bank receipt so VYRO finance can verify the transfer.'}
                        </p>
                        {uploadFor === p.id || !bt?.hasProof ? (
                          <div className="space-y-2">
                            <ReceiptDropzone
                              file={uploadFor === p.id ? replaceFile : null}
                              onFile={(f) => {
                                setUploadFor(p.id);
                                setReplaceFile(f);
                              }}
                              onError={setErr}
                              compact
                            />
                            <div
                              className={cn(
                                'grid gap-2',
                                bt?.hasProof ? 'grid-cols-2' : 'grid-cols-1',
                              )}
                            >
                              {bt?.hasProof && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setUploadFor(null);
                                    setReplaceFile(null);
                                  }}
                                >
                                  Cancel
                                </Button>
                              )}
                              <Button
                                size="sm"
                                disabled={uploadFor !== p.id || !replaceFile}
                                onClick={() => attachProof(p.id, replaceFile)}
                                loading={busy === `proof:${p.id}`}
                              >
                                {bt?.hasProof ? 'Replace receipt' : 'Upload receipt'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setUploadFor(p.id);
                              setReplaceFile(null);
                            }}
                            className="text-[11px] font-semibold text-copper transition-colors hover:text-ink"
                          >
                            Uploaded the wrong file? Replace receipt
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ── Seller / admin: payment received outside the platform ── */}
        {canConfirm && outstanding > 0 && open && (
          <div className="rounded-xl border border-dashed border-ink/15 p-3.5">
            {!showRecord ? (
              <div className="space-y-1.5">
                {!pendingBank && (
                  <p className="text-[11px] leading-relaxed text-ink-3">
                    {isAdmin
                      ? 'Card payments confirm automatically. Bank transfers appear above once the buyer uploads a receipt.'
                      : "Buyers pay by card or by bank transfer into VYRO's account — VYRO confirms both for you."}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowRecord(true)}
                  className="text-xs font-semibold text-copper transition-colors hover:text-ink"
                >
                  {isAdmin
                    ? 'Received payment another way? Record it →'
                    : 'Collected cash on delivery? Record it →'}
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[11px] leading-relaxed text-ink-3">
                  Records {formatLKR(outstanding)} as received and marks this order paid. Use only
                  once the money has actually arrived.
                </p>
                {isAdmin && (
                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink/[0.05] p-1">
                    <MethodTab
                      active={recordMethod === 'bank_transfer'}
                      onClick={() => setRecordMethod('bank_transfer')}
                      icon={<WarehouseIcon size={14} />}
                    >
                      Bank
                    </MethodTab>
                    <MethodTab
                      active={recordMethod === 'cash'}
                      onClick={() => setRecordMethod('cash')}
                      icon={<BanknoteIcon size={14} />}
                    >
                      Cash
                    </MethodTab>
                  </div>
                )}
                <Input
                  placeholder="Reference (optional)"
                  value={recordRef}
                  onChange={(e) => setRecordRef(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowRecord(false)}
                    disabled={busy === 'record'}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    onClick={recordReceived}
                    loading={busy === 'record'}
                  >
                    Mark as paid
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {payments.length === 0 && !canPay && !canConfirm && (
          <p className="text-center text-sm text-ink-4">No payments recorded yet.</p>
        )}

        {fullyPaid && (
          <TrustNote icon={<ShieldCheckIcon size={13} />}>
            {isSeller
              ? 'VYRO holds these funds and pays you in the next payout once the buyer confirms receipt.'
              : 'Funds are held by VYRO and released to the supplier once delivery is confirmed.'}
          </TrustNote>
        )}
      </div>
    </section>
  );
}

/* ── Pieces ─────────────────────────────────────────────── */

function Stat({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-paper/50">
        {dot && <span className={cn('size-1.5 rounded-full', dot)} />}
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono font-semibold tabular-nums text-paper/90">
        {value}
      </dd>
    </div>
  );
}

function MethodTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold transition-all',
        active
          ? 'bg-paper text-ink-1 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_-6px_rgba(0,0,0,0.2)]'
          : 'text-ink-4 hover:text-ink-2',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Step({
  n,
  title,
  optional,
  last,
  children,
}: {
  n: number;
  title: string;
  optional?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex gap-3">
      {!last && (
        <span aria-hidden className="absolute bottom-[-12px] left-[11px] top-7 w-px bg-ink/10" />
      )}
      <span className="relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-bold text-volt">
        {n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-baseline gap-2 pt-0.5">
          <span className="text-[13px] font-semibold text-ink-1">{title}</span>
          {optional && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              Optional
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

/** VYRO's collection account: where buyers send bank transfers. */
function CollectionAccountCard({
  account,
  compact = false,
  reference,
  className,
}: {
  account: CollectionAccount;
  compact?: boolean;
  /** Transfer reference the buyer should quote, shown as a copyable row. */
  reference?: string | undefined;
  className?: string;
}) {
  const last4 = account.accountNumber.replace(/\s/g, '').slice(-4);
  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2.5 rounded-lg bg-paper px-3 py-2 ring-1 ring-ink/[0.06]',
          className,
        )}
      >
        <ShieldCheckIcon size={13} className="shrink-0 text-mint" />
        <div className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
          <span className="font-semibold text-ink-1">{account.accountName}</span> ·{' '}
          {account.bankName}
        </div>
        <span className="shrink-0 font-mono text-[11px] font-semibold text-ink-2">
          •••• {last4}
        </span>
      </div>
    );
  }
  return (
    <div className={cn('rounded-lg bg-paper p-3 ring-1 ring-ink/[0.06]', className)}>
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ink text-volt">
          <ShieldCheckIcon size={15} />
        </div>
        <div className="min-w-0 flex-1 text-[11px] leading-snug">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink-1">
            {account.accountName}
            {account.sandbox && (
              <span className="rounded bg-amber/15 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider text-amber">
                Sandbox
              </span>
            )}
          </div>
          <div className="text-ink-3">
            {account.bankName}
            {account.branch ? ` · ${account.branch}` : ''}
          </div>
        </div>
      </div>
      <dl className="mt-2.5 space-y-1.5 border-t border-ink/[0.06] pt-2.5">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[11px] text-ink-4">Account no.</dt>
          <dd className="min-w-0">
            <CopyChip
              value={account.accountNumber.replace(/\s/g, '')}
              label={account.accountNumber}
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-[11px] text-ink-4">Account name</dt>
          <dd className="min-w-0">
            <CopyChip value={account.accountName} label={account.accountName} small />
          </dd>
        </div>
        {reference && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-[11px] text-ink-4">Quote reference</dt>
            <dd className="min-w-0">
              <CopyChip value={reference} label={reference} small />
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function CopyChip({ value, label, small = false }: { value: string; label: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg bg-paper px-2 py-1 font-mono font-bold tabular-nums text-ink-1 ring-1 ring-ink/10 transition-colors hover:ring-ink/25',
        small ? 'text-[11px]' : 'text-sm',
      )}
      title={`Copy ${label}`}
    >
      <span className="truncate">{label}</span>
      {copied ? (
        <CheckIcon size={12} className="text-mint" />
      ) : (
        <CopyIcon size={12} className="text-ink-4" />
      )}
    </button>
  );
}

function TrustNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-4">
      <span className="mt-px shrink-0 text-ink-3">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/** Drag-and-drop / click-to-pick receipt input with a live preview. */
function ReceiptDropzone({
  file,
  onFile,
  onError,
  compact,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  onError: (msg: string) => void;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (f: File | undefined) => {
    if (!f) return;
    if (!PROOF_ACCEPT.split(',').includes(f.type))
      return onError('Receipt must be a JPEG, PNG, WebP or PDF file.');
    if (f.size > PROOF_MAX_BYTES) return onError('Receipt must be 10 MB or smaller.');
    onError('');
    onFile(f);
  };

  if (file) {
    return (
      <div className="space-y-2">
        <LocalImagePreview file={file} />
        <div className="flex items-center gap-2 rounded-lg bg-mint/[0.08] px-3 py-2 ring-1 ring-mint/25">
          <CheckCircleIcon size={14} className="shrink-0 text-mint" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-ink-1">{file.name}</div>
            <div className="text-[10.5px] text-ink-4">
              {Math.max(1, Math.round(file.size / 1024))} KB · ready to send
            </div>
          </div>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="rounded-md p-1 text-ink-4 transition-colors hover:bg-ink/[0.06] hover:text-ink-1"
            aria-label="Remove file"
          >
            <XIcon size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'group flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-center transition-all',
          compact ? 'px-3 py-4' : 'px-4 py-6',
          over
            ? 'border-copper bg-copper/[0.06]'
            : 'border-ink/20 bg-ink/[0.015] hover:border-ink/40 hover:bg-ink/[0.03]',
        )}
      >
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-ink text-volt transition-transform group-hover:-translate-y-0.5',
            compact ? 'size-8' : 'size-10',
          )}
        >
          <UploadCloudIcon size={compact ? 15 : 18} />
        </span>
        <span className="text-[13px] font-semibold text-ink-1">
          Drop receipt here or{' '}
          <span className="text-copper underline-offset-2 group-hover:underline">browse</span>
        </span>
        <span className="text-[10.5px] text-ink-4">
          Photo or PDF · JPEG, PNG, WebP · up to 10 MB
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={PROOF_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </>
  );
}
