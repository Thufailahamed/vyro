import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PackageCheck, Truck, X, type LucideIcon } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Button, ConfirmSheet, Field, IconButton, Input, Text, useToast } from '@/ui';
import { colors } from '@/theme/tokens';
import { NEXT, NEXT_LABEL } from './api';
import { useSupplier } from './kit';

/** Transition mutation shared by list rows, queues and the detail screen. */
export function useTransition() {
  const { supplierId } = useSupplier();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { poId: string; to: string; reason?: string }) =>
      api.post(`/purchase-orders/${v.poId}/transition`, { to: v.to, ...(v.reason ? { reason: v.reason } : {}) }),
    onSuccess: async (_, v) => {
      toast.success(`Order advanced to ${humanize(v.to).toLowerCase()}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'po'] }),
        qc.invalidateQueries({ queryKey: ['purchase-order', v.poId] }),
        qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'deliveries'] }),
        qc.invalidateQueries({ queryKey: ['supplier-delivery', v.poId] }),
      ]);
    },
    onError: (e) => toast.error('Transition failed', errorMessage(e)),
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

/**
 * Accept / reject / advance buttons exactly like the web order console:
 * pending → Accept PO + reject (✕); otherwise the next supplier step.
 */
export function OrderActions({
  poId,
  poNumber,
  status,
  size = 'sm',
  full,
}: {
  poId: string;
  poNumber?: string;
  status: string;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
}) {
  const t = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmTo, setConfirmTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const next = NEXT[status];
  const busy = t.isPending && t.variables?.poId === poId;

  const fire = (to: string, r?: string) => t.mutate({ poId, to, reason: r });

  if (!next) return null;

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: full ? 1 : undefined }}>
        <Button
          title={NEXT_LABEL[next] ?? humanize(next)}
          icon={ICON[next]}
          variant={status === 'pending' ? 'volt' : 'primary'}
          size={size}
          loading={busy && t.variables?.to === next}
          disabled={busy}
          full={full}
          style={full ? { flex: 1 } : undefined}
          onPress={() => (CONFIRM[next] ? setConfirmTo(next) : fire(next))}
        />
        {status === 'pending' ? (
          full ? (
            <Button title="Reject" icon={X} variant="secondary" size={size} disabled={busy} onPress={() => setRejectOpen(true)} />
          ) : (
            <IconButton icon={X} accessibilityLabel="Reject purchase order" variant="surface" color={colors.rose} size={36} onPress={() => setRejectOpen(true)} />
          )
        ) : null}
      </View>

      <ConfirmSheet
        visible={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Reject ${poNumber ?? 'this PO'}?`}
        message="The buyer is notified and the order closes. This can't be undone."
        confirmLabel="Reject order"
        variant="danger"
        loading={busy}
        onConfirm={() => {
          fire('rejected', reason.trim() || undefined);
          setRejectOpen(false);
          setReason('');
        }}
      >
        <Field label="Reason (optional)" hint="Shared with the buyer on the order timeline.">
          <Input value={reason} onChangeText={setReason} placeholder="e.g. Out of stock until next harvest" maxLength={500} multiline />
        </Field>
      </ConfirmSheet>

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
    </>
  );
}
