import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Ban, CheckCircle2, Lock, PackageCheck, Truck, X, type LucideIcon } from 'lucide-react-native';
import { api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { isDispatchable, lifecycleErrorMessage, type LifecycleDelivery, type OrderLifecycle, type PaymentSummary } from '@/lib/orderLifecycle';
import { Button, ConfirmSheet, IconButton, Text, useToast } from '@/ui';
import { colors } from '@/theme/tokens';
import { ReasonSheet } from '@/features/common/orderLifecycle';
import { NEXT, NEXT_LABEL } from './api';
import { AcceptOrderSheet, type AcceptItem } from './AcceptOrderSheet';
import { PodSheet } from './DeliverySheets';
import { useInvalidateOrder } from './orderMutations';

/** Transition mutation shared by list rows, queues and the detail screen. */
export function useTransition() {
  const invalidate = useInvalidateOrder();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { poId: string; to: string; reason?: string }) =>
      api.post(`/purchase-orders/${v.poId}/transition`, { to: v.to, ...(v.reason ? { reason: v.reason } : {}) }),
    onSuccess: async (_, v) => {
      toast.success(`Order ${v.to === 'cancelled' ? 'cancelled' : v.to === 'rejected' ? 'rejected' : `advanced to ${humanize(v.to).toLowerCase()}`}`);
      await invalidate(v.poId);
    },
    onError: (e) => toast.error('Transition failed', lifecycleErrorMessage(e)),
  });
}

const ICON: Record<string, LucideIcon> = {
  accepted: CheckCircle2,
  preparing: PackageCheck,
  ready_for_pickup: PackageCheck,
  out_for_delivery: Truck,
  delivered: CheckCircle2,
};

/** Confirm-before-firing steps (irreversible for the supplier). */
const CONFIRM: Record<string, { title: string; message: string }> = {
  out_for_delivery: { title: 'Dispatch this order?', message: 'The buyer is notified that the consignment has left your depot.' },
  delivered: { title: 'Confirm delivered?', message: 'Marks the consignment as received at the buyer dock and starts escrow release.' },
};

/** Forward (non-exit) supplier steps, in lifecycle order. */
const FORWARD = ['accepted', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'];

/** Full order context available on the detail screen. */
export type OrderActionsDetail = {
  items: AcceptItem[];
  totalCents: number;
  lifecycle?: OrderLifecycle;
  paymentSummary?: PaymentSummary | null;
  delivery?: LifecycleDelivery | null;
};

/**
 * Supplier order buttons. With `detail` (order screen) the buttons come from
 * the server's `lifecycle.allowedTransitions`: Accept opens the partial-accept
 * sheet, Reject / Cancel need a reason, Dispatch is payment-gated and Mark
 * delivered captures proof of delivery. Without it (list rows) the next step
 * from NEXT is offered, deferring accept-with-changes and POD to the detail.
 */
export function OrderActions({
  poId,
  poNumber,
  status,
  size = 'sm',
  full,
  detail,
}: {
  poId: string;
  poNumber?: string;
  status: string;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  detail?: OrderActionsDetail;
}) {
  const t = useTransition();
  const [sheet, setSheet] = useState<'reject' | 'cancel' | 'accept' | 'pod' | null>(null);
  const [confirmTo, setConfirmTo] = useState<string | null>(null);
  const busy = t.isPending && t.variables?.poId === poId;

  const allowed = detail?.lifecycle ? detail.lifecycle.allowedTransitions : [NEXT[status], status === 'pending' ? 'rejected' : null].filter((s): s is string => !!s);
  const next = FORWARD.find((s) => allowed.includes(s));
  const canReject = allowed.includes('rejected');
  const canCancel = allowed.includes('cancelled');
  const gated = next === 'out_for_delivery' && !!detail && !isDispatchable(detail.paymentSummary, detail.lifecycle);

  const fire = (to: string, reason?: string) => t.mutate({ poId, to, reason }, { onSuccess: () => setSheet(null) });

  const onNext = () => {
    if (!next) return;
    if (next === 'accepted' && detail) return setSheet('accept');
    if (next === 'delivered') {
      // Proof of delivery is required — capture it on the order screen.
      if (detail) return setSheet('pod');
      return router.push(`/supplier/order/${poId}` as never);
    }
    if (CONFIRM[next]) return setConfirmTo(next);
    fire(next);
  };

  if (!next && !canReject && !canCancel) return null;

  const exit = canReject ? 'reject' : canCancel ? 'cancel' : null;

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: full ? 1 : undefined }}>
        {next ? (
          <Button
            title={gated ? 'Awaiting payment' : NEXT_LABEL[next] ?? humanize(next)}
            icon={gated ? Lock : ICON[next]}
            variant={status === 'pending' ? 'volt' : 'primary'}
            size={size}
            loading={busy && t.variables?.to === next}
            disabled={busy || gated}
            full={full}
            style={full ? { flex: 1 } : undefined}
            onPress={onNext}
          />
        ) : null}
        {exit ? (
          full ? (
            <Button
              title={exit === 'reject' ? 'Reject' : 'Cancel order'}
              icon={exit === 'reject' ? X : Ban}
              variant="secondary"
              size={size}
              disabled={busy}
              style={next ? undefined : { flex: 1 }}
              onPress={() => setSheet(exit)}
            />
          ) : (
            <IconButton
              icon={X}
              accessibilityLabel={exit === 'reject' ? 'Reject purchase order' : 'Cancel purchase order'}
              variant="surface"
              color={colors.rose}
              size={36}
              onPress={() => setSheet(exit)}
            />
          )
        ) : null}
      </View>
      {gated && full ? (
        <Text variant="caption" color="ink4" align="center">
          Dispatch unlocks once the buyer has paid, or the order is on COD or credit.
        </Text>
      ) : null}

      <ReasonSheet
        visible={sheet === 'reject'}
        onClose={() => setSheet(null)}
        title={`Reject ${poNumber ?? 'this PO'}?`}
        message="The buyer is notified and the order closes. This can't be undone."
        confirmLabel="Reject order"
        loading={busy}
        placeholder="e.g. Out of stock until next harvest"
        onConfirm={(r) => fire('rejected', r)}
      />

      <ReasonSheet
        visible={sheet === 'cancel'}
        onClose={() => setSheet(null)}
        title={`Cancel ${poNumber ?? 'this order'}?`}
        message="Use this when you can no longer fulfil an accepted order. Any payment is refunded to the buyer."
        confirmLabel="Cancel order"
        loading={busy}
        placeholder="e.g. Cold-room failure, stock spoiled"
        onConfirm={(r) => fire('cancelled', r)}
      />

      <ConfirmSheet
        visible={!!confirmTo}
        onClose={() => setConfirmTo(null)}
        title={confirmTo ? CONFIRM[confirmTo]?.title ?? 'Confirm' : ''}
        message={confirmTo ? CONFIRM[confirmTo]?.message : undefined}
        confirmLabel={confirmTo ? NEXT_LABEL[confirmTo] ?? 'Confirm' : 'Confirm'}
        loading={busy}
        onConfirm={() => {
          if (confirmTo) fire(confirmTo);
          setConfirmTo(null);
        }}
      >
        <Text variant="caption" color="ink4">
          {poNumber ? `Order ${poNumber}` : ''}
        </Text>
      </ConfirmSheet>

      {detail ? (
        <>
          <AcceptOrderSheet visible={sheet === 'accept'} onClose={() => setSheet(null)} poId={poId} poNumber={poNumber} items={detail.items} totalCents={detail.totalCents} />
          <PodSheet visible={sheet === 'pod'} onClose={() => setSheet(null)} poId={poId} poNumber={poNumber} delivery={detail.delivery} />
        </>
      ) : null}
    </>
  );
}
