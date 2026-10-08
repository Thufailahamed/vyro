import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Activity, Cpu, Sparkles, Timer } from 'lucide-react-native';
import { Card, EmptyState, ErrorState, Gutter, IconTile, InkHero, ListHeader, ListScreen, RankBars, ScreenHeader, Segmented, SkeletonList, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section } from '../../buyer/orders/kit';
import { GlassStats, HeroFigure, HeroTopline } from '@/features/admin/ops/kit';

type UsageRow = { intent?: string; requests?: number; tokens?: number; costUsd?: number };
type ProviderRow = { provider?: string; requests?: number; share?: number };
type ErrorRow = { code?: string; count?: number };
type UsageResponse = {
  totalRequests: number;
  failedRequests: number;
  failureRate: number;
  avgLatencyMs: number;
  p95LatencyMs?: number;
  tokensIn: number;
  tokensOut: number;
  costEstimateUsd: number;
  byIntent: UsageRow[];
  byProvider: ProviderRow[];
  byError: ErrorRow[];
};

const RANGES = [
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
];

/** /admin/ai-usage — token consumption, latency and cost telemetry. */
export function AiUsageScreen() {
  const [days, setDays] = useState('7');
  const q = useQuery({
    queryKey: ['admin-ai-usage', days],
    queryFn: async () => {
      try {
        return await api.get<UsageResponse>(`/admin/ai/usage?days=${days}`);
      } catch {
        return await api.get<UsageResponse>(`/ai/admin/usage?days=${days}`);
      }
    },
  });
  const d = q.data;
  const totalTokens = useMemo(() => (d ? (d.tokensIn ?? 0) + (d.tokensOut ?? 0) : 0), [d]);

    return (
    <ListScreen
      data={d?.byIntent ?? []}
      keyExtractor={(r, i) => `${r.intent ?? 'intent'}-${i}`}
      onRefresh={() => q.refetch()}
      header={
        <ListHeader>
          <ScreenHeader back kicker="AI platform & inference" title="AI telemetry" subtitle="Token consumption, latency, provider routing and model economics." />
          <Gutter style={{ gap: 14 }}>
            <Segmented options={RANGES} value={days} onChange={setDays} />
            {q.isLoading ? (
              <SkeletonList rows={2} height={90} />
            ) : q.isError ? (
              <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
            ) : d ? (
              <>
                <InkHero seed={`ai-usage-${days}`} style={{ padding: 18 }}>
                  <HeroTopline
                    icon={Sparkles}
                    label="Estimated spend"
                    status={(d.failureRate ?? 0) > 0.05 ? `${((d.failureRate ?? 0) * 100).toFixed(1)}% failing` : 'Healthy'}
                    statusTone={(d.failureRate ?? 0) > 0.05 ? 'danger' : 'ok'}
                  />
                  <HeroFigure value={`$${(d.costEstimateUsd ?? 0).toFixed(2)}`} caption={`${totalTokens.toLocaleString()} tokens across ${d.totalRequests ?? 0} requests`} />
                  <GlassStats
                    items={[
                      { label: 'Requests', value: d.totalRequests ?? 0, hint: `${d.failedRequests ?? 0} failed` },
                      { label: 'Failure rate', value: `${((d.failureRate ?? 0) * 100).toFixed(1)}%`, warn: (d.failureRate ?? 0) > 0.05 },
                      { label: 'Avg latency', value: `${Math.round(d.avgLatencyMs ?? 0)}ms`, hint: d.p95LatencyMs ? `p95 ${Math.round(d.p95LatencyMs)}ms` : undefined },
                      { label: 'Tokens', value: totalTokens.toLocaleString(), hint: `${(d.tokensIn ?? 0).toLocaleString()} in` },
                    ]}
                  />
                </InkHero>
                {d.byProvider?.length ? (
                  <Section kicker="Routing" title="Providers" icon={Sparkles}>
                    <RankBars data={d.byProvider.map((p) => ({ label: p.provider ?? '—', value: p.requests ?? 0 }))} formatValue={(v) => `${Math.round(v)} req`} />
                  </Section>
                ) : null}
                {d.byError?.length ? (
                  <Section kicker="Failures" title="Top errors" icon={Activity}>
                    {d.byError.slice(0, 6).map((e, i) => (
                      <View key={e.code ?? `error-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: i ? 10 : 0, borderTopWidth: i ? StyleSheet.hairlineWidth * 2 : 0, borderTopColor: colors.lineSoft }}>
                        <Text variant="caption" color="ink3" numberOfLines={1} style={{ flex: 1 }}>
                          {e.code ?? 'unknown'}
                        </Text>
                        <MonoTag label={String(e.count ?? 0)} tone="rose" />
                      </View>
                    ))}
                  </Section>
                ) : null}
                <Section kicker="Breakdown" title="By intent" icon={Timer}>
                  <Text variant="caption" color="ink4">
                    Request volume per AI surface.
                  </Text>
                </Section>
              </>
            ) : null}
          </Gutter>
        </ListHeader>
      }
      ListEmptyComponent={q.isLoading ? null : <EmptyState icon={Sparkles} title="No usage" message="No AI calls recorded in this window." />}
      renderItem={({ item: r }) => (
        <Card padding={16} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <IconTile icon={Cpu} tone="ink" size={42} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3" numberOfLines={1} style={{ fontFamily: fonts.displayBold }}>
              {r.intent ?? '—'}
            </Text>
            <Text variant="caption" color="ink4" style={{ fontFamily: fonts.mono }}>
              {r.requests ?? 0} req · {(r.tokens ?? 0).toLocaleString()} tok
            </Text>
          </View>
          {r.costUsd != null ? <MonoTag label={`$${r.costUsd.toFixed(3)}`} tone="copper" /> : null}
        </Card>
      )}
    />
  );
}
