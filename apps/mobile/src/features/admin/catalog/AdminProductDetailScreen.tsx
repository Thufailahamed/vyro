import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react-native';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import {
  Button,
  ConfirmSheet,
  KeyValue,
  ProductImage,
  QueryView,
  Screen,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Appear, CodeBlock } from '@/features/admin/platform/kit';
import { Section } from '@/features/admin/ops/kit';

interface ProductDetail {
  product: {
    id: string;
    name: string;
    description: string | null;
    categoryId: string;
    brand: string | null;
    unit: string;
    active: boolean;
    featured: boolean;
    moderationNotes: string | null;
    createdAt: number;
    updatedAt: number;
  };
  category: { id: string; name: string } | null;
  offers?: unknown[];
  audit?: { id: string; action: string; actorId: string; createdAt: number }[];
}

/** Mirrors web AdminProductDetailPage (GET /admin/products/:id). */
export function AdminProductDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<'feature' | 'unfeature' | 'deactivate' | null>(null);

  const q = useQuery({
    queryKey: ['admin-product', id],
    queryFn: () => api.get<ProductDetail>(`/admin/products/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
  const m = useMutation({
    mutationFn: async () => {
      if (!q.data) return;
      if (confirm === 'feature' || confirm === 'unfeature') {
        return api.post(`/admin/products/${id}/feature`, { featured: confirm === 'feature' });
      }
      return api.patch(`/admin/products/${id}`, { active: false });
    },
    onSuccess: () => {
      toast.success('Product updated');
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['admin-product', id] });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
    },
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });

  const p = q.data?.product;

  return (
    <Screen
      back
      kicker="Catalog · Product"
      title={p?.name ?? 'Product'}
      subtitle={q.data?.category ? `in ${q.data.category.name}` : undefined}
      onRefresh={() => q.refetch()}
      footer={
        p ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title={p.featured ? 'Unfeature' : 'Feature'}
              icon={p.featured ? undefined : Star}
              variant={p.featured ? 'secondary' : 'volt'}
              onPress={() => setConfirm(p.featured ? 'unfeature' : 'feature')}
              style={{ flex: 1 }}
            />
            {p.active ? (
              <Button title="Deactivate" variant="danger" onPress={() => setConfirm('deactivate')} style={{ flex: 1 }} />
            ) : null}
          </View>
        ) : undefined
      }
    >
      <QueryView query={q} empty={() => !q.data?.product} emptyTitle="Product not found" emptyMessage="This listing doesn't exist or was removed.">
        {(d) => (
          <>
            <Appear>
              <ProductImage src={null} seed={d.product.id} style={{ width: '100%', height: 180, borderRadius: 16 }} />
            </Appear>
            <Appear i={1}>
              <Section kicker="Listing" title={d.product.name}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <StatusBadge status={d.product.active ? 'active' : 'inactive'} size="sm" />
                  {d.product.featured ? <StatusBadge status="featured" size="sm" /> : null}
                </View>
                {d.product.description ? (
                  <Text variant="bodySm" color="ink3">
                    {d.product.description}
                  </Text>
                ) : null}
                <View>
                  <KeyValue label="Brand" value={d.product.brand ?? '—'} />
                  <KeyValue label="Unit" value={d.product.unit} />
                  <KeyValue label="Category" value={d.category?.name ?? d.product.categoryId} />
                  <KeyValue label="Updated" value={formatDateTime(d.product.updatedAt)} last />
                </View>
                {d.product.moderationNotes ? <CodeBlock value={d.product.moderationNotes} maxLines={6} /> : null}
              </Section>
            </Appear>
            <Appear i={2}>
              <Section kicker={`Offers · ${(d.offers ?? []).length}`} title="Supplier offers">
                <Text variant="bodySm" color="ink4">
                  {(d.offers ?? []).length === 0
                    ? 'No live supplier offers for this product.'
                    : `${(d.offers ?? []).length} supplier offers live.`}
                </Text>
              </Section>
            </Appear>
            {(d.audit ?? []).length > 0 ? (
              <Appear i={3}>
                <Section kicker={`Audit · ${(d.audit ?? []).length}`} title="Moderation history">
                  <View style={{ gap: 6 }}>
                    {(d.audit ?? []).slice(0, 8).map((a) => (
                      <View key={a.id} style={{ flexDirection: 'row', gap: 8 }}>
                        <Text variant="bodySm" style={{ flex: 1 }} numberOfLines={1}>
                          {humanize(a.action)}
                        </Text>
                        <Text variant="caption" color="ink5">
                          {formatDateTime(a.createdAt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Section>
              </Appear>
            ) : null}
          </>
        )}
      </QueryView>
      <ConfirmSheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => m.mutate()}
        loading={m.isPending}
        title={confirm === 'deactivate' ? 'Deactivate this product?' : confirm === 'feature' ? 'Feature this product?' : 'Remove feature flag?'}
        message="Merchandising changes apply immediately across search and browse."
        confirmLabel="Apply"
        variant={confirm === 'deactivate' ? 'danger' : 'primary'}
      />
    </Screen>
  );
}
