import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { Banner, Button, Field, Input, Row, Sheet, Text, ToggleRow, useToast } from '@/ui';
import { AvailabilityToggle } from './components';
import { lkrToCents, offersKey, type Availability, type CatalogProduct, type Offer } from './api';

/**
 * Fast in-list edits: price, availability, live/hidden and (when tracked)
 * on-hand stock. Writes through the same endpoints as the full form.
 */
export function QuickEditSheet({
  offer,
  product,
  supplierId,
  onClose,
}: {
  offer: Offer | null;
  product?: CatalogProduct;
  supplierId: string | undefined;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [price, setPrice] = useState('');
  const [avail, setAvail] = useState<Availability>('in_stock');
  const [active, setActive] = useState(true);
  const [stock, setStock] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const [prevOfferId, setPrevOfferId] = useState(offer?.id);
  if (offer && offer.id !== prevOfferId) {
    setPrevOfferId(offer.id);
    setPrice((offer.priceCents / 100).toFixed(2));
    setAvail(offer.availabilityStatus);
    setActive(offer.active);
    setStock(String(offer.stockQty ?? 0));
    setErr(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!offer) return;
      const cents = lkrToCents(price);
      if (!cents) throw new Error('Enter a valid wholesale price in LKR.');
      const patch: Record<string, unknown> = {};
      if (cents !== offer.priceCents) patch.priceCents = cents;
      if (avail !== offer.availabilityStatus) patch.availabilityStatus = avail;
      if (active !== offer.active) patch.active = active;
      if (Object.keys(patch).length) await api.patch(`/supplier-products/${offer.id}`, patch);
      if (offer.trackInventory) {
        const qty = Number.parseInt(stock, 10);
        if (!Number.isFinite(qty) || qty < 0) throw new Error('Stock must be zero or more.');
        if (qty !== (offer.stockQty ?? 0)) {
          await api.post(`/supplier-products/${offer.id}/stock`, { mode: 'set', quantity: qty, note: 'Quick edit (mobile)' });
        }
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: offersKey(supplierId) });
      toast.success('Listing updated');
      onClose();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const unit = product?.unit ?? 'unit';
  const cents = lkrToCents(price);

  return (
    <Sheet
      visible={!!offer}
      onClose={onClose}
      title="Quick edit"
      subtitle={product?.name ?? 'Listing'}
      scroll
      footer={<Button title="Save listing" size="lg" full loading={save.isPending} onPress={() => save.mutate()} />}
    >
      <View style={{ gap: 16 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label={`Wholesale rate (LKR / ${unit})`} hint={cents ? `${formatLKR(cents)} per ${unit}` : 'Net price before volume tiers'}>
          <Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" prefix="Rs." suffix={`/ ${unit}`} style={{ fontFamily: 'IBMPlexMono_500Medium' }} />
        </Field>
        <Field label="Availability">
          <AvailabilityToggle value={avail} onChange={setAvail} />
        </Field>
        {offer?.trackInventory ? (
          <Field label="On-hand stock" hint={`Reserved ${offer.reservedQty ?? 0} · Free ${offer.availableQty ?? '—'} · Low at ${offer.lowStockThreshold ?? 0}`}>
            <Input value={stock} onChangeText={(t) => setStock(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" suffix={unit} />
          </Field>
        ) : (
          <Row>
            <Text variant="caption" color="ink4">
              Stock counts aren't tracked for this listing. Turn tracking on from Inventory.
            </Text>
          </Row>
        )}
        <ToggleRow
          label={active ? 'Live on marketplace' : 'Hidden from buyers'}
          description="Buyers can only find and order live listings."
          value={active}
          onValueChange={setActive}
          last
        />
      </View>
    </Sheet>
  );
}
