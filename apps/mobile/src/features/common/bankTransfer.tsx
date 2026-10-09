import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { Camera, CheckCircle2, FileText, Image as ImageIcon, Landmark, XCircle } from 'lucide-react-native';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { cookieHeader } from '@/lib/cookieJar';
import { appendFile, pickDocument, pickImage, type PickedFile } from '@/lib/files';
import { formatDateTime, formatLKR, humanize } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { Button, Field, Input, Sheet, StatusBadge, Text, useToast } from '@/ui';
import { shareApiFile } from '@/features/buyer/orders/share';

/* Bank transfer with proof: the buyer transfers, uploads a receipt, and the
 * seller (or admin) checks it and marks the order paid. Shared by the buyer
 * and supplier order screens so both see the same evidence. */

export interface BankTransferInfo {
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

export interface OrderPayment {
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
  createdAt: number;
  statusReason?: string | null;
  bankTransfer?: BankTransferInfo;
}

export interface PayeeBankAccount {
  bankName: string;
  accountHolder: string;
  accountNumberLast4: string;
  branch: string | null;
  isDefault: boolean;
}

const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const PROOF_MAX_BYTES = 10 * 1024 * 1024;

export function useOrderPayments(poId: string | undefined) {
  return useQuery({
    queryKey: ['payments', poId],
    queryFn: () => api.get<{ payments: OrderPayment[]; bankAccounts?: PayeeBankAccount[] }>(`/payments/by-po/${poId}`),
    enabled: !!poId,
  });
}

export function proofProblem(f: PickedFile | null): string | null {
  if (!f) return 'Attach your bank receipt so the supplier can verify the transfer.';
  // Photos picked from the library report image/jpeg (HEIC is converted on export).
  if (!PROOF_TYPES.includes(f.type)) return 'Receipt must be a JPEG, PNG, WebP or PDF file.';
  if (f.size && f.size > PROOF_MAX_BYTES) return 'Receipt must be 10 MB or smaller.';
  return null;
}

export async function uploadProof(paymentId: string, file: PickedFile) {
  const form = new FormData();
  appendFile(form, 'file', file);
  await api.upload(`/finance/payments/${paymentId}/bank-transfer/proof`, form);
}

/** Buyer flow end to end: record the payment, claim the transfer row, attach the receipt. */
export async function reportBankTransfer(poId: string, amountCents: number, bankRef: string, file: PickedFile) {
  const created = await api.post<{ id: string }>(
    '/payments',
    {
      purchaseOrderId: poId,
      method: 'bank_transfer',
      transactionReference: bankRef || undefined,
      notes: 'Bank transfer reported by buyer from the app',
    },
    { idempotencyKey: true },
  );
  await api.post(`/finance/payments/${created.id}/bank-transfer`, {
    transferredCents: amountCents,
    ...(bankRef ? { bankReference: bankRef } : {}),
  });
  await uploadProof(created.id, file);
  return created.id;
}

function viewProof(t: BankTransferInfo) {
  return shareApiFile(`/finance/bank-transfer/proof/${t.id}`, t.proofFileName ?? `${t.referenceNumber}-receipt`, t.proofMimeType ?? undefined);
}

/** Reference, receipt link and any rejection note under a bank-transfer payment row. */
export function BankTransferProof({ transfer }: { transfer: BankTransferInfo }) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  return (
    <View style={{ gap: 4, padding: 10, borderRadius: radii.md, borderCurve: 'continuous', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.lineSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink4 }} numberOfLines={1}>
          {transfer.referenceNumber}
        </Text>
        {transfer.hasProof ? (
          <Pressable
            hitSlop={8}
            disabled={opening}
            onPress={async () => {
              setOpening(true);
              try {
                await viewProof(transfer);
              } catch (e) {
                toast.error('Could not open receipt', errorMessage(e));
              } finally {
                setOpening(false);
              }
            }}
          >
            <Text variant="caption" color="copper" weight="semibold">
              {opening ? 'Opening…' : 'View receipt'}
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" color="amber" weight="semibold">
            No receipt yet
          </Text>
        )}
      </View>
      {transfer.hasProof && (!transfer.proofMimeType || transfer.proofMimeType.startsWith('image/')) ? (
        <ProofImage transfer={transfer} />
      ) : null}
      {transfer.hasProof ? (
        <Text variant="caption" color="ink5" numberOfLines={1}>
          {transfer.proofFileName}
          {transfer.proofUploadedAt ? ` · ${formatDateTime(transfer.proofUploadedAt)}` : ''}
        </Text>
      ) : null}
      {transfer.bankReference ? (
        <Text variant="caption" color="ink5">
          Bank ref {transfer.bankReference}
        </Text>
      ) : null}
      {transfer.status === 'rejected' && transfer.rejectionReason ? (
        <Text variant="caption" color="rose">
          Rejected: {transfer.rejectionReason}
        </Text>
      ) : null}
    </View>
  );
}

/** The uploaded receipt photo, loaded with the session cookie. Tap to open full size. */
function ProofImage({ transfer }: { transfer: BankTransferInfo }) {
  const [failed, setFailed] = useState(false);
  // Version the URL by upload time so a replaced receipt is not served from cache.
  const src = assetUrl(`/api/finance/bank-transfer/proof/${transfer.id}?v=${transfer.proofUploadedAt ?? 0}`);
  const cookie = cookieHeader();
  if (failed || !src) {
    return (
      <Text variant="caption" color="rose">
        Could not load the receipt image.
      </Text>
    );
  }
  return (
    <Pressable onPress={() => void viewProof(transfer).catch(() => undefined)} accessibilityLabel="Open receipt full size">
      <Image
        source={{ uri: src, headers: cookie ? { cookie } : undefined }}
        style={{ width: '100%', height: 220, borderRadius: radii.md, backgroundColor: colors.pearl }}
        contentFit="contain"
        transition={200}
        onError={() => setFailed(true)}
        accessibilityLabel="Bank transfer receipt"
      />
    </Pressable>
  );
}

/** Photo / camera / PDF picker row for a transfer receipt. */
export function ProofPicker({ file, onChange }: { file: PickedFile | null; onChange: (f: PickedFile | null) => void }) {
  const pick = async (src: 'camera' | 'library' | 'file') => {
    const picked =
      src === 'file'
        ? await pickDocument({ types: PROOF_TYPES })
        : await pickImage({ camera: src === 'camera' });
    if (picked[0]) onChange(picked[0]);
  };
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          padding: 12,
          borderRadius: radii.lg,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: file ? colors.mint : colors.lineStrong,
          backgroundColor: colors.pearl,
          gap: 2,
        }}
      >
        <Text variant="bodySm" weight="semibold" numberOfLines={1}>
          {file ? file.name : 'Attach transfer receipt'}
        </Text>
        <Text variant="caption" color="ink5">
          {file ? (file.size ? `${Math.max(1, Math.round(file.size / 1024))} KB` : 'Ready to upload') : 'Photo or PDF · up to 10 MB'}
        </Text>
        {file && file.type.startsWith('image/') ? (
          <Image source={{ uri: file.uri }} style={{ width: '100%', height: 180, marginTop: 8, borderRadius: radii.md }} contentFit="contain" />
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Camera" icon={Camera} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void pick('camera')} />
        <Button title="Photos" icon={ImageIcon} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void pick('library')} />
        <Button title="PDF" icon={FileText} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => void pick('file')} />
      </View>
    </View>
  );
}

/** Where to send the money: the supplier's payout accounts, masked. */
export function PayeeAccounts({ accounts }: { accounts: PayeeBankAccount[] }) {
  if (!accounts.length) {
    return (
      <Text variant="caption" color="ink5">
        Ask the supplier for their bank details, then upload the receipt here.
      </Text>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {accounts.map((a, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10, borderRadius: radii.md, backgroundColor: colors.pearl }}>
          <Landmark size={16} color={colors.copper} />
          <View style={{ flex: 1 }}>
            <Text variant="bodySm" weight="semibold">
              {a.bankName}
              {a.branch ? ` · ${a.branch}` : ''}
            </Text>
            <Text variant="caption" color="ink4">
              {a.accountHolder} · a/c ending {a.accountNumberLast4}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Buyer sheet: transfer instructions + bank reference + receipt. */
export function ReportTransferSheet({
  visible,
  onClose,
  poId,
  amountCents,
  accounts,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  poId: string;
  amountCents: number;
  accounts: PayeeBankAccount[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const problem = proofProblem(file);
    if (problem) return toast.error('Receipt needed', problem);
    setBusy(true);
    try {
      await reportBankTransfer(poId, amountCents, ref.trim(), file!);
      toast.success('Receipt sent', 'The supplier will confirm once the money arrives.');
      setRef('');
      setFile(null);
      onClose();
    } catch (e) {
      toast.error('Could not report transfer', errorMessage(e));
    } finally {
      setBusy(false);
      onDone();
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => !busy && onClose()}
      title={`Pay ${formatLKR(amountCents)} by bank transfer`}
      subtitle="Transfer to the supplier, then upload your bank receipt. The supplier checks it and marks the order paid."
      scroll
      footer={<Button title="Submit receipt" variant="volt" full loading={busy} disabled={!file} onPress={submit} />}
    >
      <View style={{ gap: 14 }}>
        <PayeeAccounts accounts={accounts} />
        <Field label="Bank reference / transaction ID" hint="Optional, helps the supplier match your transfer">
          <Input value={ref} onChangeText={setRef} placeholder="e.g. CEFT 123456" autoCapitalize="characters" />
        </Field>
        <ProofPicker file={file} onChange={setFile} />
      </View>
    </Sheet>
  );
}

/**
 * Seller side of the payment card: review receipts, mark transfers paid or
 * reject them, and record money received outside the platform.
 */
export function SellerPayments({
  poId,
  totalCents,
  orderStatus,
  onChanged,
  actor = 'supplier',
}: {
  poId: string;
  totalCents: number;
  orderStatus: string;
  onChanged?: () => unknown;
  actor?: 'supplier' | 'admin';
}) {
  const toast = useToast();
  const q = useOrderPayments(poId);
  const payments = q.data?.payments ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<OrderPayment | null>(null);
  const [reason, setReason] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordMethod, setRecordMethod] = useState<'bank_transfer' | 'cash'>('bank_transfer');
  const [recordRef, setRecordRef] = useState('');

  const confirmed = payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amountCents, 0);
  const outstanding = Math.max(0, totalCents - confirmed);
  const canRecord = outstanding > 0 && !['cancelled', 'rejected', 'disputed'].includes(orderStatus);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      await q.refetch();
      onChanged?.();
      return true;
    } catch (e) {
      toast.error('Payment update failed', errorMessage(e));
      await q.refetch();
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading) return null;

  return (
    <View style={{ gap: 10 }}>
      {payments.map((p) => (
        <View key={p.id} style={{ gap: 8, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={p.status} size="sm" />
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13 }}>{formatLKR(p.amountCents)}</Text>
            <Text variant="caption" color="ink5">
              {humanize(p.method)}
            </Text>
          </View>
          {p.transactionReference ? (
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink4 }}>ref: {p.transactionReference}</Text>
          ) : null}
          {p.method === 'bank_transfer' && p.bankTransfer ? <BankTransferProof transfer={p.bankTransfer} /> : null}
          {p.status === 'pending' && p.method !== 'online' ? (
            <>
              <Text variant="caption" color="ink4">
                {p.bankTransfer?.hasProof
                  ? 'Check the receipt against your bank statement, then mark paid once the funds are in your account.'
                  : 'No receipt yet. Mark paid only once the funds are in your account.'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Mark as paid"
                  icon={CheckCircle2}
                  size="sm"
                  style={{ flex: 1 }}
                  loading={busy === p.id}
                  onPress={() => run(p.id, () => api.post(`/payments/${p.id}/confirm`, { status: 'confirmed' }), 'Payment marked as paid')}
                />
                <Button
                  title="Reject"
                  icon={XCircle}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setReason('');
                    setRejectFor(p);
                  }}
                />
              </View>
            </>
          ) : null}
        </View>
      ))}

      {canRecord ? (
        <Button title="Received payment another way? Record it" variant="ghost" size="sm" onPress={() => setRecordOpen(true)} />
      ) : null}

      <Sheet
        visible={!!rejectFor}
        onClose={() => setRejectFor(null)}
        title="Reject this transfer?"
        subtitle="The buyer sees your reason and can pay again or upload a new receipt."
        footer={
          <Button
            title="Reject transfer"
            variant="danger"
            full
            loading={!!rejectFor && busy === rejectFor.id}
            disabled={reason.trim().length < 3}
            onPress={async () => {
              const p = rejectFor!;
              const ok = await run(p.id, () => api.post(`/payments/${p.id}/confirm`, { status: 'failed', reason: reason.trim() }), 'Transfer rejected');
              if (ok) setRejectFor(null);
            }}
          />
        }
      >
        <Field label="Reason" required>
          <Input value={reason} onChangeText={setReason} placeholder="e.g. Amount not received" />
        </Field>
      </Sheet>

      <Sheet
        visible={recordOpen}
        onClose={() => setRecordOpen(false)}
        title={`Record ${formatLKR(outstanding)} received`}
        subtitle="Marks this order paid. Use only once the money has actually arrived."
        footer={
          <Button
            title="Mark as paid"
            variant="volt"
            full
            loading={busy === 'record'}
            onPress={async () => {
              const ok = await run(
                'record',
                async () => {
                  const created = await api.post<{ id: string }>(
                    '/payments',
                    {
                      purchaseOrderId: poId,
                      method: recordMethod,
                      transactionReference: recordRef.trim() || undefined,
                      notes: `Recorded as received by ${actor}`,
                    },
                    { idempotencyKey: true },
                  );
                  await api.post(`/payments/${created.id}/confirm`, { status: 'confirmed' });
                },
                'Payment recorded',
              );
              if (ok) {
                setRecordRef('');
                setRecordOpen(false);
              }
            }}
          />
        }
      >
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['bank_transfer', 'cash'] as const).map((m) => (
              <Button
                key={m}
                title={m === 'cash' ? 'Cash' : 'Bank transfer'}
                size="sm"
                variant={recordMethod === m ? 'primary' : 'secondary'}
                style={{ flex: 1 }}
                onPress={() => setRecordMethod(m)}
              />
            ))}
          </View>
          <Field label="Reference">
            <Input value={recordRef} onChangeText={setRecordRef} placeholder="Optional" autoCapitalize="characters" />
          </Field>
        </View>
      </Sheet>
    </View>
  );
}
