import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatLKR } from '@/lib/format';
import { lifecycleErrorMessage } from '@/lib/orderLifecycle';
import { useOnChange } from '@/lib/useOnChange';
import { Banner, Button, Field, Input, RadioCards, Sheet, useToast } from '@/ui';
import { rupeesToCents } from '@/features/admin/platform/kit';

export type DisputeOutcome = 'refund_business' | 'release_supplier' | 'partial';

export const OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  refund_business: 'Refund buyer',
  release_supplier: 'Release to supplier',
  partial: 'Partial refund',
};

type ResolveResponse = { ok: true; status: 'cancelled' | 'completed' };

/**
 * Arbitration decision for a disputed order (POST /admin/disputes/:poId/resolve).
 * Full refund cancels the order; release and partial settle it as completed.
 */
export function ResolveDisputeSheet({
  target,
  initialOutcome = 'refund_business',
  onClose,
  onResolved,
}: {
  target: { id: string; poNumber?: string | null; totalCents?: number | null } | null;
  initialOutcome?: DisputeOutcome;
  onClose: () => void;
  onResolved?: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<DisputeOutcome>(initialOutcome);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useOnChange(target ? `${target.id}:${initialOutcome}` : null, (key) => {
    if (!key) return;
    setOutcome(initialOutcome);
    setAmount('');
    setNote('');
  });

  const total = target?.totalCents ?? null;
  const amountCents = amount.trim() ? rupeesToCents(amount) : null;
  const amountErr =
    outcome !== 'partial'
      ? null
      : !amountCents || amountCents <= 0
        ? 'Enter the amount to refund to the buyer'
        : total != null && amountCents >= total
          ? `Must be less than the order total (${formatLKR(total)}) — use Refund buyer for a full refund`
          : null;

  const m = useMutation({
    mutationFn: () =>
      api.post<ResolveResponse>(`/admin/disputes/${target!.id}/resolve`, {
        outcome,
        ...(outcome === 'partial' && amountCents ? { amountCents } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (r) => {
      const msg =
        outcome === 'refund_business'
          ? 'Refunded to the buyer; order cancelled.'
          : outcome === 'partial'
            ? `${formatLKR(amountCents)} refunded, remainder released; order ${r.status}.`
            : `Released to the supplier; order ${r.status}.`;
      toast.success('Dispute resolved', msg);
      qc.invalidateQueries({ queryKey: ['admin-disputes'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      if (target) qc.invalidateQueries({ queryKey: ['admin-order', target.id] });
      onResolved?.();
      onClose();
    },
    onError: (e) => toast.error('Resolve failed', lifecycleErrorMessage(e)),
  });

  return (
    <Sheet
      visible={!!target}
      onClose={onClose}
      title="Arbitration decision"
      subtitle={target ? `${target.poNumber ?? target.id.slice(0, 8)}${total != null ? ` · ${formatLKR(total)}` : ''}` : undefined}
      scroll
      footer={
        <>
          <Button title={OUTCOME_LABEL[outcome]} full size="lg" disabled={!!amountErr} loading={m.isPending} onPress={() => m.mutate()} />
          <Button title="Cancel" variant="ghost" full onPress={onClose} />
        </>
      }
    >
      <View style={{ gap: 14 }}>
        <RadioCards<DisputeOutcome>
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'refund_business', label: 'Refund buyer', description: 'Full refund to the purchasing business · order cancelled' },
            { value: 'release_supplier', label: 'Release to supplier', description: 'Pay out the held amount to the merchant · order completed' },
            { value: 'partial', label: 'Partial refund', description: 'Refund part to the buyer, release the rest · order completed' },
          ]}
        />
        {outcome === 'partial' ? (
          <Field label="Refund to buyer (LKR)" required error={amount.trim() ? amountErr : null} hint="The remainder is released to the supplier">
            <Input value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" prefix="Rs" />
          </Field>
        ) : null}
        {m.isError ? <Banner tone="danger" message={lifecycleErrorMessage(m.error)} /> : null}
        <Field label="Arbitration note" hint="Recorded in the audit trail">
          <Input value={note} onChangeText={setNote} multiline maxLength={500} placeholder="GRN short by 2 bags, photo evidence attached…" />
        </Field>
      </View>
    </Sheet>
  );
}
