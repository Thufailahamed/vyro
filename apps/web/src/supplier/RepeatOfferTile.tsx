import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RepeatOfferAnalyticsResponse } from '@vyro/validation';
import { formatCompactLKR } from '@/lib/format';

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
    <div className="bg-paper p-5 space-y-1">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-ink-4 flex items-center gap-1.5">
        <SparklesIcon size={13} className="text-emerald-600" />
        Repeat Offers (30d)
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

import { MetricNumber } from '@/components/brand/Surface';
import { SparklesIcon } from '@/components/icons';
