import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Flag, Star, Trash2 } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import {
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  InkHero,
  Screen,
  SkeletonList,
  StatusBadge,
  useToast,
} from '@/ui';
import { Appear, Can } from '@/features/admin/platform/kit';
import { GlassStats, HeroFigure, HeroTopline, RecordCard } from '@/features/admin/ops/kit';

interface ReviewFlag {
  id: string;
  reviewId: string;
  reason: string;
  status: string;
  createdAt: number;
  supplierId?: string | null;
  supplierName?: string | null;
}

interface BurstItem {
  supplierId: string;
  flagCount: number;
}

/** Mirrors web AdminReviewsPage (GET /admin/reviews/flags, flag-burst). */
export function ReviewsScreen() {
  const flags = useQuery({
    queryKey: ['admin-review-flags'],
    queryFn: () => api.get<{ flags?: ReviewFlag[]; items?: ReviewFlag[] } | ReviewFlag[]>('/admin/reviews/flags' + qs({ limit: 50 })),
  });
  const burst = useQuery({
    queryKey: ['admin-review-burst'],
    queryFn: () => api.get<{ items: BurstItem[] }>('/admin/reviews/flag-burst' + qs({ windowHours: 24, minCount: 3 })),
    retry: false,
  });
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ flag: ReviewFlag; action: 'keep' | 'remove' } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows: ReviewFlag[] = Array.isArray(flags.data) ? flags.data : (flags.data?.flags ?? flags.data?.items ?? []);
  const bursts = burst.data?.items ?? [];
  const open = rows.filter((f) => f.status === 'open' || f.status === 'pending').length;

  const resolve = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.post(`/admin/reviews/flags/${target.flag.id}/resolve`, { action: target.action });
      toast.success('Flag resolved', target.action === 'keep' ? 'Review kept.' : 'Review removed.');
      setTarget(null);
      qc.invalidateQueries({ queryKey: ['admin-review-flags'] });
    } catch (e) {
      toast.error('Resolve failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back kicker="Operations" title="Reviews" subtitle="Flagged supplier reviews awaiting moderation." onRefresh={() => Promise.all([flags.refetch(), burst.refetch()])}>
      {!flags.isLoading && !flags.isError ? (
        <Appear>
          <InkHero seed="admin-reviews" style={{ padding: 18 }}>
            <HeroTopline icon={Flag} label="Moderation queue" status={bursts.length ? `${bursts.length} flag burst${bursts.length === 1 ? '' : 's'}` : 'No bursts'} statusTone={bursts.length ? 'danger' : 'ok'} />
            <HeroFigure value={open || rows.length} caption={open ? 'Flags waiting for a decision' : 'Flags on record'} />
            <GlassStats
              items={[
                { label: 'Flags', value: rows.length, hint: 'Last 50' },
                { label: 'Burst suppliers', value: bursts.length, hint: '≥3 flags in 24h', warn: bursts.length > 0 },
              ]}
            />
          </InkHero>
        </Appear>
      ) : null}
      {bursts.length > 0 ? (
        <Appear>
          <Banner
            tone="warning"
            title={`Flag burst · ${bursts.length} supplier${bursts.length === 1 ? '' : 's'}`}
            message={bursts.map((b) => `${b.supplierId.slice(0, 8)} (${b.flagCount})`).join(' · ')}
          />
        </Appear>
      ) : null}

      {flags.isLoading ? (
        <SkeletonList rows={5} height={110} />
      ) : flags.isError ? (
        <ErrorState message={errorMessage(flags.error)} onRetry={() => flags.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Star} title="No flagged reviews" message="Suppliers haven't flagged anything recently." />
      ) : (
        <View style={{ gap: 10 }}>
          {rows.map((f, i) => (
            <Appear key={f.id} i={i % 10}>
              <RecordCard
                icon={Flag}
                tone="copper"
                title={humanize(f.reason)}
                subtitle={f.supplierName ?? f.supplierId?.slice(0, 8) ?? 'Supplier'}
                meta={formatDateTime(f.createdAt)}
                status={<StatusBadge status={f.status} size="sm" />}
                actions={
                  <Can perm="product:moderate">
                    <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
                      <Button title="Keep review" icon={Check} size="sm" variant="secondary" onPress={() => setTarget({ flag: f, action: 'keep' })} style={{ flex: 1 }} />
                      <Button title="Remove" icon={Trash2} size="sm" variant="danger" onPress={() => setTarget({ flag: f, action: 'remove' })} style={{ flex: 1 }} />
                    </View>
                  </Can>
                }
              />
            </Appear>
          ))}
        </View>
      )}

      <ConfirmSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        onConfirm={resolve}
        loading={busy}
        title={target?.action === 'keep' ? 'Keep this review?' : 'Remove this review?'}
        message={target ? `Flag: ${humanize(target.flag.reason)}` : undefined}
        confirmLabel={target?.action === 'keep' ? 'Keep review' : 'Remove review'}
        variant={target?.action === 'keep' ? 'primary' : 'danger'}
      />
    </Screen>
  );
}
