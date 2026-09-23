import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Star } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import {
  Banner,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear , Can } from '@/features/admin/platform/kit';

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
              <Card kind="flat" padding={14} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Flag size={14} color="#B87A4E" />
                  <Text variant="bodySm" weight="semibold" style={{ flex: 1 }} numberOfLines={2}>
                    {f.reason}
                  </Text>
                  <StatusBadge status={f.status} size="sm" />
                </View>
                <Text variant="caption" color="ink4" numberOfLines={1}>
                  {f.supplierName ?? f.supplierId?.slice(0, 8) ?? 'Supplier'} · {formatDateTime(f.createdAt)}
                </Text>
                <Can perm="product:moderate">
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Keep review" size="sm" variant="secondary" onPress={() => setTarget({ flag: f, action: 'keep' })} />
                    <Button title="Remove" size="sm" variant="danger" onPress={() => setTarget({ flag: f, action: 'remove' })} />
                  </View>
                </Can>
              </Card>
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
