import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, RotateCcw, Send, X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { appendFile, pickImage } from '@/lib/files';
import { formatDate } from '@/lib/format';
import { useOnChange } from '@/lib/useOnChange';
import {
  RETURN_REASON_CODES,
  RETURN_REASON_LABEL,
  lifecycleErrorMessage,
  type OrderReturn,
  type ReturnReasonCode,
} from '@/lib/orderLifecycle';
import { colors, radii } from '@/theme/tokens';
import { Banner, Button, Field, Input, Select, Sheet, Stepper, Text, useToast } from '@/ui';
import { ReasonSheet, ReturnCard } from '@/features/common/orderLifecycle';
import { Section } from '../kit';
import type { OrderDetail } from '../types';

type Item = OrderDetail['items'][number];

/** Statuses whose quantities no longer count against what can be returned. */
const RELEASED = ['rejected', 'cancelled'];

function remainingByItem(items: Item[], returns: OrderReturn[]): Record<string, number> {
  const used: Record<string, number> = {};
  for (const r of returns) {
    if (RELEASED.includes(r.status)) continue;
    for (const it of r.items) used[it.purchaseOrderItemId] = (used[it.purchaseOrderItemId] ?? 0) + (it.approvedQuantity ?? it.quantity);
  }
  return Object.fromEntries(items.map((it) => [it.id, Math.max(0, it.quantity - (used[it.id] ?? 0))]));
}

/** Refresh the order + every returns list after a change. */
function useInvalidateReturns(orderId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['order', orderId] }), qc.invalidateQueries({ queryKey: ['buyer-returns'] }), qc.invalidateQueries({ queryKey: ['po-invoices', orderId] })]);
}

/** Upload one photo to a return; resolves false if the picker was dismissed. */
async function uploadReturnPhoto(returnId: string, camera: boolean): Promise<boolean> {
  const [f] = await pickImage({ camera });
  if (!f) return false;
  const form = new FormData();
  appendFile(form, 'file', f);
  await api.upload(`/returns/${returnId}/attachments`, form);
  return true;
}

/** Buyer "Request a return": reason, note and per-line quantities, then optional photos. */
export function RequestReturnSheet({
  visible,
  onClose,
  orderId,
  items,
  returns,
  windowEndsAt,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  items: Item[];
  returns: OrderReturn[];
  windowEndsAt: number | null | undefined;
}) {
  const toast = useToast();
  const invalidate = useInvalidateReturns(orderId);
  const remaining = remainingByItem(items, returns);
  const [reasonCode, setReasonCode] = useState<ReturnReasonCode>('damaged');
  const [note, setNote] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [created, setCreated] = useState<OrderReturn | null>(null);
  const [photos, setPhotos] = useState(0);
  const [uploading, setUploading] = useState(false);

  useOnChange(visible, (open) => {
    if (!open) return;
    setReasonCode('damaged');
    setNote('');
    setQty({});
    setCreated(null);
    setPhotos(0);
  });

  const lines = items.filter((it) => (qty[it.id] ?? 0) > 0).map((it) => ({ itemId: it.id, quantity: qty[it.id] }));

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ return: OrderReturn }>(`/purchase-orders/${orderId}/returns`, {
        reasonCode,
        ...(note.trim() ? { reasonNote: note.trim() } : {}),
        lines,
      }),
    onSuccess: async (r) => {
      toast.success(`Return ${r.return.rmaNumber} requested`, 'The supplier will review it.');
      setCreated(r.return);
      await invalidate();
    },
    onError: (e) => toast.error('Could not request return', lifecycleErrorMessage(e)),
  });

  const addPhoto = async (camera: boolean) => {
    if (!created) return;
    setUploading(true);
    try {
      if (await uploadReturnPhoto(created.id, camera)) {
        setPhotos((n) => n + 1);
        await invalidate();
      }
    } catch (e) {
      toast.error('Upload failed', lifecycleErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  if (created) {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Add photos"
        subtitle={`${created.rmaNumber} · photos of the damage or wrong item help the supplier decide faster.`}
        footer={<Button title="Done" size="lg" full onPress={onClose} />}
      >
        <View style={{ gap: 12 }}>
          {photos > 0 ? <Banner tone="success" message={`${photos} photo${photos === 1 ? '' : 's'} attached`} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Take photo" icon={Camera} variant="secondary" style={{ flex: 1 }} loading={uploading} onPress={() => addPhoto(true)} />
            <Button title="From gallery" icon={ImagePlus} variant="secondary" style={{ flex: 1 }} disabled={uploading} onPress={() => addPhoto(false)} />
          </View>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Request a return"
      subtitle={windowEndsAt ? `Return window closes ${formatDate(windowEndsAt)}` : undefined}
      scroll
      footer={
        <>
          <Button title="Submit return request" icon={Send} size="lg" full disabled={lines.length === 0} loading={submit.isPending} onPress={() => submit.mutate()} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        <Field label="Reason" required>
          <Select<ReturnReasonCode>
            value={reasonCode}
            onChange={setReasonCode}
            title="Return reason"
            options={RETURN_REASON_CODES.map((c) => ({ value: c, label: RETURN_REASON_LABEL[c] }))}
          />
        </Field>
        <Field label="What should be returned?" hint="Set the quantity for each line you're sending back.">
          <View style={{ gap: 8 }}>
            {items.map((it) => {
              const max = remaining[it.id] ?? 0;
              return (
                <View
                  key={it.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.paper, opacity: max === 0 ? 0.5 : 1 }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                      {it.productNameSnapshot}
                    </Text>
                    <Text variant="caption" color="ink4">
                      {max === 0 ? 'Nothing left to return' : `Up to ${max}`}
                    </Text>
                  </View>
                  <Stepper value={qty[it.id] ?? 0} min={0} max={max} size="sm" onChange={(v) => setQty((q) => ({ ...q, [it.id]: v }))} />
                </View>
              );
            })}
          </View>
        </Field>
        <Field label="Details (optional)">
          <Input value={note} onChangeText={setNote} placeholder="e.g. 4 cartons crushed on arrival" maxLength={1000} multiline />
        </Field>
        <Text variant="caption" color="ink5">
          You can attach photos after submitting.
        </Text>
      </View>
    </Sheet>
  );
}

/** Returns on this order with cancel / add-photo actions, plus the request CTA. */
export function BuyerReturnsSection({
  order,
  items,
  returns,
  canRequest,
  windowEndsAt,
}: {
  order: OrderDetail['order'];
  items: Item[];
  returns: OrderReturn[];
  canRequest: boolean;
  windowEndsAt: number | null | undefined;
}) {
  const toast = useToast();
  const invalidate = useInvalidateReturns(order.id);
  const [open, setOpen] = useState(false);
  const [cancelFor, setCancelFor] = useState<OrderReturn | null>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: (v: { id: string; reason: string }) => api.post(`/returns/${v.id}/cancel`, { reason: v.reason }),
    onSuccess: async () => {
      toast.success('Return cancelled');
      setCancelFor(null);
      await invalidate();
    },
    onError: (e) => toast.error('Could not cancel return', lifecycleErrorMessage(e)),
  });

  const addPhoto = async (r: OrderReturn) => {
    setUploadingFor(r.id);
    try {
      if (await uploadReturnPhoto(r.id, false)) {
        toast.success('Photo attached');
        await invalidate();
      }
    } catch (e) {
      toast.error('Upload failed', lifecycleErrorMessage(e));
    } finally {
      setUploadingFor(null);
    }
  };

  if (!canRequest && returns.length === 0) return null;

  return (
    <Section
      kicker="After-sales"
      title="Returns"
      icon={RotateCcw}
      sub={canRequest && windowEndsAt ? `Return window open until ${formatDate(windowEndsAt)}` : `${returns.length} return${returns.length === 1 ? '' : 's'} on this order`}
    >
      {returns.length ? (
        <View style={{ gap: 10 }}>
          {returns.map((r) => (
            <ReturnCard
              key={r.id}
              ret={r}
              actions={
                r.status === 'requested' || r.status === 'approved' ? (
                  <>
                    <Button title="Add photo" icon={ImagePlus} variant="secondary" size="sm" loading={uploadingFor === r.id} onPress={() => addPhoto(r)} />
                    <Button title="Cancel return" icon={X} variant="ghost" size="sm" onPress={() => setCancelFor(r)} />
                  </>
                ) : undefined
              }
            />
          ))}
        </View>
      ) : null}
      {canRequest ? <Button title="Request a return" icon={RotateCcw} variant="secondary" full onPress={() => setOpen(true)} /> : null}

      <RequestReturnSheet visible={open} onClose={() => setOpen(false)} orderId={order.id} items={items} returns={returns} windowEndsAt={windowEndsAt} />
      <ReasonSheet
        visible={!!cancelFor}
        onClose={() => setCancelFor(null)}
        title={`Cancel ${cancelFor?.rmaNumber ?? 'return'}?`}
        message="The supplier is notified and the return closes."
        confirmLabel="Cancel return"
        loading={cancel.isPending}
        placeholder="e.g. Supplier replaced the goods instead"
        hint="At least 3 characters"
        onConfirm={(reason) => cancelFor && cancel.mutate({ id: cancelFor.id, reason })}
      />
    </Section>
  );
}
