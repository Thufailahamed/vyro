import { useState } from 'react';
import { View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, PackageCheck, RotateCcw, X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { REASON_MIN, lifecycleErrorMessage, type OrderReturn } from '@/lib/orderLifecycle';
import { useOnChange } from '@/lib/useOnChange';
import { colors, radii } from '@/theme/tokens';
import { Button, ConfirmSheet, Field, Input, Sheet, Stepper, Switch, Text, useToast } from '@/ui';
import { ReasonSheet, ReturnCard } from '@/features/common/orderLifecycle';
import { Section } from './kit';
import { useInvalidateOrder } from './orderMutations';

/** Approve / reject / receive buttons for one return, with their sheets. */
export function SupplierReturnActions({ ret }: { ret: OrderReturn }) {
  const toast = useToast();
  const invalidate = useInvalidateOrder();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const m = useMutation({
    mutationFn: (v: { action: 'approve' | 'reject'; body: Record<string, unknown> }) => api.post(`/returns/${ret.id}/${v.action}`, v.body),
    onSuccess: async (_d, v) => {
      toast.success(v.action === 'approve' ? 'Return approved' : 'Return rejected');
      setRejectOpen(false);
      setApproveOpen(false);
      await invalidate(ret.purchaseOrderId);
    },
    onError: (e) => toast.error('Could not update return', lifecycleErrorMessage(e)),
  });

  if (ret.status !== 'requested' && ret.status !== 'approved') return null;

  return (
    <>
      {ret.status === 'requested' ? (
        <>
          <Button title="Approve" icon={CheckCircle2} size="sm" onPress={() => setApproveOpen(true)} />
          <Button title="Reject" icon={X} variant="secondary" size="sm" onPress={() => setRejectOpen(true)} />
        </>
      ) : (
        <Button title="Mark received" icon={PackageCheck} size="sm" onPress={() => setReceiveOpen(true)} />
      )}

      <ConfirmSheet
        visible={approveOpen}
        onClose={() => setApproveOpen(false)}
        title={`Approve ${ret.rmaNumber}?`}
        message="The buyer is asked to send the goods back. You refund once they're received."
        confirmLabel="Approve return"
        loading={m.isPending}
        onConfirm={() => m.mutate({ action: 'approve', body: {} })}
      />

      <ReasonSheet
        visible={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Reject ${ret.rmaNumber}?`}
        message="The buyer sees your reason and can escalate to VYRO."
        confirmLabel="Reject return"
        loading={m.isPending}
        placeholder="e.g. Damage not caused in transit"
        hint={`Shared with the buyer · at least ${REASON_MIN} characters`}
        onConfirm={(reason) => m.mutate({ action: 'reject', body: { reason } })}
      />

      <ReceiveReturnSheet ret={ret} visible={receiveOpen} onClose={() => setReceiveOpen(false)} />
    </>
  );
}

type RecvLine = { qty: number; restock: boolean };

/** Record what physically came back; the API refunds and issues a credit note. */
function ReceiveReturnSheet({ ret, visible, onClose }: { ret: OrderReturn; visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidateOrder();
  const [lines, setLines] = useState<Record<string, RecvLine>>({});
  const [note, setNote] = useState('');

  useOnChange(visible, (open) => {
    if (!open) return;
    setLines(Object.fromEntries(ret.items.map((it) => [it.id, { qty: it.approvedQuantity ?? it.quantity, restock: true }])));
    setNote('');
  });

  const m = useMutation({
    mutationFn: () =>
      api.post(`/returns/${ret.id}/receive`, {
        ...(note.trim() ? { note: note.trim() } : {}),
        lines: ret.items.map((it) => ({
          returnItemId: it.id,
          quantity: lines[it.id]?.qty ?? 0,
          restock: lines[it.id]?.restock ?? true,
        })),
      }),
    onSuccess: async () => {
      toast.success('Return received', 'The buyer is refunded and a credit note issued.');
      onClose();
      await invalidate(ret.purchaseOrderId);
    },
    onError: (e) => toast.error('Could not receive return', lifecycleErrorMessage(e)),
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Receive ${ret.rmaNumber}`}
      subtitle="Count what came back. Restocked units go back into available inventory."
      scroll
      footer={
        <>
          <Button title="Confirm receipt & refund" icon={PackageCheck} size="lg" full loading={m.isPending} onPress={() => m.mutate()} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 12 }}>
        {ret.items.map((it) => {
          const max = it.approvedQuantity ?? it.quantity;
          const s = lines[it.id] ?? { qty: max, restock: true };
          return (
            <View key={it.id} style={{ gap: 10, padding: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.paper }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                    {it.productName ?? 'Item'}
                  </Text>
                  <Text variant="caption" color="ink4">
                    Approved {max}
                  </Text>
                </View>
                <Stepper value={s.qty} min={0} max={max} size="sm" onChange={(qty) => setLines((l) => ({ ...l, [it.id]: { ...s, qty } }))} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="bodySm" color="ink3">
                  Restock
                </Text>
                <Switch value={s.restock} onValueChange={(restock) => setLines((l) => ({ ...l, [it.id]: { ...s, restock } }))} />
              </View>
            </View>
          );
        })}
        <Field label="Condition note (optional)">
          <Input value={note} onChangeText={setNote} placeholder="e.g. 2 cartons water-damaged, written off" maxLength={500} multiline />
        </Field>
      </View>
    </Sheet>
  );
}

/** Returns raised against one purchase order (supplier view). */
export function OrderReturnsSection({ returns }: { returns: OrderReturn[] }) {
  if (!returns.length) return null;
  return (
    <Section icon={RotateCcw} kicker="After-sales" title="Returns" sub={`${returns.length} return${returns.length === 1 ? '' : 's'} on this order`}>
      <View style={{ gap: 10 }}>
        {returns.map((r) => (
          <ReturnCard key={r.id} ret={r} actions={r.status === 'requested' || r.status === 'approved' ? <SupplierReturnActions ret={r} /> : undefined} />
        ))}
      </View>
    </Section>
  );
}
