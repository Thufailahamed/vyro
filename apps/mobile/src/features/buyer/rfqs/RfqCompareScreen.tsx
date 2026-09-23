import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Award, Trophy, Truck } from 'lucide-react-native';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  InkHero,
  Kicker,
  Screen,
  SectionHeader,
  Skeleton,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatLKR, humanize } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { Enter, go } from '../orders/kit';
import { useRfqAiSummary, useRfqCompare } from './api';

export function RfqCompareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const compare = useRfqCompare(id);
  const ai = useRfqAiSummary(id);

  const refresh = () => Promise.all([compare.refetch(), ai.refetch()]);

  const award = async (quoteId: string) => {
    try {
      await api.post(`/rfqs/${id}/award`, { quoteId });
      toast.success('Quote awarded');
      void refresh();
      go(`/buyer/rfqs/${id}`);
    } catch (e) {
      toast.error('Award failed', errorMessage(e));
    }
  };

  if (compare.isLoading || !id) {
    return (
      <Screen back kicker="RFQ · Compare" title="Composing comparison…">
        <Skeleton height={200} radius={16} />
        <Skeleton height={120} radius={12} />
        <Skeleton height={120} radius={12} />
      </Screen>
    );
  }
  if (compare.isError || !compare.data) {
    return (
      <Screen back kicker="RFQ · Compare" title="Comparison">
        <ErrorState message={errorMessage(compare.error)} onRetry={() => compare.refetch()} />
      </Screen>
    );
  }

  const d = compare.data;
  const best = d.quotes.find((q) => q.quote.id === d.bestPriceQuoteId);
  const fastest = d.quotes.find((q) => q.quote.id === d.fastestQuoteId);

  return (
    <Screen
      back
      kicker={`Compare · ${d.rfq.rfqNumber}`}
      title={d.rfq.title}
      subtitle="Every total is landed cost — subtotal + delivery + tax − discounts."
      onRefresh={refresh}
    >
      <Enter i={0}>
        <InkHero seed={`compare-${id}`}>
          <Kicker color="volt">Best landed cost</Kicker>
          {best ? (
            <>
              <Text variant="h1" color="paper" style={{ marginTop: 8 }} numberOfLines={2}>
                {best.supplier?.name ?? 'Best quote'}
              </Text>
              <Text variant="metricSm" color="volt" style={{ marginTop: 6 }}>
                {formatLKR(best.landedCents)}
              </Text>
              <Text variant="caption" color="paperMuted" style={{ marginTop: 4 }}>
                {ai.data?.recommendation ?? `${best.quote.quoteNumber} · lowest verified landed total.`}
              </Text>
            </>
          ) : (
            <Text variant="bodySm" color="paperMuted" style={{ marginTop: 8 }}>
              No complete valid quotes yet — invite more suppliers or await submissions.
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {fastest && fastest.quote.id !== best?.quote.id ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(250,247,240,0.08)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Truck size={12} color={colors.volt} />
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11, color: colors.paper }}>
                  Fastest · {fastest.supplier?.name ?? fastest.quote.quoteNumber}
                </Text>
              </View>
            ) : null}
          </View>
        </InkHero>
      </Enter>

      {d.splitOptimization.supplierCount > 1 ? (
        <Card kind="volt" padding={14} style={{ gap: 4 }}>
          <Kicker>Split optimisation</Kicker>
          <Text variant="h3">
            {formatLKR(d.splitOptimization.splitLandedEstimateCents)} across {d.splitOptimization.supplierCount} suppliers
          </Text>
          <Text variant="caption" color="ink3">
            Best per-item mix saves vs any single quote. Award per line from the detail screen.
          </Text>
        </Card>
      ) : null}

      <SectionHeader kicker="Quotes" title={`Side by side (${d.quotes.length})`} />
      {d.quotes.length === 0 ? (
        <EmptyState icon={Trophy} title="No quotes to compare" message="Quotes appear here once suppliers respond." />
      ) : (
        d.quotes.map((q, i) => {
          const isBest = q.quote.id === d.bestPriceQuoteId;
          const isFastest = q.quote.id === d.fastestQuoteId;
          return (
            <Enter key={q.quote.id} i={i + 1}>
              <Card
                padding={16}
                style={{ gap: 12, borderColor: isBest ? colors.mint : undefined, borderWidth: isBest ? 1.5 : 1 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {isBest ? <Trophy size={14} color={colors.mint} /> : null}
                      <Text variant="h3" numberOfLines={1} style={{ flex: 1 }}>
                        {q.supplier?.name ?? 'Supplier'}
                      </Text>
                    </View>
                    <Text variant="caption" color="ink4" style={{ fontFamily: fonts.monoMedium }}>
                      {q.quote.quoteNumber} · {humanize(q.quote.status)}
                    </Text>
                  </View>
                  <StatusBadge status={q.valid ? (q.isPartial ? 'partial' : 'valid') : 'invalid'} size="sm" />
                </View>

                <View style={{ gap: 0 }}>
                  <CompareLine label="Subtotal" value={q.quote.subtotalCents} />
                  <CompareLine label="Delivery" value={q.quote.deliveryFeeCents} />
                  <CompareLine label="Tax" value={q.quote.taxCents} />
                  <CompareLine label="Discount" value={-(q.quote.discountCents ?? 0)} accent />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, marginTop: 10, borderTopWidth: 1.5, borderTopColor: colors.line }}>
                    <Text variant="overline" color="ink4">Landed total</Text>
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 19, color: isBest ? colors.mint : colors.ink }}>
                      {formatLKR(q.landedCents)}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Text variant="caption" color="ink4">Coverage {q.coverage}</Text>
                  {q.quote.paymentTerms ? <Text variant="caption" color="ink4">· {q.quote.paymentTerms}</Text> : null}
                  {q.quote.estimatedDeliveryDate ? <Text variant="caption" color="ink4">· ETA {formatDate(q.quote.estimatedDeliveryDate)}</Text> : null}
                  {isFastest ? <Text variant="caption" color="copper" weight="semibold">· Fastest</Text> : null}
                </View>

                <Button title={isBest ? 'Award best quote' : 'Award this quote'} icon={Award} size="sm" variant={isBest ? 'primary' : 'secondary'} onPress={() => award(q.quote.id)} />
              </Card>
            </Enter>
          );
        })
      )}
    </Screen>
  );
}

function CompareLine({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text variant="bodySm" color="ink4">{label}</Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 13, color: accent ? colors.mint : colors.ink3 }}>
        {value < 0 ? `−${formatLKR(-value)}` : formatLKR(value)}
      </Text>
    </View>
  );
}
