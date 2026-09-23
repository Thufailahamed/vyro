import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, MapPin, Plus, Scale, Trash2, Users } from 'lucide-react-native';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Kicker,
  Screen,
  SectionHeader,
  Select,
  Steps,
  Text,
  ToggleRow,
  useToast,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { colors } from '@/theme/tokens';
import { Enter, go, Section } from '../orders/kit';

interface RfqItemDraft {
  description: string;
  quantity: string;
  unit: string;
  targetPrice: string;
  specifications: string;
}

const UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'box', 'crate', 'bag', 'ton', 'm'];
const DEADLINES = [
  { value: '1', label: 'Tomorrow', hint: 'Urgent' },
  { value: '3', label: '3 days', hint: 'Standard' },
  { value: '7', label: '7 days', hint: 'Negotiated' },
  { value: '14', label: '14 days', hint: 'Strategic' },
];

const blankItem = (): RfqItemDraft => ({ description: '', quantity: '500', unit: 'kg', targetPrice: '', specifications: '' });

export function RfqCreateScreen() {
  const businessId = useBusinessId();
  const params = useLocalSearchParams<{ fromCart?: string }>();
  const fromCart = params.fromCart === '1';
  const qc = useQueryClient();
  const toast = useToast();

  const [title, setTitle] = useState(fromCart ? 'Bulk quote for active cart' : '');
  const [description, setDescription] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deadlineDays, setDeadlineDays] = useState('7');
  const [items, setItems] = useState<RfqItemDraft[]>([blankItem()]);
  const [supplierIds, setSupplierIds] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const cartQ = useQuery({
    queryKey: ['cart', businessId],
    queryFn: () => api.get<{ items: { id: string; product: { id: string; name: string; unit?: string | null }; quantity: number }[] }>('/cart' + qs({ businessId })),
    enabled: fromCart && !!businessId,
  });

  const [formStartedAt] = useState(() => Date.now());
  const deadline = useMemo(() => formStartedAt + Math.max(1, Number(deadlineDays) || 7) * 86_400_000, [formStartedAt, deadlineDays]);
  const validCount = items.filter((i) => i.description.trim() && Number(i.quantity) > 0).length;
  const stepIdx = !title.trim() ? 0 : validCount === 0 ? 1 : !deliveryLocation.trim() && !paymentTerms.trim() ? 2 : 3;

  const create = useMutation({
    mutationFn: async (publish: boolean) => {
      if (!businessId) throw new Error('No business context');
      const suppliers = supplierIds.split(',').map((s) => s.trim()).filter(Boolean);
      let out: { id: string };
      if (fromCart) {
        out = await api.post<{ id: string }>('/rfqs/from-cart', { businessId, title: title.trim(), deadline, supplierIds: suppliers });
      } else {
        out = await api.post<{ id: string }>('/rfqs', {
          businessId,
          title: title.trim(),
          description: description.trim() || undefined,
          deliveryLocation: deliveryLocation.trim() || undefined,
          paymentTerms: paymentTerms.trim() || undefined,
          deadline,
          isOpen,
          supplierIds: suppliers,
          items: items
            .filter((i) => i.description.trim() && Number(i.quantity) > 0)
            .map((i) => ({
              description: i.description.trim(),
              quantity: Number(i.quantity),
              unit: i.unit || 'kg',
              targetPriceCents: i.targetPrice ? Math.round(Number(i.targetPrice) * 100) : undefined,
              specifications: i.specifications.trim() || undefined,
            })),
        });
      }
      if (publish) await api.post(`/rfqs/${out.id}/publish`, {});
      return out;
    },
    onSuccess: (out, publish) => {
      void qc.invalidateQueries({ queryKey: ['rfqs'] });
      toast.success(publish ? 'RFQ published — suppliers notified' : 'RFQ draft created');
      go(`/buyer/rfqs/${out.id}`);
    },
    onError: (e) => toast.error('Could not create RFQ', errorMessage(e)),
  });

  const updateItem = (i: number, patch: Partial<RfqItemDraft>) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = (publish: boolean) => {
    if (!businessId) return toast.error('No business context', 'Register a buyer business first.');
    if (!title.trim()) return toast.error('Title required', 'Give this RFQ a headline suppliers will see.');
    if (!fromCart && validCount === 0) return toast.error('Add at least one item', 'Describe what you need quoted.');
    create.mutate(publish);
  };

  return (
    <Screen
      back
      kicker="Bulk procurement"
      title={fromCart ? 'Quote this cart' : 'Create RFQ'}
      subtitle={fromCart ? 'Your cart becomes the RFQ — pick suppliers, set a deadline, publish.' : 'Specify products, delivery and deadline. Suppliers respond with quotes.'}
      onRefresh={() => (fromCart ? cartQ.refetch() : Promise.resolve())}
      footer={
        <>
          <Button title={fromCart ? 'Request quotes' : 'Publish & invite'} size="lg" full loading={create.isPending} disabled={!title.trim() || (!fromCart && validCount === 0)} onPress={() => submit(true)} />
          <Button title="Save draft" variant="secondary" full loading={create.isPending} onPress={() => submit(false)} />
        </>
      }
    >
      <Steps steps={['Define', 'Items', 'Logistics', 'Invite']} current={stepIdx} />

      <Section step={1} kicker="Define" title="Title & brief" sub="The headline suppliers see first">
        <Field label="RFQ title" required>
          <Input value={title} onChangeText={setTitle} placeholder="e.g. Monthly restaurant supplies — 1000kg rice" />
        </Field>
        <Field label="Requirements" hint="Quality, packaging, certifications, delivery window…">
          <Input value={description} onChangeText={setDescription} placeholder="Halal, mill dates, bag sizes…" multiline />
        </Field>
      </Section>

      {fromCart ? (
        <Section step={2} kicker="Items" title="Items from your cart" sub="Locked in from the active cart">
          {(cartQ.data?.items ?? []).map((c, i) => (
            <Enter key={c.id} i={i}>
              <Card padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 11, color: colors.volt }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={1}>{c.product.name}</Text>
                  <Text variant="caption" color="ink4">{c.quantity} {c.product.unit ?? 'units'}</Text>
                </View>
              </Card>
            </Enter>
          ))}
          {cartQ.isLoading ? <Text variant="caption" color="ink4">Loading cart…</Text> : null}
          {!cartQ.isLoading && (cartQ.data?.items?.length ?? 0) === 0 ? (
            <Banner tone="warning" title="Cart is empty" message="Add lines to the cart first, then request quotes." />
          ) : null}
        </Section>
      ) : (
        <Section
          step={2}
          kicker="Items"
          title="Line items"
          sub={`${validCount} of ${items.length} valid`}
          right={<Button title="Add" icon={Plus} size="sm" variant="secondary" onPress={() => setItems((p) => [...p, blankItem()])} />}
        >
          {items.map((it, i) => (
            <Card key={i} kind="bone" padding={12} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Kicker>Line {i + 1}</Kicker>
                <Button title="Remove" icon={Trash2} size="sm" variant="ghost" disabled={items.length === 1} onPress={() => setItems((p) => p.filter((_, j) => j !== i))} />
              </View>
              <Field label="Product" required>
                <Input value={it.description} onChangeText={(v) => updateItem(i, { description: v })} placeholder="e.g. Keeri Samba rice, 50kg bag" />
              </Field>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="Qty" required style={{ flex: 1 }}>
                  <Input value={it.quantity} onChangeText={(v) => updateItem(i, { quantity: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
                </Field>
                <Field label="Unit" style={{ flex: 1 }}>
                  <Select value={it.unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={(v) => updateItem(i, { unit: v })} />
                </Field>
                <Field label="Target Rs" style={{ flex: 1 }}>
                  <Input value={it.targetPrice} onChangeText={(v) => updateItem(i, { targetPrice: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="—" />
                </Field>
              </View>
              <Field label="Specs">
                <Input value={it.specifications} onChangeText={(v) => updateItem(i, { specifications: v })} placeholder="Grade, origin, packaging…" />
              </Field>
            </Card>
          ))}
        </Section>
      )}

      <Section step={3} kicker="Logistics" title="Delivery & payment" sub="Helps suppliers quote accurate freight">
        <Field label="Delivery location" hint="Receiving dock or warehouse">
          <Input icon={MapPin} value={deliveryLocation} onChangeText={setDeliveryLocation} placeholder="No. 42, Galle Road, Colombo 03" />
        </Field>
        <Field label="Payment terms" hint="e.g. Net 14, PayHere on delivery">
          <Input icon={Scale} value={paymentTerms} onChangeText={setPaymentTerms} placeholder="Net 14" />
        </Field>
        <Field label="Quotation deadline" hint={`Closes ${formatDateTime(deadline)}`}>
          <Select value={deadlineDays} options={DEADLINES} onChange={setDeadlineDays} title="Deadline" />
        </Field>
      </Section>

      <Section step={4} kicker="Invite" title="Visibility & suppliers" sub="Who can quote on this RFQ">
        <ToggleRow
          label="Open to qualified suppliers"
          description="Verified suppliers in matching categories can discover and quote."
          value={isOpen}
          onValueChange={setIsOpen}
        />
        <Field label="Direct supplier invites" hint="Supplier IDs, comma-separated — optional">
          <Input icon={Users} value={supplierIds} onChangeText={setSupplierIds} placeholder="Paste IDs or invite after creating" autoCapitalize="none" />
        </Field>
        <Field label="Calendar" hint="Suppliers are notified on publish">
          <Input icon={CalendarClock} value={formatDateTime(deadline)} editable={false} />
        </Field>
      </Section>

      <SectionHeader kicker="How it works" title="Publish → negotiate → award" />
      <Card kind="bone" padding={14} style={{ gap: 8 }}>
        <Text variant="bodySm" color="ink3">Quotes are versioned. Counter-offers create new versions — award the best and convert it into a purchase order automatically.</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Checkbox checked={isOpen} onChange={setIsOpen} label="Keep RFQ open after publish" />
        </View>
      </Card>
    </Screen>
  );
}
