import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, CreditCard, Layers, Package, PauseCircle, PlayCircle, ShieldAlert, Wallet } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDateTime, humanize, shortId, timeAgo } from '@/lib/format';
import { usePermission } from '@/features/admin/common/permissions';
import {
  Badge,
  Banner,
  Button,
  Card,
  ChipRow,
  ConfirmSheet,
  Donut,
  ErrorState,
  Field,
  IconTile,
  Input,
  LinkText,
  ProgressBar,
  RankBars,
  Row,
  Sheet,
  SkeletonList,
  Stat,
  StatGrid,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear, InlineEmpty, MoneyText, ReasonSheet, ToneRule, go, rupeesToCents } from '@/features/admin/platform/kit';
import {
  useApprovePayoutBatch,
  useApproveRefund,
  useCreatePayoutBatch,
  useCreditFacilities,
  useLedgerSummary,
  useOpenChargebacks,
  usePatchCreditFacility,
  usePayoutBatchQueue,
  useRefundQueue,
  useRejectRefund,
  useResolveChargeback,
  type ChargebackRow,
  type CreditFacilityRow,
  type PayoutBatchRow,
  type RefundRow,
} from './api';
import { DateRangeChips, type DateRangeValue } from './DateRange';

function NoPermission({ perm, what }: { perm: string; what: string }) {
  return <Banner tone="warning" title="Restricted" message={`You need ${perm} permission to ${what}.`} />;
}

function IdLine({ label, id, onPress }: { label: string; id: string; onPress?: () => void }) {
  return (
    <Row gap={6}>
      <Text variant="caption" color="ink5">
        {label}
      </Text>
      {onPress ? <LinkText title={shortId(id, 12)} onPress={onPress} /> : <Text variant="mono">{shortId(id, 12)}</Text>}
    </Row>
  );
}

/* --------------------------------- Refunds -------------------------------- */

export function RefundsSection() {
  const canRefund = usePermission('payment:refund');
  const toast = useToast();
  const q = useRefundQueue(canRefund);
  const approve = useApproveRefund();
  const reject = useRejectRefund();
  const [approving, setApproving] = useState<RefundRow | null>(null);
  const [rejecting, setRejecting] = useState<RefundRow | null>(null);

  if (!canRefund) return <NoPermission perm="payment:refund" what="view or manage refunds" />;
  if (q.isLoading) return <SkeletonList rows={4} height={120} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  if (!rows.length) return <InlineEmpty icon={CheckCircle2} title="Refund queue clear" message="Every refund request has been authorised or reviewed." />;

  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <Appear key={r.id} i={i}>
          <Card kind="flat" style={{ gap: 12, paddingLeft: 20 }}>
            <ToneRule tone={r.status === 'requested' ? 'warn' : r.status === 'failed' ? 'out' : 'neutral'} />
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="overline" color="ink4">
                  Refund · {shortId(r.id)}
                </Text>
                <MoneyText cents={r.amountCents} tone="out" size="lg" signed />
              </View>
              <StatusBadge status={r.status} />
            </Row>
            {r.reason ? (
              <Text variant="bodySm" color="ink3" numberOfLines={3}>
                “{r.reason}”
              </Text>
            ) : null}
            <Row justify="space-between">
              <IdLine label="Payment" id={r.paymentId} onPress={() => go(`/admin/payments/${r.paymentId}`)} />
              <Text variant="caption" color="ink5">
                {timeAgo(r.createdAt)}
              </Text>
            </Row>
            {r.status === 'requested' ? (
              <Row gap={8}>
                <Button title="Approve" size="sm" icon={CheckCircle2} onPress={() => setApproving(r)} style={{ flex: 1 }} />
                <Button title="Reject" size="sm" variant="secondary" onPress={() => setRejecting(r)} style={{ flex: 1 }} />
              </Row>
            ) : null}
          </Card>
        </Appear>
      ))}

      <ConfirmSheet
        visible={!!approving}
        onClose={() => setApproving(null)}
        title="Approve refund?"
        message={approving ? `${formatCompactLKR(approving.amountCents)} will be released back to the buyer for payment ${shortId(approving.paymentId, 12)}.` : undefined}
        confirmLabel="Approve refund"
        loading={approve.isPending}
        onConfirm={() => {
          if (!approving) return;
          approve.mutate(approving.id, {
            onSuccess: () => {
              toast.success('Refund approved');
              setApproving(null);
            },
            onError: (e) => toast.error('Could not approve', errorMessage(e)),
          });
        }}
      />
      <ReasonSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject refund"
        message={rejecting ? `Refund of ${formatCompactLKR(rejecting.amountCents)} on payment ${shortId(rejecting.paymentId, 12)}.` : undefined}
        confirmLabel="Reject refund"
        variant="danger"
        minLength={5}
        placeholder="Reason (min 5 characters) — shared with the requester."
        loading={reject.isPending}
        onConfirm={(reason) => {
          if (!rejecting) return;
          reject.mutate(
            { id: rejecting.id, reason },
            {
              onSuccess: () => {
                toast.success('Refund rejected');
                setRejecting(null);
              },
              onError: (e) => toast.error('Could not reject', errorMessage(e)),
            },
          );
        }}
      />
    </View>
  );
}

/* --------------------------------- Payouts -------------------------------- */

export function PayoutsSection() {
  const canRead = usePermission('payout:read');
  const canApprove = usePermission('payout:approve');
  const toast = useToast();
  const q = usePayoutBatchQueue(canRead);
  const create = useCreatePayoutBatch();
  const approve = useApprovePayoutBatch();
  const [note, setNote] = useState('');
  const [confirmCreate, setConfirmCreate] = useState(false);
  const [approving, setApproving] = useState<PayoutBatchRow | null>(null);

  if (!canRead) return <NoPermission perm="payout:read" what="view payout batches" />;

  return (
    <View style={{ gap: 12 }}>
      {canApprove ? (
        <Appear>
          <Card kind="flat" padding={18} style={{ gap: 14 }}>
            <Row gap={12} align="center">
              <IconTile icon={Layers} tone="ink" size={42} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">Create disbursement batch</Text>
                <Text variant="caption" color="ink4">
                  Aggregates every unbatched eligible supplier payout into one auditable batch.
                </Text>
              </View>
            </Row>
            <Field label="Batch memo">
              <Input value={note} onChangeText={setNote} maxLength={500} placeholder="e.g. Weekly settlement — Commercial Bank #24" />
            </Field>
            <Button title="Generate batch" icon={Package} full onPress={() => setConfirmCreate(true)} loading={create.isPending} />
          </Card>
        </Appear>
      ) : null}

      {q.isLoading ? (
        <SkeletonList rows={3} height={110} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !(q.data ?? []).length ? (
        <InlineEmpty icon={Package} title="No payout batches" message="Generate a batch to aggregate unbatched supplier disbursements." />
      ) : (
        (q.data ?? []).map((b, i) => (
          <Appear key={b.id} i={i + 1}>
            <Card kind="flat" style={{ gap: 10, paddingLeft: 20 }}>
              <ToneRule tone={b.status === 'pending' ? 'warn' : b.status === 'approved' ? 'in' : 'out'} />
              <Row justify="space-between" align="flex-start">
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant="overline" color="ink4">
                    Batch · {shortId(b.id)}
                  </Text>
                  <MoneyText cents={b.totalCents} size="lg" />
                </View>
                <StatusBadge status={b.status} />
              </Row>
              <Text variant="bodySm" color={b.note ? 'ink3' : 'ink5'}>
                {b.note ?? 'No memo'}
              </Text>
              <Row justify="space-between">
                <Text variant="caption" color="ink5">
                  Created {formatDateTime(b.createdAt)}
                </Text>
                {b.approvedAt ? (
                  <Text variant="caption" color="mint">
                    Approved {timeAgo(b.approvedAt)}
                  </Text>
                ) : null}
              </Row>
              {canApprove && b.status === 'pending' ? <Button title="Approve batch" size="sm" icon={CheckCircle2} onPress={() => setApproving(b)} full /> : null}
            </Card>
          </Appear>
        ))
      )}

      <ConfirmSheet
        visible={confirmCreate}
        onClose={() => setConfirmCreate(false)}
        title="Generate payout batch?"
        message="Every unbatched eligible supplier payout will be locked into a new pending batch."
        confirmLabel="Generate batch"
        loading={create.isPending}
        onConfirm={() =>
          create.mutate(note.trim() ? { note: note.trim() } : {}, {
            onSuccess: () => {
              toast.success('Payout batch created');
              setNote('');
              setConfirmCreate(false);
            },
            onError: (e) => toast.error('Could not create batch', errorMessage(e)),
          })
        }
      />
      <ConfirmSheet
        visible={!!approving}
        onClose={() => setApproving(null)}
        title="Approve payout batch?"
        message={approving ? `${formatCompactLKR(approving.totalCents)} will be released to suppliers. This cannot be undone.` : undefined}
        confirmLabel="Approve & release"
        variant="volt"
        loading={approve.isPending}
        onConfirm={() => {
          if (!approving) return;
          approve.mutate(approving.id, {
            onSuccess: () => {
              toast.success('Batch approved');
              setApproving(null);
            },
            onError: (e) => toast.error('Could not approve batch', errorMessage(e)),
          });
        }}
      />
    </View>
  );
}

/* --------------------------------- Ledger --------------------------------- */

export function LedgerSection() {
  const [range, setRange] = useState<DateRangeValue>({ preset: 'all' });
  const q = useLedgerSummary({ from: range.from, to: range.to });
  const d = q.data;

  const donut = useMemo(
    () =>
      (d?.byAccountType ?? [])
        .map((r) => ({ label: humanize(r.accountType), value: r.creditCents + r.debitCents }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6),
    [d],
  );
  const refRank = useMemo(
    () =>
      (d?.byRefType ?? [])
        .map((r) => ({ label: humanize(r.refType), value: r.creditCents + r.debitCents, hint: `${formatCompactLKR(r.creditCents - r.debitCents)} net` }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [d],
  );

  return (
    <View style={{ gap: 12 }}>
      <DateRangeChips value={range} onChange={setRange} />
      {q.isLoading ? (
        <SkeletonList rows={3} height={96} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : d ? (
        <>
          <Appear>
            <StatGrid>
              <Stat label="Credits" value={formatCompactLKR(d.totalCreditCents)} hint="Receivables & settlements" icon={ArrowDownLeft} />
              <Stat label="Debits" value={formatCompactLKR(d.totalDebitCents)} hint="Disbursements & chargebacks" icon={ArrowUpRight} />
            </StatGrid>
          </Appear>
          <Appear i={1}>
            <Card kind="ink" flow="ledger-net" style={{ gap: 6 }}>
              <Text variant="overline" color="paperMuted">
                Net settlement volume
              </Text>
              <MoneyText cents={d.netCents} size="xl" dark tone={d.netCents < 0 ? 'out' : 'neutral'} />
              <Text variant="caption" color="paperFaint">
                Platform retained delta{d.from || d.to ? ` · ${d.from ? formatDateTime(d.from) : '…'} → ${d.to ? formatDateTime(d.to) : 'now'}` : ' · all time'}
              </Text>
            </Card>
          </Appear>

          {donut.length ? (
            <Appear i={2}>
              <Card kind="flat" style={{ gap: 14 }}>
                <Text variant="overline" color="copper">
                  Volume by account
                </Text>
                <Donut data={donut} centerValue={formatCompactLKR(d.totalCreditCents + d.totalDebitCents)} centerLabel="moved" />
              </Card>
            </Appear>
          ) : null}

          <Appear i={3}>
            <Card kind="flat" padding={0} style={{ paddingHorizontal: 16 }}>
              <View style={{ paddingTop: 16, paddingBottom: 4 }}>
                <Text variant="overline" color="copper">
                  Double-entry by account category
                </Text>
              </View>
              {d.byAccountType.length ? (
                d.byAccountType.map((r, i) => {
                  const net = r.creditCents - r.debitCents;
                  const total = r.creditCents + r.debitCents || 1;
                  return (
                    <View key={r.accountType} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: i === d.byAccountType.length - 1 ? 0 : StyleSheet.hairlineWidth * 2, borderBottomColor: colors.lineSoft }}>
                      <Row justify="space-between">
                        <Text variant="body" weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
                          {humanize(r.accountType)}
                        </Text>
                        <MoneyText cents={net} size="sm" tone={net < 0 ? 'out' : 'neutral'} />
                      </Row>
                      <View style={{ flexDirection: 'row', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.mist }}>
                        <View style={{ width: `${(r.creditCents / total) * 100}%`, backgroundColor: colors.mint }} />
                        <View style={{ width: `${(r.debitCents / total) * 100}%`, backgroundColor: colors.rose }} />
                      </View>
                      <Row justify="space-between">
                        <MoneyText cents={r.creditCents} size="sm" tone="in" signed />
                        <MoneyText cents={r.debitCents} size="sm" tone="out" signed />
                      </Row>
                    </View>
                  );
                })
              ) : (
                <View style={{ paddingVertical: 16 }}>
                  <Text variant="bodySm" color="ink4">
                    No ledger entries in this range.
                  </Text>
                </View>
              )}
            </Card>
          </Appear>

          {refRank.length ? (
            <Appear i={4}>
              <Card kind="flat" style={{ gap: 14 }}>
                <Text variant="overline" color="copper">
                  Activity by reference type
                </Text>
                <RankBars data={refRank} formatValue={formatCompactLKR} />
              </Card>
            </Appear>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------- Chargebacks ------------------------------ */

export function ChargebacksSection() {
  const canRefund = usePermission('payment:refund');
  const toast = useToast();
  const q = useOpenChargebacks(canRefund);
  const resolve = useResolveChargeback();
  const [target, setTarget] = useState<ChargebackRow | null>(null);
  const [refundId, setRefundId] = useState('');

  if (!canRefund) return <NoPermission perm="payment:refund" what="view or resolve chargebacks" />;
  if (q.isLoading) return <SkeletonList rows={3} height={120} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  if (!rows.length) return <InlineEmpty icon={CheckCircle2} title="No open chargebacks" message="Every gateway dispute has been cleared or resolved." />;

  return (
    <View style={{ gap: 10 }}>
      {rows.map((cb, i) => (
        <Appear key={cb.id} i={i}>
          <Card kind="flat" style={{ gap: 10, paddingLeft: 20 }}>
            <ToneRule tone="out" />
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="overline" color="ink4">
                  Chargeback · {shortId(cb.id)}
                </Text>
                <Text variant="h3" numberOfLines={2}>
                  {cb.reason}
                </Text>
              </View>
              <StatusBadge status={cb.status} />
            </Row>
            <Row justify="space-between">
              <IdLine label="Payment" id={cb.paymentId} onPress={() => go(`/admin/payments/${cb.paymentId}`)} />
              <Text variant="caption" color="ink5">
                Opened {timeAgo(cb.createdAt)}
              </Text>
            </Row>
            {cb.notes ? (
              <Text variant="caption" color="ink4">
                {cb.notes}
              </Text>
            ) : null}
            <Button title="Resolve" size="sm" variant="secondary" icon={ShieldAlert} full onPress={() => setTarget(cb)} />
          </Card>
        </Appear>
      ))}
      <ReasonSheet
        visible={!!target}
        onClose={() => {
          setTarget(null);
          setRefundId('');
        }}
        title="Resolve chargeback"
        message={target ? `${target.reason} · payment ${shortId(target.paymentId, 12)}` : undefined}
        confirmLabel="Resolve chargeback"
        reasonLabel="Resolution memo"
        placeholder="What happened and how it was settled (optional)."
        requireReason={false}
        loading={resolve.isPending}
        onConfirm={(notes) => {
          if (!target) return;
          resolve.mutate(
            { id: target.id, ...(notes ? { notes } : {}), ...(refundId.trim() ? { refundId: refundId.trim() } : {}) },
            {
              onSuccess: () => {
                toast.success('Chargeback resolved');
                setTarget(null);
                setRefundId('');
              },
              onError: (e) => toast.error('Could not resolve', errorMessage(e)),
            },
          );
        }}
      >
        <Field label="Linked refund id" hint="Optional — ties the resolution to a refund.">
          <Input value={refundId} onChangeText={setRefundId} placeholder="ref_…" autoCapitalize="none" autoCorrect={false} />
        </Field>
      </ReasonSheet>
    </View>
  );
}

/* --------------------------------- Credit --------------------------------- */

type CreditFilter = 'all' | 'active' | 'suspended' | 'closed';

export function CreditSection() {
  const canManage = usePermission('payment:refund');
  const toast = useToast();
  const [filter, setFilter] = useState<CreditFilter>('all');
  const q = useCreditFacilities(filter === 'all' ? undefined : filter, canManage);
  const patch = usePatchCreditFacility();
  const [limitFor, setLimitFor] = useState<CreditFacilityRow | null>(null);
  const [limit, setLimit] = useState('');
  const [limitErr, setLimitErr] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<CreditFacilityRow | null>(null);
  const [resuming, setResuming] = useState<CreditFacilityRow | null>(null);

  if (!canManage) return <NoPermission perm="payment:refund" what="manage credit facilities" />;

  const rows = q.data ?? [];
  const totalLimit = rows.reduce((s, r) => s + r.limitCents, 0);
  const totalUsed = rows.reduce((s, r) => s + r.usedCents, 0);

  return (
    <View style={{ gap: 12 }}>
      <ChipRow<CreditFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'suspended', label: 'Suspended' },
          { value: 'closed', label: 'Closed' },
        ]}
      />
      {q.isLoading ? (
        <SkeletonList rows={3} height={130} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !rows.length ? (
        <InlineEmpty icon={CreditCard} title="No credit facilities" message="Facilities appear after a business meets the 3-paid-orders rule or an admin creates one." />
      ) : (
        <>
          <Appear>
            <StatGrid>
              <Stat label="Extended" value={formatCompactLKR(totalLimit)} hint={`${rows.length} facilities`} icon={Wallet} />
              <Stat label="Drawn" value={formatCompactLKR(totalUsed)} hint={`${totalLimit ? Math.round((totalUsed / totalLimit) * 100) : 0}% utilised`} icon={ArrowUpRight} />
            </StatGrid>
          </Appear>
          {rows.map((r, i) => {
            const util = r.limitCents ? r.usedCents / r.limitCents : 0;
            return (
              <Appear key={r.businessId} i={i + 1}>
                <Card kind="flat" style={{ gap: 12 }}>
                  <Row justify="space-between" align="flex-start">
                    <View style={{ flex: 1, gap: 4 }}>
                      <IdLine label="Business" id={r.businessId} onPress={() => go(`/admin/businesses/${r.businessId}`)} />
                      <Row gap={6}>
                        <Badge label={r.defaultTerms.toUpperCase()} size="sm" tone="ink" />
                        {r.autoGranted ? <Badge label="Auto-granted" size="sm" tone="volt" /> : null}
                      </Row>
                    </View>
                    <StatusBadge status={r.status} />
                  </Row>
                  <View style={{ gap: 6 }}>
                    <Row justify="space-between">
                      <MoneyText cents={r.usedCents} size="md" tone={util > 0.9 ? 'out' : 'neutral'} />
                      <Text variant="caption" color="ink4">
                        of {formatCompactLKR(r.limitCents)}
                      </Text>
                    </Row>
                    <ProgressBar value={util} max={1} tone={util > 0.9 ? 'danger' : util > 0.7 ? 'warning' : 'ink'} />
                  </View>
                  <Row gap={8}>
                    <Button
                      title="Set limit"
                      size="sm"
                      style={{ flex: 1 }}
                      onPress={() => {
                        setLimit(String(r.limitCents / 100));
                        setLimitErr(null);
                        setLimitFor(r);
                      }}
                    />
                    {r.status === 'active' ? (
                      <Button title="Suspend" size="sm" variant="secondary" icon={PauseCircle} style={{ flex: 1 }} onPress={() => setSuspending(r)} />
                    ) : (
                      <Button title="Resume" size="sm" variant="secondary" icon={PlayCircle} style={{ flex: 1 }} onPress={() => setResuming(r)} />
                    )}
                  </Row>
                </Card>
              </Appear>
            );
          })}
        </>
      )}

      <Sheet
        visible={!!limitFor}
        onClose={() => setLimitFor(null)}
        title="Set credit limit"
        subtitle={limitFor ? `Business ${shortId(limitFor.businessId, 12)} · currently ${formatCompactLKR(limitFor.limitCents)}` : undefined}
        footer={
          <Button
            title="Save limit"
            full
            size="lg"
            loading={patch.isPending}
            onPress={() => {
              if (!limitFor) return;
              const cents = rupeesToCents(limit);
              if (cents === null || cents < 0 || !limit.trim()) {
                setLimitErr('Enter a valid amount in rupees.');
                return;
              }
              patch.mutate(
                { businessId: limitFor.businessId, patch: { limitCents: cents } },
                {
                  onSuccess: () => {
                    toast.success('Credit limit updated');
                    setLimitFor(null);
                  },
                  onError: (e) => toast.error('Could not update limit', errorMessage(e)),
                },
              );
            }}
          />
        }
      >
        <Field label="New limit" hint={limitFor ? `Drawn today: ${formatCompactLKR(limitFor.usedCents)}` : undefined} error={limitErr}>
          <Input value={limit} onChangeText={setLimit} prefix="Rs." keyboardType="decimal-pad" placeholder="0.00" style={{ fontFamily: 'IBMPlexMono_500Medium' }} />
        </Field>
        <View style={{ marginTop: 12, padding: 12, borderRadius: radii.lg, backgroundColor: colors.pearl }}>
          <Text variant="caption" color="ink4">
            The API refuses limits below the amount already drawn.
          </Text>
        </View>
      </Sheet>

      <ReasonSheet
        visible={!!suspending}
        onClose={() => setSuspending(null)}
        title="Suspend credit facility"
        message="The business can't draw new credit until resumed."
        confirmLabel="Suspend facility"
        variant="danger"
        placeholder="Suspend reason (required for audit)"
        loading={patch.isPending}
        onConfirm={(reason) => {
          if (!suspending) return;
          patch.mutate(
            { businessId: suspending.businessId, patch: { status: 'suspended', reason } },
            {
              onSuccess: () => {
                toast.success('Facility suspended');
                setSuspending(null);
              },
              onError: (e) => toast.error('Could not suspend', errorMessage(e)),
            },
          );
        }}
      />
      <ConfirmSheet
        visible={!!resuming}
        onClose={() => setResuming(null)}
        title="Resume credit facility?"
        message="The business will be able to draw on its credit line again."
        confirmLabel="Resume facility"
        loading={patch.isPending}
        onConfirm={() => {
          if (!resuming) return;
          patch.mutate(
            { businessId: resuming.businessId, patch: { status: 'active' } },
            {
              onSuccess: () => {
                toast.success('Facility resumed');
                setResuming(null);
              },
              onError: (e) => toast.error('Could not resume', errorMessage(e)),
            },
          );
        }}
      />
    </View>
  );
}
