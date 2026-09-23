import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Gauge, LineChart, Package, Sparkles, Store, TrendingDown } from 'lucide-react-native';
import { Button, Card, ErrorState, ProgressBar, Screen, SkeletonList, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCompactLKR } from '@/lib/format';
import { go } from '../orders/kit';
import { colors } from '@/theme/tokens';

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
      <Button title="Ask VYRO" icon={Sparkles} variant="primary" full onPress={() => go('/buyer/ask')} />

      {q.isLoading ? (
        <SkeletonList rows={3} height={110} />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : d ? (
        <View style={{ gap: 12 }}>
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TrendingDown size={16} color={colors.mint} />
              <Text variant="overline" color="ink4">
                Potential savings
              </Text>
            </View>
            <Text variant="h2">{d.savingsTotal > 0 ? `${formatCompactLKR(d.savingsTotal)} in cheaper live quotes` : 'No obvious savings right now'}</Text>
            <Text variant="caption" color="copper" onPress={() => go('/buyer/ask')} style={{ textDecorationLine: 'underline' }}>
              Explore savings →
            </Text>
          </Card>

          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LineChart size={16} color={colors.copper} />
              <Text variant="overline" color="ink4">
                Price moves
              </Text>
            </View>
            {d.topMoves.length ? (
              <>
                {d.topMoves.slice(0, 3).map((m, i) => (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Text variant="bodySm" style={{ flex: 1 }} numberOfLines={1}>
                      {m.productName}
                    </Text>
                    <Text variant="caption" style={{ color: m.pct >= 0 ? colors.rose : colors.mint }}>
                      {m.pct >= 0 ? '+' : ''}
                      {m.pct}%
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text variant="bodySm" color="ink4">
                Prices are stable on your usual items.
              </Text>
            )}
          </Card>

          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Store size={16} color={colors.copper} />
              <Text variant="overline" color="ink4">
                Supplier concentration
              </Text>
            </View>
            <Text variant="h2" style={{ textTransform: 'capitalize' }}>
              {d.concentrationRisk.label}
            </Text>
            <Text variant="bodySm" color="ink3">
              {d.concentration.length
                ? `${d.concentration[0]!.supplierName}: ${Math.round(d.concentration[0]!.share * 100)}% of spend · ${d.concentrationRisk.alternativeCount} alternatives`
                : 'No concentration signal yet.'}
            </Text>
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Gauge size={16} color={colors.copper} />
              <Text variant="overline" color="ink4">
                Procurement health
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text variant="metric">{d.healthScore.score}</Text>
              <Text variant="caption" color="ink4">
                / 100 · {healthHeadline(d.healthScore.score)}
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {Object.entries(d.healthScore.breakdown).map(([k, v]) => (
                <View key={k} style={{ gap: 3 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="caption" color="ink4" style={{ textTransform: 'capitalize' }}>
                      {k.replace(/([A-Z])/g, ' $1').trim()}
                    </Text>
                    <Text variant="caption" color="ink3">
                      {v}
                    </Text>
                  </View>
                  <ProgressBar value={v} max={20} tone="volt" height={4} />
                </View>
              ))}
            </View>
          </Card>

          {d.reorderDue.length ? (
            <Card style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Package size={16} color={colors.copper} />
                <Text variant="overline" color="ink4">
                  Reorder due
                </Text>
              </View>
              {d.reorderDue.slice(0, 4).map((r, i) => (
                <Text key={i} variant="bodySm" color="ink3">
                  {r.productName}
                  {r.lastPurchaseDaysAgo != null ? ` — last bought ${r.lastPurchaseDaysAgo}d ago` : ''}
                </Text>
              ))}
            </Card>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

