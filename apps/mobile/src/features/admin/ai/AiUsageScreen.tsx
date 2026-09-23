import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Activity, Sparkles, Timer } from 'lucide-react-native';
import { Card, ChipRow, EmptyState, ErrorState, Gutter, ListHeader, ListScreen, ScreenHeader, SkeletonList, Text } from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { colors, fonts } from '@/theme/tokens';
import { MonoTag, Section } from '../../buyer/orders/kit';

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

  const stat = (label: string, value: string, warn = false) => (
    <Card key={label} padding={12} style={{ width: '48%', flexGrow: 1, gap: 4 }}>
      <Text variant="overline" color="ink4" numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 17, color: warn ? colors.rose : colors.ink }}>{value}</Text>
    </Card>
  );

  return (
    <ListScreen
      data={d?.byIntent ?? []}
      keyExtractor={(r, i) => `${r.intent ?? 'intent'}-${i}`}
      onRefresh={() => q.refetch()}
      header={
        <ListHeader>
          <ScreenHeader back kicker="AI platform & inference" title="AI telemetry" subtitle="Token consumption, latency, provider routing and model economics." />
          <Gutter style={{ gap: 14 }}>
            <ChipRow options={RANGES} value={days} onChange={setDays} />
            {q.isLoading ? (
              <SkeletonList rows={2} height={90} />
            ) : q.isError ? (
              <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
            ) : d ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {stat('Requests', String(d.totalRequests ?? 0))}
                  {stat('Failure rate', `${((d.failureRate ?? 0) * 100).toFixed(1)}%`, (d.failureRate ?? 0) > 0.05)}
                  {stat('Avg latency', `${Math.round(d.avgLatencyMs ?? 0)}ms`)}
                  {stat('Tokens', totalTokens.toLocaleString())}
                  {stat('Est. cost', `$${(d.costEstimateUsd ?? 0).toFixed(2)}`)}
                </View>
                {d.byProvider?.length ? (
                  <Section kicker="Routing" title="Providers" icon={Sparkles}>
                    {d.byProvider.map((p, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="bodySm" weight="medium">
                          {p.provider ?? '—'}
                        </Text>
                        <Text variant="caption" color="ink4">
                          {p.requests ?? 0} req{p.share != null ? ` · ${Math.round(p.share * 100)}%` : ''}
                        </Text>
                      </View>
                    ))}
                  </Section>
                ) : null}
                {d.byError?.length ? (
                  <Section kicker="Failures" title="Top errors" icon={Activity}>
                    {d.byError.slice(0, 6).map((e, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
        <Card padding={14} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
            {r.intent ?? '—'}
          </Text>
          <Text variant="caption" color="ink4">
            {r.requests ?? 0} req · {(r.tokens ?? 0).toLocaleString()} tok
          </Text>
          {r.costUsd != null ? <MonoTag label={`$${r.costUsd.toFixed(3)}`} tone="copper" /> : null}
        </Card>
      )}
    />
  );
}
