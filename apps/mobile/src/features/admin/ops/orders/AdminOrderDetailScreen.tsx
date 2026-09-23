import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, ChevronRight, Clock, Gavel, Globe2, Landmark, Mail, Package, Phone, Scale, ShieldAlert, Store } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  IconTile,
  InkHero,
  Input,
  KeyValue,
  LinkText,
  Screen,
  Select,
  Sheet,
  Skeleton,
  StatusBadge,
  Text,
  Timeline,
  useToast,
} from '@/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import { formatDateTime, formatLKR, humanize, timeAgo } from '@/lib/format';
import { colors, radii } from '@/theme/tokens';
import { ContactLine, HeroMetric, Pill, Reveal, Section } from '../kit';
import { overrideTargets, useAdminOrder, type AdminOrder } from './api';
import { Can } from '@/features/admin/platform/kit';
import { OUTCOME_LABEL, ResolveDisputeSheet, type DisputeOutcome } from '../disputes/ResolveDisputeSheet';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'JPY', 'CNY'];

function apiErr(e: unknown, fallback: string) {
  return e instanceof ApiError ? `${e.code}: ${e.message}` : errorMessage(e, fallback);
}

export function AdminOrderDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const q = useAdminOrder(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [wireOpen, setWireOpen] = useState(false);
  const [resolveWith, setResolveWith] = useState<DisputeOutcome | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-order', id] });
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  const order = q.data?.order;
  const items = q.data?.items ?? [];
  const events = q.data?.events ?? [];
  const cross = !!order?.direction && order.direction !== 'domestic';
  const canWire = cross && order?.status === 'pending';
  const targets = order ? overrideTargets(order.status) : [];
  const disputed = order?.status === 'disputed';

  return (
    <Screen
      back
      kicker="Purchase order"
      title={order ? (order.poNumber ?? order.id.slice(0, 10)) : 'Order'}
      subtitle={order ? `Placed ${formatDateTime(order.createdAt)} · updated ${timeAgo(order.updatedAt)}` : undefined}
      onRefresh={() => q.refetch()}
      footer={
        order && (canWire || targets.length > 0) ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {canWire ? <Button title="Record wire" icon={Landmark} variant="copper" onPress={() => setWireOpen(true)} style={{ flex: 1 }} /> : null}
            {targets.length > 0 ? <Button title="Override status" icon={ShieldAlert} onPress={() => setOverrideOpen(true)} style={{ flex: 1 }} full={!canWire} /> : null}
          </View>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <View style={{ gap: 12 }}>
          <Skeleton height={210} radius={radii['2xl']} />
          <Skeleton height={140} radius={radii.xl} />
          <Skeleton height={220} radius={radii.xl} />
        </View>
      ) : q.isError || !order ? (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState icon={AlertTriangle} title="Order not found" message="This order doesn't exist or you can't view it." action={{ label: 'Back to orders', onPress: () => router.back() }} />
        ) : (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        )
      ) : (
        <>
          <Reveal index={0}>
            <InkHero seed={`order-${order.id}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <StatusBadge status={order.status} />
                {cross ? <Pill label={String(order.direction).toUpperCase()} tone="volt" icon={Globe2} /> : null}
              </View>
              <Text variant="overline" color="paperMuted" style={{ marginTop: 16 }}>
                Total amount · {order.currency ?? 'LKR'}
              </Text>
              <Text variant="metric" color="paper" numberOfLines={1} adjustsFontSizeToFit>
                {formatLKR(order.totalCents ?? 0)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.paperLine }}>
                <HeroMetric label="Subtotal" value={formatLKR(order.subtotalCents ?? 0)} />
                <HeroMetric label="Delivery" value={formatLKR(order.deliveryFeeCents ?? 0)} />
                <HeroMetric label="Lines" value={String(items.length)} tone="volt" />
              </View>
            </InkHero>
          </Reveal>

          {disputed ? (
            <Reveal index={1}>
              <Section kicker="Dispute" title="Awaiting arbitration" icon={Scale}>
                {order.disputeReason ? <Banner tone="danger" title={order.disputeOpenedBy ? `Opened by ${humanize(order.disputeOpenedBy)}` : 'Dispute reason'} message={order.disputeReason} /> : null}
                <Text variant="bodySm" color="ink4">
                  Disputes can only be closed by a resolution: a full refund cancels the order; release or partial refund completes it.
                </Text>
                <Can perm="dispute:resolve" fallback={<Text variant="caption" color="ink5">You need the dispute:resolve permission to arbitrate.</Text>}>
                  <View style={{ gap: 8 }}>
                    {(['refund_business', 'partial', 'release_supplier'] as DisputeOutcome[]).map((o) => (
                      <Button
                        key={o}
                        title={OUTCOME_LABEL[o]}
                        icon={Gavel}
                        variant={o === 'refund_business' ? 'danger' : o === 'partial' ? 'secondary' : 'primary'}
                        full
                        onPress={() => setResolveWith(o)}
                      />
                    ))}
                  </View>
                </Can>
              </Section>
            </Reveal>
          ) : null}

          <Reveal index={1}>
            <PartyCard
              kind="buyer"
              name={order.businessName ?? 'Direct buyer'}
              contact={order.businessContactPerson}
              phone={order.businessPhone}
              email={order.businessEmail}
              onInspect={order.businessId ? () => router.push(`/admin/businesses/${order.businessId}` as never) : undefined}
              footerLabel="Delivery destination"
              footer={[order.deliveryAddress || 'No address specified', [order.deliveryCity, order.deliveryDistrict].filter(Boolean).join(', ')].filter(Boolean).join('\n')}
            />
          </Reveal>
          <Reveal index={2}>
            <PartyCard
              kind="supplier"
              name={order.supplierName ?? 'Direct supplier'}
              contact={order.supplierContactPerson}
              phone={order.supplierPhone}
              email={order.supplierEmail}
              onInspect={order.supplierId ? () => router.push(`/admin/suppliers/${order.supplierId}` as never) : undefined}
              footerLabel={order.supplierAddress ? 'Merchant location' : undefined}
              footer={order.supplierAddress ?? undefined}
            />
          </Reveal>

          <Reveal index={3}>
            <Section kicker={`Line items · ${items.length}`} title="What was ordered" icon={Package}>
              {items.length === 0 ? (
                <Text variant="bodySm" color="ink4">
                  No line item snapshot recorded for this purchase order.
                </Text>
              ) : (
                <View>
                  {items.map((it, i) => (
                    <View
                      key={it.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                        borderBottomWidth: StyleSheet.hairlineWidth * 2,
                        borderBottomColor: colors.lineSoft,
                      }}
                    >
                      <View style={{ minWidth: 38, height: 38, paddingHorizontal: 6, borderRadius: 12, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 12.5, color: colors.ink }}>{it.quantity}×</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="body" weight="medium" numberOfLines={2}>
                          {it.productNameSnapshot}
                        </Text>
                        <Text variant="caption" color="ink4">
                          {it.quantity} × {formatLKR(it.unitPriceCents)}
                        </Text>
                      </View>
                      <Text variant="mono" style={{ fontFamily: 'IBMPlexMono_500Medium' }}>
                        {formatLKR(it.lineTotalCents)}
                      </Text>
                    </View>
                  ))}
                  <KeyValue label="Subtotal" value={formatLKR(order.subtotalCents ?? 0)} mono />
                  <KeyValue label="Delivery fee" value={formatLKR(order.deliveryFeeCents ?? 0)} mono />
                  <KeyValue label="Total" value={formatLKR(order.totalCents ?? 0)} emphasize last />
                </View>
              )}
            </Section>
          </Reveal>

          {order.notes || order.rejectionReason || order.cancelledReason ? (
            <Reveal index={4}>
              <View style={{ gap: 10 }}>
                {order.notes ? <Banner tone="info" title="Order notes" message={order.notes} /> : null}
                {order.rejectionReason ? <Banner tone="danger" title="Supplier rejection reason" message={order.rejectionReason} /> : null}
                {order.cancelledReason ? <Banner tone="danger" title="Cancellation reason" message={order.cancelledReason} /> : null}
              </View>
            </Reveal>
          ) : null}

          {cross ? (
            <Reveal index={5}>
              <Section kicker="Cross-border" title="Trade details" icon={Globe2}>
                <View>
                  <KeyValue label="Direction" value={humanize(order.direction)} />
                  {order.incoterms ? <KeyValue label="Incoterms" value={order.incoterms} mono /> : null}
                  {order.fxSnapshotId ? <KeyValue label="FX snapshot" value={order.fxSnapshotId} mono /> : null}
                  {order.declaredShippingCostCents != null ? <KeyValue label="Declared shipping" value={formatLKR(order.declaredShippingCostCents)} mono /> : null}
                  {order.declaredDutyCents != null ? <KeyValue label="Declared duty" value={formatLKR(order.declaredDutyCents)} mono /> : null}
                  {order.commercialInvoiceNo ? <KeyValue label="Commercial invoice" value={order.commercialInvoiceNo} mono /> : null}
                  <KeyValue label="Customs status" value={order.customsStatus ? humanize(order.customsStatus) : '—'} last />
                </View>
              </Section>
            </Reveal>
          ) : null}

          {order.wireRef ? (
            <Reveal index={6}>
              <Card kind="flat" padding={18} style={{ backgroundColor: colors.mintSoft, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <IconTile icon={Landmark} tone="success" size={34} style={{ backgroundColor: colors.paper }} />
                  <Text variant="overline" style={{ color: colors.mint }}>
                    Wire settled
                  </Text>
                </View>
                <KeyValue label="Reference" value={order.wireRef} mono />
                {order.wireReceivedCurrency && order.wireReceivedAmountCents != null ? (
                  <KeyValue label="Received" value={`${(order.wireReceivedAmountCents / 100).toLocaleString('en-LK')} ${order.wireReceivedCurrency}`} mono />
                ) : null}
                {order.wireReceivedAt ? <KeyValue label="At" value={formatDateTime(order.wireReceivedAt)} last /> : null}
              </Card>
            </Reveal>
          ) : null}

          <Reveal index={7}>
            <Section kicker={`Audit trail · ${events.length}`} title="Lifecycle events" icon={Clock}>
              {events.length === 0 ? (
                <Text variant="bodySm" color="ink4">
                  No lifecycle events recorded yet.
                </Text>
              ) : (
                <Timeline
                  steps={events.map((ev, i) => ({
                    label: `${ev.fromStatus ? `${humanize(ev.fromStatus)} → ` : ''}${humanize(ev.toStatus)}`,
                    hint: [formatDateTime(ev.createdAt), ev.reason ? `“${ev.reason}”` : null, ev.actorUserId ? `Actor ${ev.actorUserId}` : null].filter(Boolean).join('\n'),
                    state: i === events.length - 1 ? 'active' : 'done',
                  }))}
                />
              )}
            </Section>
          </Reveal>
          <Text variant="caption" color="ink5" align="center">
            Order ID {order.id}
          </Text>

          <ResolveDisputeSheet
            target={resolveWith ? order : null}
            initialOutcome={resolveWith ?? undefined}
            onClose={() => setResolveWith(null)}
            onResolved={invalidate}
          />
          <OverrideSheet
            visible={overrideOpen && targets.length > 0}
            onClose={() => setOverrideOpen(false)}
            order={order}
            targets={targets}
            onDone={() => {
              invalidate();
              setOverrideOpen(false);
              toast.success('Override applied', 'Recorded in the security audit trail.');
            }}
          />
          {canWire ? (
            <WireSheet
              visible={wireOpen}
              onClose={() => setWireOpen(false)}
              orderId={order.id}
              onDone={() => {
                invalidate();
                setWireOpen(false);
                toast.success('Wire recorded', 'The order is marked paid.');
              }}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function PartyCard({
  kind,
  name,
  contact,
  phone,
  email,
  onInspect,
  footerLabel,
  footer,
}: {
  kind: 'buyer' | 'supplier';
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  onInspect?: () => void;
  footerLabel?: string;
  footer?: string;
}) {
  const Icon = kind === 'buyer' ? Building2 : Store;
  return (
    <Card onPress={onInspect} padding={18} style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon={Icon} tone={kind === 'buyer' ? 'copper' : 'ink'} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="overline" color="ink4">
            {kind === 'buyer' ? 'Buyer business' : 'Supplier merchant'}
          </Text>
          <Text variant="h3" numberOfLines={1}>
            {name}
          </Text>
        </View>
        {onInspect ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={16} color={colors.ink4} strokeWidth={2} />
          </View>
        ) : null}
      </View>
      {contact ? (
        <Text variant="bodySm" color="ink3">
          Contact · {contact}
        </Text>
      ) : null}
      <ContactLine icon={Phone} value={phone} href={phone ? `tel:${phone}` : undefined} />
      <ContactLine icon={Mail} value={email} href={email ? `mailto:${email}` : undefined} />
      {footer ? (
        <View style={{ backgroundColor: colors.pearl, borderRadius: radii.lg, borderCurve: 'continuous', padding: 12, gap: 2, marginTop: 2 }}>
          {footerLabel ? (
            <Text variant="overline" color="ink5">
              {footerLabel}
            </Text>
          ) : null}
          <Text variant="bodySm" color="ink3">
            {footer}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function OverrideSheet({
  visible,
  onClose,
  order,
  targets,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  order: AdminOrder;
  targets: string[];
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const status = picked && targets.includes(picked) ? picked : targets[0];
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api.post<{ ok: true }>(`/admin/orders/${order.id}/override`, {
        status,
        reason,
        ...(order.updatedAt ? { expectedUpdatedAt: order.updatedAt } : {}),
      }),
    onSuccess: () => {
      setErr(null);
      setReason('');
      onDone();
    },
    onError: (e) => setErr(apiErr(e, 'Override failed')),
  });
  const ok = reason.trim().length >= 5;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Administrative override"
      subtitle="Moves the order along a legal edge on behalf of either party. Runs the full pipeline (refunds, notifications); every override is signed and audited."
      scroll
      footer={
        <>
          <Button title="Apply audited override" variant="danger" size="lg" full disabled={!ok} loading={m.isPending} onPress={() => m.mutate()} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="bodySm" color="ink4">
            Current
          </Text>
          <StatusBadge status={order.status} size="sm" />
        </View>
        <Field label="Target status">
          <Select value={status} onChange={setPicked} title="Target status" options={targets.map((s) => ({ value: s, label: humanize(s) }))} />
        </Field>
        <Field label="Audit reason" required hint={ok ? 'Ready to sign' : `Mandatory · at least 5 characters (${reason.trim().length}/5)`}>
          <Input value={reason} onChangeText={setReason} multiline placeholder="Explicit operational reason for this override…" />
        </Field>
      </View>
    </Sheet>
  );
}

function WireSheet({ visible, onClose, orderId, onDone }: { visible: boolean; onClose: () => void; orderId: string; onDone: () => void }) {
  const [wireRef, setWireRef] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () =>
      api.post<{ status: string; deltaBps: number }>(`/admin/orders/${orderId}/wire-received`, {
        wireRef,
        receivedAmountCents: Math.round(Number(amount) * 100),
        receivedCurrency: currency,
        acknowledgeMismatch: ack,
      }),
    onSuccess: () => {
      setErr(null);
      setWireRef('');
      setAmount('');
      onDone();
    },
    onError: (e) => setErr(apiErr(e, 'Failed')),
  });
  const ready = !!wireRef.trim() && !!amount && !Number.isNaN(Number(amount));
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Record wire receipt"
      subtitle="Cross-border orders settle via wire/SWIFT. A delta above 1% needs explicit acknowledgement."
      scroll
      footer={
        <>
          <Button title="Record wire & mark paid" variant="copper" size="lg" full disabled={!ready} loading={m.isPending} onPress={() => m.mutate()} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label="Wire reference" required>
          <Input value={wireRef} onChangeText={setWireRef} placeholder="e.g. SBI-IN-2026-001234" autoCapitalize="characters" />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Amount" required style={{ flex: 1 }}>
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
          </Field>
          <Field label="Currency" style={{ width: 120 }}>
            <Select value={currency} onChange={setCurrency} title="Currency" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </Field>
        </View>
        <Checkbox checked={ack} onChange={setAck} label="Acknowledge FX delta" description="Confirm the received amount may differ by more than 1%." />
        <LinkText title="Wires are reconciled against the FX snapshot." color="ink" />
      </View>
    </Sheet>
  );
}
