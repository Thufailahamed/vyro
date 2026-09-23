import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Award, GitCompareArrows, MessageCircle, Scale, Send } from 'lucide-react-native';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Input,
  Kicker,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonList,
  StatusBadge,
  Text,
  Timeline,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useBusinessId } from '@/lib/auth';
import { formatDate, formatDateTime, formatLKR, humanize, timeAgo } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { Bubble, Enter, go, Section } from '../orders/kit';
import { useRfqAiSummary, useRfqDetail, useRfqMessages, useRfqQuotes } from './api';

export function RfqDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const businessId = useBusinessId();
  const qc = useQueryClient();
  const toast = useToast();

  const detail = useRfqDetail(id);
  const quotes = useRfqQuotes(id);
  const ai = useRfqAiSummary(id);
  const messages = useRfqMessages(id);
  const [msg, setMsg] = useState('');
  const [awardFor, setAwardFor] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([detail.refetch(), quotes.refetch(), messages.refetch(), ai.refetch()]);

  const sendMsg = useMutation({
    mutationFn: (body: string) => api.post(`/rfqs/${id}/messages`, { message: body }),
    onSuccess: () => {
      setMsg('');
      void qc.invalidateQueries({ queryKey: ['rfq-msgs', id] });
    },
    onError: (e) => toast.error('Message not sent', errorMessage(e)),
  });

  const act = (label: string, fn: () => Promise<unknown>) =>
    toastAction(toast, label, fn, () => { void refresh(); });

  const award = useMutation({
    mutationFn: (quoteId: string) => api.post(`/rfqs/${id}/award`, { quoteId }),
    onSuccess: () => {
      setAwardFor(null);
      toast.success('Quote awarded');
      void refresh();
    },
    onError: (e) => toast.error('Award failed', errorMessage(e)),
  });

  if (detail.isLoading || !id) {
    return (
      <Screen back kicker="RFQ" title="Loading…">
        <Skeleton height={170} radius={16} />
        <SkeletonList rows={3} />
      </Screen>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <Screen back kicker="RFQ" title="Not found">
        <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
      </Screen>
    );
  }

  const { rfq, items, events } = detail.data;
  const quoteList = quotes.data?.quotes ?? [];
  const awardable = ['open', 'quoting', 'quotes_received', 'under_review'].includes(rfq.status);
  const awarded = rfq.status === 'awarded';

  return (
    <Screen
      back
      kicker={`RFQ · ${rfq.rfqNumber}`}
      title={rfq.title}
      subtitle={`${items.length} lines · ${quoteList.length} quotes${rfq.deadline ? ` · closes ${formatDate(rfq.deadline)}` : ''}`}
      onRefresh={refresh}
      right={<StatusBadge status={rfq.status} size="sm" />}
      footer={
        awarded ? (
          <Button
            title="Convert to purchase order"
            iconRight={ArrowRight}
            size="lg"
            full
            onPress={() =>
              act('Purchase order created', async () => {
                const r = await api.post<{ poId: string }>(`/rfqs/${id}/convert`, {});
                go(`/buyer/order/${r.poId}`);
              })
            }
          />
        ) : (
          <Button title="Compare quotes" icon={GitCompareArrows} size="lg" full onPress={() => go(`/buyer/rfqs/${id}/compare`)} />
        )
      }
    >
      {rfq.description ? (
        <Card kind="bone" padding={14}>
          <Text variant="bodySm" color="ink3">{rfq.description}</Text>
        </Card>
      ) : null}

      <Section step={1} kicker="Lines" title={`Requested lines (${items.length})`} sub={rfq.deliveryLocation ?? undefined}>
        {items.map((it, i) => (
          <Enter key={it.id ?? i} i={i}>
            <Card padding={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.volt }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodySm" weight="semibold" numberOfLines={2}>{it.description}</Text>
                <Text variant="caption" color="ink4">
                  {it.quantity} {it.unit}{it.targetPriceCents ? ` · target ${formatLKR(it.targetPriceCents)}` : ''}
                </Text>
              </View>
            </Card>
          </Enter>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {rfq.paymentTerms ? <Kicker>{rfq.paymentTerms}</Kicker> : null}
          {rfq.isOpen ? <Kicker>Open to suppliers</Kicker> : <Kicker>Private invites</Kicker>}
        </View>
      </Section>

      {ai.data?.recommendation ? (
        <Card kind="ink" flow={`rfq-ai-${id}`} padding={16} style={{ gap: 8 }}>
          <Kicker color="volt">AI recommendation</Kicker>
          <Text variant="bodySm" color="paper">{ai.data.recommendation}</Text>
        </Card>
      ) : null}

      <Section
        step={2}
        kicker="Quotes"
        title={`Supplier quotes (${quoteList.length})`}
        sub="Award the best — it converts into a purchase order"
        right={<Button title="Compare" icon={GitCompareArrows} size="sm" variant="secondary" onPress={() => go(`/buyer/rfqs/${id}/compare`)} />}
      >
        {quotes.isLoading ? (
          <Skeleton height={96} radius={12} />
        ) : quotes.isError ? (
          <ErrorState message={errorMessage(quotes.error)} onRetry={() => quotes.refetch()} />
        ) : quoteList.length === 0 ? (
          <EmptyState icon={Scale} compact title="No quotes yet" message="Suppliers have been notified. Quotes land here as they arrive." />
        ) : (
          quoteList.map((q, i) => (
            <Enter key={q.quote.id} i={i}>
              <Card padding={14} style={{ gap: 10, borderColor: rfq.awardedQuoteId === q.quote.id ? colors.mint : undefined, borderWidth: rfq.awardedQuoteId === q.quote.id ? 1.5 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="mono" style={{ fontFamily: fonts.monoMedium }}>{q.quote.quoteNumber}</Text>
                    <Text variant="caption" color="ink4" numberOfLines={1}>
                      {q.quote.supplierName ?? 'Supplier'} · v{q.quote.version ?? 1}
                    </Text>
                  </View>
                  <StatusBadge status={q.quote.status} size="sm" />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <Text variant="caption" color="ink4">
                    {q.items.length} lines{q.quote.estimatedDeliveryDate ? ` · ETA ${formatDate(q.quote.estimatedDeliveryDate)}` : ''}
                  </Text>
                  <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: colors.ink }}>
                    {formatLKR((q.quote.subtotalCents ?? 0) + (q.quote.deliveryFeeCents ?? 0) + (q.quote.taxCents ?? 0) - (q.quote.discountCents ?? 0))}
                  </Text>
                </View>
                {q.quote.paymentTerms ? (
                  <Text variant="caption" color="ink4">Terms: {q.quote.paymentTerms}</Text>
                ) : null}
                {awardable && rfq.awardedQuoteId !== q.quote.id ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Award quote" icon={Award} size="sm" style={{ flex: 1 }} onPress={() => setAwardFor(q.quote.id)} />
                  </View>
                ) : null}
                {rfq.awardedQuoteId === q.quote.id ? (
                  <Text variant="caption" color="ink" weight="semibold">Awarded — convert to PO below.</Text>
                ) : null}
              </Card>
            </Enter>
          ))
        )}
      </Section>

      {events && events.length > 0 ? (
        <Section step={3} kicker="History" title="RFQ timeline" sub={`${events.length} events`}>
          <Timeline
            steps={events.map((e) => ({
              label: humanize(e.action),
              hint: formatDateTime(e.createdAt),
              state: 'done' as const,
            }))}
          />
        </Section>
      ) : null}

      <SectionHeader kicker="Negotiation" title="Thread" />
      <View style={{ gap: 8 }}>
        {messages.data?.messages.map((m) => (
          <Bubble key={m.id} mine={m.senderType === 'business'} meta={timeAgo(m.createdAt)}>
            <Text variant="bodySm" color={m.senderType === 'business' ? 'paper' : 'ink'}>{m.message}</Text>
          </Bubble>
        ))}
        {(messages.data?.messages.length ?? 0) === 0 && !messages.isLoading ? (
          <EmptyState icon={MessageCircle} compact title="No messages" message="Open the negotiation with the first note." />
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Input value={msg} onChangeText={setMsg} placeholder="Write to suppliers…" multiline={false} onSubmitEditing={() => msg.trim() && sendMsg.mutate(msg.trim())} />
          </View>
          <Button title="Send" icon={Send} size="sm" loading={sendMsg.isPending} disabled={!msg.trim()} onPress={() => sendMsg.mutate(msg.trim())} />
        </View>
      </View>

      {rfq.status === 'draft' ? (
        <Button title="Publish RFQ" full onPress={() => act('RFQ published', () => api.post(`/rfqs/${id}/publish`, {}))} />
      ) : null}
      {['open', 'quoting', 'quotes_received', 'under_review'].includes(rfq.status) ? (
        <Button title="Close RFQ" variant="secondary" full onPress={() => act('RFQ closed', () => api.post(`/rfqs/${id}/close`, {}))} />
      ) : null}
      {rfq.status === 'expired' ? (
        <Button title="Reopen RFQ" variant="secondary" full onPress={() => act('RFQ reopened', () => api.post(`/rfqs/${id}/reopen`, {}))} />
      ) : null}

      <ConfirmSheet
        visible={!!awardFor}
        onClose={() => setAwardFor(null)}
        onConfirm={() => awardFor && award.mutate(awardFor)}
        loading={award.isPending}
        title="Award this quote?"
        message="The RFQ closes and the quote converts into a purchase order."
        confirmLabel="Award quote"
      />

      <View style={{ height: 8 }} />
      <Text variant="caption" color="ink5">Workspace {businessId?.slice(0, 8) ?? '—'}</Text>
    </Screen>
  );
}

async function toastAction(
  toast: ReturnType<typeof useToast>,
  label: string,
  fn: () => Promise<unknown>,
  after: () => void,
) {
  try {
    await fn();
    toast.success(label);
    after();
  } catch (e) {
    toast.error(label, errorMessage(e));
  }
}

export function CompareLink({ id }: { id: string }) {
  return <Button title="Compare" onPress={() => go(`/buyer/rfqs/${id}/compare`)} />;
}
