import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { RepeatOfferAnalyticsResponse } from '@vyro/validation';
import { formatCompactLKR } from '@/lib/format';
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
    <div className="rounded-2xl border border-ink/[0.08] bg-paper p-5 shadow-[0_1px_2px_rgba(12,14,11,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-4">Repeat offers · 30d</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-volt/15 text-volt-deep">
          <SparklesIcon size={15} />
        </span>
      </div>
      <div className="mt-4 font-display text-[2rem] font-bold leading-none tracking-tight text-ink tabular-nums">
        {q.data.triggeredCount}
      </div>
      <div className="mt-2 text-[12px] text-ink-4">
        Discounted orders · {formatCompactLKR(q.data.totalSavingsCents)} saved
      </div>
    </div>
  );
}
