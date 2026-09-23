import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { lifecycleErrorMessage, requestedQty, type LifecycleItemFields } from '@/lib/orderLifecycle';
import { useOnChange } from '@/lib/useOnChange';
import { colors, fonts, radii } from '@/theme/tokens';
import { Banner, Button, Field, Input, Sheet, Stepper, Switch, Text, useToast } from '@/ui';
import { useInvalidateOrder } from './orderMutations';

export type AcceptItem = {
  id: string;
  productName?: string;
  productNameSnapshot?: string;
  quantity: number;
  unitPriceCents?: number;
  unitPriceCentsSnapshot?: number;
  lineTotalCents?: number;
  totalCents?: number;
} & LifecycleItemFields;

type LineState = { qty: number; unavailable: boolean; reason: string };

type AcceptLine = { itemId: string; quantity: number } | { itemId: string; unavailable: true; reason?: string };

type AcceptResponse = { status: 'accepted'; partial: boolean; totalCents: number; reducedByCents: number };

/** Effective (discount-aware) unit price of a line. */
function unitOf(it: AcceptItem): number {
  const line = it.lineTotalCents ?? it.totalCents;
  if (line != null && it.quantity > 0) return line / it.quantity;
  return it.unitPriceCents ?? it.unitPriceCentsSnapshot ?? 0;
}

/**
 * Supplier acceptance with per-line quantities: reduce a line, or mark it
 * unavailable. Untouched lines are accepted in full. The paid difference is
 * refunded automatically by the API.
 */
export function AcceptOrderSheet({
  visible,
  onClose,
  poId,
  poNumber,
  items,
  totalCents,
}: {
  visible: boolean;
  onClose: () => void;
  poId: string;
  poNumber?: string;
  items: AcceptItem[];
  totalCents: number;
}) {
  const toast = useToast();
  const invalidate = useInvalidateOrder();
  const initial = useMemo(
    () => Object.fromEntries(items.map((it) => [it.id, { qty: requestedQty(it), unavailable: false, reason: '' }])) as Record<string, LineState>,
    [items],
  );
  const [lines, setLines] = useState<Record<string, LineState>>(initial);
  const [note, setNote] = useState('');

  // Reset each time the sheet opens (not on background refetches).
  useOnChange(visible, (open) => {
    if (!open) return;
    setLines(initial);
    setNote('');
  });

  const set = (id: string, patch: Partial<LineState>) => setLines((l) => ({ ...l, [id]: { ...l[id], ...patch } }));

  const reducedBy = items.reduce((sum, it) => {
    const s = lines[it.id];
    if (!s) return sum;
    const kept = s.unavailable ? 0 : s.qty;
    return sum + Math.round(unitOf(it) * (requestedQty(it) - kept));
  }, 0);
  const newTotal = Math.max(0, totalCents - reducedBy);
  const allUnavailable = items.length > 0 && items.every((it) => lines[it.id]?.unavailable || lines[it.id]?.qty === 0);

  const payload: AcceptLine[] = items.flatMap((it): AcceptLine[] => {
    const s = lines[it.id];
    if (!s) return [];
    if (s.unavailable || s.qty === 0) return [{ itemId: it.id, unavailable: true, ...(s.reason.trim() ? { reason: s.reason.trim() } : {}) }];
    if (s.qty < requestedQty(it)) return [{ itemId: it.id, quantity: s.qty }];
    return [];
  });

  const m = useMutation({
    mutationFn: () =>
      api.post<AcceptResponse>(`/purchase-orders/${poId}/accept`, {
        ...(payload.length ? { lines: payload } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async (r) => {
      toast.success(
        r.partial ? 'Order partially accepted' : 'Order accepted',
        r.partial ? `New total ${formatLKR(r.totalCents)} · buyer refunded ${formatLKR(r.reducedByCents)} where paid.` : undefined,
      );
      onClose();
      await invalidate(poId);
    },
    onError: (e) => toast.error('Could not accept', lifecycleErrorMessage(e)),
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Accept ${poNumber ?? 'order'}`}
      subtitle="Reduce quantities or mark lines unavailable if you can't fulfil everything."
      scroll
      footer={
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text variant="overline" color="ink4">
              {reducedBy > 0 ? 'New order total' : 'Order total'}
            </Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="metricSm">{formatLKR(newTotal)}</Text>
              {reducedBy > 0 ? (
                <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: colors.ink5, textDecorationLine: 'line-through' }}>{formatLKR(totalCents)}</Text>
              ) : null}
            </View>
          </View>
          <Button
            title={payload.length ? 'Accept with changes' : 'Accept in full'}
            icon={CheckCircle2}
            variant="volt"
            size="lg"
            full
            disabled={allUnavailable}
            loading={m.isPending}
            onPress={() => m.mutate()}
          />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 12 }}>
        {allUnavailable ? <Banner tone="warning" message="Every line is unavailable — reject the order instead." /> : null}
        {items.map((it) => {
          const s = lines[it.id] ?? { qty: requestedQty(it), unavailable: false, reason: '' };
          const req = requestedQty(it);
          return (
            <View key={it.id} style={{ gap: 10, padding: 14, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.paper }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodySm" weight="semibold" numberOfLines={2}>
                    {it.productName ?? it.productNameSnapshot ?? 'Item'}
                  </Text>
                  <Text variant="caption" color="ink4">
                    Ordered {req} · {formatLKR(Math.round(unitOf(it)))} each
                  </Text>
                </View>
                {s.unavailable ? null : <Stepper value={s.qty} min={0} max={req} size="sm" onChange={(qty) => set(it.id, { qty })} />}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.lineSoft, paddingTop: 10 }}>
                <Text variant="bodySm" color={s.unavailable ? 'rose' : 'ink3'}>
                  Unavailable
                </Text>
                <Switch value={s.unavailable} onValueChange={(v) => set(it.id, { unavailable: v })} />
              </View>
              {s.unavailable ? (
                <Input value={s.reason} onChangeText={(reason) => set(it.id, { reason })} placeholder="Reason (optional) — e.g. out of stock" maxLength={300} />
              ) : null}
            </View>
          );
        })}
        <Field label="Note to buyer (optional)">
          <Input value={note} onChangeText={setNote} placeholder="e.g. Remaining stock arrives next week" maxLength={500} multiline />
        </Field>
      </View>
    </Sheet>
  );
}
