import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert, FileText, Send } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import { formatDate, formatLKR } from '@/lib/format';
import { colors } from '@/theme/tokens';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValue,
  Screen,
  SkeletonList,
  Text,
  useToast,
} from '@/ui';
import { RfqPill } from '@/features/supplier/ops/kit';

type RfqItem = { id: string; description: string; quantity: number; unit: string; targetPriceCents?: number | null };
type Quote = { quote: { id: string; status: string; totalCents: number; quoteNumber: string } };

export function SupplierQuoteDetailScreen() {
  const { rfqId } = useLocalSearchParams<{ rfqId: string }>();
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const id = typeof rfqId === 'string' ? rfqId : undefined;

  const detail = useQuery({
    queryKey: ['sup-rfq', id],
    queryFn: () =>
      api.post<{ rfq: { id: string; rfqNumber: string; title: string; status: string; deadline: number | null }; items: RfqItem[] }>(
        '/rfqs/supplier/view',
        { rfqId: id, supplierId },
      ),
    enabled: !!id && !!supplierId,
  });
  const mine = useQuery({
    queryKey: ['sup-quotes', id, supplierId],
    queryFn: () => api.get<{ quotes: Quote[] }>(`/rfqs/${id}/quotes${qs({ supplierId })}`),
    enabled: !!id && !!supplierId,
  });

  const [prices, setPrices] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [now] = useState(() => Date.now());

  const submit = useMutation({
    mutationFn: () => {
      const items = (detail.data?.items ?? []).map((it) => ({
        rfqItemId: it.id,
        unitPriceCents: Math.round(Number(prices[it.id] ?? 0) * 100),
        quantity: it.quantity,
      }));
      return api.post(`/rfqs/${id}/quote${qs({ supplierId })}`, { items, message: msg || undefined });
    },
    onSuccess: () => {
      toast.success('Quote submitted');
      setPrices({});
      setMsg('');
      void qc.invalidateQueries({ queryKey: ['sup-quotes', id, supplierId] });
      void qc.invalidateQueries({ queryKey: ['supplier', supplierId, 'rfqs'] });
    },
    onError: (e) => toast.error('Could not submit quote', errorMessage(e)),
  });

  if (detail.isLoading)
    return (
      <Screen back kicker="Quotations" title="Quote request">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (detail.isError)
    return (
      <Screen back kicker="Quotations" title="Quote request" onRefresh={() => detail.refetch()}>
        <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
      </Screen>
    );
  if (!detail.data)
    return (
      <Screen back kicker="Quotations" title="Quote request">
        <EmptyState icon={FileText} title="RFQ not found" message="This request may have been withdrawn." />
      </Screen>
    );

  const rfq = detail.data.rfq;
  const items = detail.data.items;
  const myQuotes = mine.data?.quotes ?? [];

  const closed = ['draft', 'awarded', 'converted_to_order', 'cancelled', 'closed', 'expired'].includes(rfq.status.toLowerCase());
  const deadlinePassed = rfq.deadline != null && rfq.deadline < now;
  const quotable = !closed && !deadlinePassed && items.length > 0;
  const closedReason = closed
    ? `This RFQ is ${rfq.status.replace(/_/g, ' ')} — quoting is closed.`
    : deadlinePassed
      ? 'The submission deadline has passed — quoting is closed.'
      : 'This RFQ has no line items to price.';
  const allPriced = items.every((it) => Number(prices[it.id] ?? 0) > 0);

  return (
    <Screen
      back
      onRefresh={() => Promise.all([detail.refetch(), mine.refetch()])}
      kicker="Quotations"
      title={rfq.title}
      subtitle={`${rfq.rfqNumber}${rfq.deadline ? ` · Due ${formatDate(rfq.deadline)}` : ''}`}
      footer={
        quotable ? (
          <Button
            title={submit.isPending ? 'Submitting…' : 'Submit quote'}
            icon={Send}
            full
            loading={submit.isPending}
            disabled={!allPriced}
            onPress={() => submit.mutate()}
          />
        ) : undefined
      }
    >
      <RfqPill status={rfq.status} />
      {!quotable ? (
        <Card kind="flat" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.amberSoft, borderColor: 'rgba(196,132,58,0.3)' }}>
          <CircleAlert size={17} color={colors.amber} />
          <Text variant="bodySm" weight="medium" color="ink2" style={{ flex: 1 }}>
            {closedReason}
          </Text>
        </Card>
      ) : null}
      {myQuotes.length ? (
        <Card kind="flat">
          <Text variant="h2">My quotes</Text>
          {myQuotes.map((qq, i) => (
            <KeyValue key={qq.quote.id ?? i} label={qq.quote.quoteNumber} value={formatLKR(qq.quote.totalCents)} mono />
          ))}
        </Card>
      ) : null}
      <Card kind="flat" style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="h2">Line items</Text>
          {quotable ? (
            <Text variant="caption" color={allPriced ? 'mint' : 'ink4'}>
              {allPriced ? 'Ready to submit' : 'Price every line to submit'}
            </Text>
          ) : null}
        </View>
        {items.map((it) => (
          <View key={it.id} style={{ gap: 6 }}>
            <Text variant="body" weight="medium">
              {it.description}
            </Text>
            <Text variant="caption" color="ink4">
              Qty {it.quantity} {it.unit}
              {it.targetPriceCents ? ` · Target ${formatLKR(it.targetPriceCents)}` : ''}
            </Text>
            <Field label={`Unit price (LKR) — ${it.unit}`}>
              <Input
                value={prices[it.id] ?? ''}
                onChangeText={(v) => setPrices((p) => ({ ...p, [it.id]: v }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </Field>
          </View>
        ))}
      </Card>
      <Card kind="flat">
        <Field label="Message to buyer (optional)">
          <Input value={msg} onChangeText={setMsg} placeholder="Lead time, packaging, delivery…" multiline />
        </Field>
      </Card>
    </Screen>
  );
}
