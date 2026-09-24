import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RepeatOfferAnalyticsResponse } from '@vyro/validation';
import { formatCompactLKR } from '@/lib/format';
import { MetricNumber } from '@/components/brand/Surface';
import { SparklesIcon } from '@/components/icons';

export function RepeatOfferTile({ supplierId }: { supplierId: string }) {
  const q = useQuery({
    queryKey: ['supplier', supplierId, 'repeat-offers', 'analytics'],
    queryFn: () =>
      api.get<RepeatOfferAnalyticsResponse>(
        `/supplier/repeat-offers/analytics?supplierId=${supplierId}`,
      ),
    retry: false,
    refetchInterval: 60_000,
  });
  if (!q.data) return null;
  return (
    <div className="vyro-surface p-5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4">Repeat Offers (30d)</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-mint/15 text-mint">
          <SparklesIcon size={15} />
        </span>
      </div>
      <MetricNumber size="md" className="text-ink">
        {q.data.triggeredCount}
      </MetricNumber>
      <div className="text-xs text-ink-4">
        orders with discount · {formatCompactLKR(q.data.totalSavingsCents)} savings extended
      </div>
    </div>
  );
}
