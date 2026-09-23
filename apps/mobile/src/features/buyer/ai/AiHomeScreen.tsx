import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Gauge, LineChart, Package, Sparkles, Store, TrendingDown, type LucideIcon } from 'lucide-react-native';
import { Button, Card, ErrorState, IconTile, InkHero, Kicker, ProgressBar, Screen, SkeletonList, Text, Touchable } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCompactLKR } from '@/lib/format';
import { go } from '../orders/kit';
import { colors, fonts, radii } from '@/theme/tokens';

interface HomePayload {
  reorderDue: { productName: string; lastPurchaseDaysAgo?: number }[];
  savingsTotal: number;
  topMoves: { productName: string; from: number; to: number; pct: number }[];
  monthly: number[];
  concentration: { supplierId: string; supplierName: string; share: number }[];
  healthScore: {
    score: number;
    breakdown: {
      concentration: number;
      priceCompetitiveness: number;
      deliveryReliability: number;
      consistency: number;
      savingsOpportunity: number;
    };
  };
  concentrationRisk: { topSupplierShare: number; label: 'low' | 'moderate' | 'high'; alternativeCount: number };
}

function greetingForHour(h: number): string {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function healthHeadline(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'healthy';
  if (score >= 40) return 'needs attention';
  return 'at risk';
}

/** VYRO AI home — proactive procurement intelligence (`/api/ai/home`). */
export function AiHomeScreen() {
  const { business } = useAuth();
  const q = useQuery({
    queryKey: ['ai-home'],
    queryFn: () => api.get<HomePayload>('/ai/home'),
    staleTime: 60_000,
  });
  const d = q.data;

  return (
    <Screen
      kicker="VYRO AI"
      title={`${greetingForHour(new Date().getHours())} — here's what VYRO found.`}
      subtitle={`Procurement intelligence for ${business?.businessName ?? 'your business'}.`}
      back
      onRefresh={() => q.refetch()}
    >
      {q.isLoading ? (
        <>
          <Button title="Ask VYRO" icon={Sparkles} variant="primary" full onPress={() => go('/buyer/ask')} />
          <SkeletonList rows={3} height={110} />
        </>
      ) : q.isError ? (
        <>
          <Button title="Ask VYRO" icon={Sparkles} variant="primary" full onPress={() => go('/buyer/ask')} />
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </>
      ) : d ? (
        <View style={{ gap: 14 }}>
          <InkHero seed="ai-home" style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ gap: 4 }}>
                <Kicker color="volt">Procurement health</Kicker>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  <Text variant="metric" color="paper" style={{ fontSize: 44, lineHeight: 46 }}>
                    {d.healthScore.score}
                  </Text>
                  <Text variant="caption" color="paperMuted">
                    / 100 · {healthHeadline(d.healthScore.score)}
                  </Text>
                </View>
              </View>
              <IconTile icon={Gauge} tone="glass" size={44} />
            </View>
            <View style={{ gap: 9 }}>
              {Object.entries(d.healthScore.breakdown).map(([k, v]) => (
                <View key={k} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" color="paperMuted" style={{ textTransform: 'capitalize' }}>
                      {k.replace(/([A-Z])/g, ' $1').trim()}
                    </Text>
                    <Text variant="caption" color="paper" style={{ fontFamily: fonts.monoMedium }}>
                      {v}
                    </Text>
                  </View>
                  <ProgressBar value={v} max={20} tone="volt" height={5} track={colors.paperLine} />
                </View>
              ))}
            </View>
            <Button title="Ask VYRO" icon={Sparkles} variant="volt" full onPress={() => go('/buyer/ask')} />
          </InkHero>

          <Card kind={d.savingsTotal > 0 ? 'volt' : 'flat'} onPress={() => go('/buyer/ask')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconTile icon={TrendingDown} tone={d.savingsTotal > 0 ? 'ink' : 'success'} size={46} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="overline" color={d.savingsTotal > 0 ? 'ink3' : 'ink4'}>
                Potential savings
              </Text>
              <Text variant="h2">{d.savingsTotal > 0 ? `${formatCompactLKR(d.savingsTotal)} in cheaper live quotes` : 'No obvious savings right now'}</Text>
              <Text variant="caption" weight="semibold" color={d.savingsTotal > 0 ? 'ink2' : 'copper'}>
                Explore savings
              </Text>
            </View>
            <ChevronRight size={18} color={colors.ink3} />
          </Card>

          <Card style={{ gap: 12 }}>
            <InsightHead icon={LineChart} label="Price moves" />
            {d.topMoves.length ? (
              <View>
                {d.topMoves.slice(0, 3).map((m, i) => (
                  <View
                    key={i}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 10,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                      borderTopColor: colors.lineSoft,
                    }}
                  >
                    <Text variant="bodySm" weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                      {m.productName}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 9,
                        height: 24,
                        borderRadius: radii.pill,
                        justifyContent: 'center',
                        backgroundColor: m.pct >= 0 ? colors.roseSoft : colors.mintSoft,
                      }}
                    >
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, color: m.pct >= 0 ? colors.rose : colors.mint }}>
                        {m.pct >= 0 ? '+' : ''}
                        {m.pct}%
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="bodySm" color="ink4">
                Prices are stable on your usual items.
              </Text>
            )}
          </Card>

          <Card style={{ gap: 10 }}>
            <InsightHead icon={Store} label="Supplier concentration" />
            <Text variant="h2" style={{ textTransform: 'capitalize' }}>
              {d.concentrationRisk.label}
            </Text>
            <Text variant="bodySm" color="ink3">
              {d.concentration.length
                ? `${d.concentration[0]!.supplierName}: ${Math.round(d.concentration[0]!.share * 100)}% of spend · ${d.concentrationRisk.alternativeCount} alternatives`
                : 'No concentration signal yet.'}
            </Text>
          </Card>

          {d.reorderDue.length ? (
            <Card style={{ gap: 10 }}>
              <InsightHead icon={Package} label="Reorder due" />
              <View>
                {d.reorderDue.slice(0, 4).map((r, i) => (
                  <Touchable
                    key={i}
                    onPress={() => go('/buyer/ask')}
                    scaleTo={0.985}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 10,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                      borderTopColor: colors.lineSoft,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text variant="bodySm" weight="medium" numberOfLines={1}>
                        {r.productName}
                      </Text>
                      {r.lastPurchaseDaysAgo != null ? (
                        <Text variant="caption" color="ink4">
                          Last bought {r.lastPurchaseDaysAgo}d ago
                        </Text>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color={colors.ink5} />
                  </Touchable>
                ))}
              </View>
            </Card>
          ) : null}
        </View>
      ) : (
        <Button title="Ask VYRO" icon={Sparkles} variant="primary" full onPress={() => go('/buyer/ask')} />
      )}
    </Screen>
  );
}

function InsightHead({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile icon={icon} tone="paper" size={34} />
      <Text variant="overline" color="ink4">
        {label}
      </Text>
    </View>
  );
}
