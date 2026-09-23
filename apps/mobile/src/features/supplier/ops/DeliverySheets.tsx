import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useMutation } from '@tanstack/react-query';
import { Camera, CheckCircle2, ImagePlus, Save, Truck, X } from 'lucide-react-native';
import { api } from '@/lib/api';
import { appendFile, pickImage, type PickedFile } from '@/lib/files';
import { formatDateTime } from '@/lib/format';
import { isLifecycleError, lifecycleErrorMessage, type LifecycleDelivery } from '@/lib/orderLifecycle';
import { useOnChange } from '@/lib/useOnChange';
import { radii } from '@/theme/tokens';
import { Banner, Button, Field, IconButton, Input, KeyValue, Sheet, StatusBadge, Text, useToast } from '@/ui';
import { PodPhoto } from '@/features/common/orderLifecycle';
import { Section } from './kit';
import { useInvalidateOrder } from './orderMutations';

/** Server rule: recipient name plus a photo or a note. */
export function hasPod(d: LifecycleDelivery | null | undefined): boolean {
  return !!d?.recipientName && (d.hasPodPhoto || !!d.podNote);
}

/**
 * "Mark delivered": capture proof of delivery (recipient + note and/or photo),
 * upload it, then move the order to delivered.
 */
export function PodSheet({
  visible,
  onClose,
  poId,
  poNumber,
  delivery,
}: {
  visible: boolean;
  onClose: () => void;
  poId: string;
  poNumber?: string;
  delivery: LifecycleDelivery | null | undefined;
}) {
  const toast = useToast();
  const invalidate = useInvalidateOrder();
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useOnChange(visible, (open) => {
    if (!open) return;
    setRecipient(delivery?.recipientName ?? '');
    setNote(delivery?.podNote ?? '');
    setPhoto(null);
    setErr(null);
  });

  const hasPhoto = !!photo || !!delivery?.hasPodPhoto;
  const ready = recipient.trim().length > 0 && (hasPhoto || note.trim().length > 0);
  const changed = !!photo || recipient.trim() !== (delivery?.recipientName ?? '') || note.trim() !== (delivery?.podNote ?? '');

  const m = useMutation({
    mutationFn: async () => {
      if (changed || !hasPod(delivery)) {
        const form = new FormData();
        form.append('recipientName', recipient.trim());
        if (note.trim()) form.append('note', note.trim());
        if (photo) appendFile(form, 'file', photo);
        await api.upload(`/deliveries/${poId}/pod`, form);
      }
      await api.post(`/purchase-orders/${poId}/transition`, { to: 'delivered' });
    },
    onSuccess: async () => {
      toast.success('Marked delivered', 'The buyer has been asked to confirm receipt.');
      onClose();
      await invalidate(poId);
    },
    onError: async (e) => {
      setErr(lifecycleErrorMessage(e));
      // The POD may have saved even if the transition failed.
      if (!isLifecycleError(e, 'POD_REQUIRED')) await invalidate(poId);
    },
  });

  const pick = async (camera: boolean) => {
    const [f] = await pickImage({ camera });
    if (f) setPhoto(f);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Proof of delivery"
      subtitle={`${poNumber ? `${poNumber} · ` : ''}Record who received the goods, with a photo or a note.`}
      scroll
      footer={
        <>
          <Button title="Mark delivered" icon={CheckCircle2} size="lg" full disabled={!ready} loading={m.isPending} onPress={() => m.mutate()} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label="Recipient name" required>
          <Input value={recipient} onChangeText={setRecipient} placeholder="Who signed for the delivery?" maxLength={120} autoCapitalize="words" />
        </Field>
        <Field label="Delivery note" hint={hasPhoto ? 'Optional when a photo is attached' : 'Required unless you attach a photo'}>
          <Input value={note} onChangeText={setNote} placeholder="e.g. Left at loading bay 3, 12 cartons" maxLength={500} multiline />
        </Field>
        <Field label="Photo">
          {photo ? (
            <View>
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 180, borderRadius: radii.lg }} contentFit="cover" />
              <IconButton icon={X} accessibilityLabel="Remove photo" variant="surface" size={32} onPress={() => setPhoto(null)} style={{ position: 'absolute', top: 8, right: 8 }} />
            </View>
          ) : delivery?.hasPodPhoto ? (
            <PodPhoto poId={poId} height={140} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Take photo" icon={Camera} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => pick(true)} />
            <Button title="From gallery" icon={ImagePlus} variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => pick(false)} />
          </View>
        </Field>
      </View>
    </Sheet>
  );
}

/** Carrier / tracking number editor plus captured proof-of-delivery details. */
export function TrackingSection({ poId, delivery, editable }: { poId: string; delivery: LifecycleDelivery | null | undefined; editable: boolean }) {
  const toast = useToast();
  const invalidate = useInvalidateOrder();
  const [carrier, setCarrier] = useState(delivery?.carrier ?? '');
  const [tracking, setTracking] = useState(delivery?.trackingNumber ?? '');

  // Re-sync the form when the saved values change (after save / refetch).
  useOnChange(`${delivery?.carrier ?? ''}\u0000${delivery?.trackingNumber ?? ''}`, () => {
    setCarrier(delivery?.carrier ?? '');
    setTracking(delivery?.trackingNumber ?? '');
  });

  const dirty = carrier.trim() !== (delivery?.carrier ?? '') || tracking.trim() !== (delivery?.trackingNumber ?? '');

  const save = useMutation({
    mutationFn: () => api.patch(`/deliveries/${poId}`, { carrier: carrier.trim() || null, trackingNumber: tracking.trim() || null }),
    onSuccess: async () => {
      toast.success('Tracking saved', tracking.trim() ? 'The buyer has been notified.' : undefined);
      await invalidate(poId);
    },
    onError: (e) => toast.error('Could not save tracking', lifecycleErrorMessage(e)),
  });

  if (!editable && !delivery) return null;

  return (
    <Section icon={Truck} kicker="Logistics" title="Delivery & tracking" right={delivery ? <StatusBadge status={delivery.status} size="sm" /> : undefined}>
      {editable ? (
        <View style={{ gap: 10 }}>
          <Field label="Carrier">
            <Input value={carrier} onChangeText={setCarrier} placeholder="e.g. Own fleet, Pronto, DHL" maxLength={80} />
          </Field>
          <Field label="Tracking number">
            <Input value={tracking} onChangeText={setTracking} placeholder="e.g. PRN-4471902" autoCapitalize="characters" maxLength={120} />
          </Field>
          <Button title="Save tracking" icon={Save} variant="secondary" size="sm" disabled={!dirty} loading={save.isPending} onPress={() => save.mutate()} />
        </View>
      ) : null}
      {delivery ? (
        <View style={{ marginTop: editable ? 0 : -8 }}>
          {!editable && delivery.carrier ? <KeyValue label="Carrier" value={delivery.carrier} /> : null}
          {!editable && delivery.trackingNumber ? <KeyValue label="Tracking" value={delivery.trackingNumber} mono /> : null}
          {delivery.driverName ? <KeyValue label="Driver" value={delivery.driverName} /> : null}
          {delivery.estimatedAt ? <KeyValue label="ETA" value={formatDateTime(delivery.estimatedAt)} /> : null}
          {delivery.deliveredAt ? <KeyValue label="Delivered" value={formatDateTime(delivery.deliveredAt)} /> : null}
          {delivery.recipientName ? <KeyValue label="Received by" value={delivery.recipientName} /> : null}
          {delivery.podNote ? <KeyValue label="POD note" value={delivery.podNote} last={!delivery.hasPodPhoto} /> : null}
          {delivery.failedReason ? (
            <Text variant="caption" color="rose">
              Failed: {delivery.failedReason}
            </Text>
          ) : null}
        </View>
      ) : null}
      {delivery?.hasPodPhoto ? <PodPhoto poId={poId} /> : null}
    </Section>
  );
}
