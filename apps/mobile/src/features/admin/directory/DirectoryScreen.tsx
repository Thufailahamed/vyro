import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Building2, Store, Users } from 'lucide-react-native';
import { colors } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import {
  Avatar,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  ListHeader,
  ListScreen,
  ScreenHeader,
  SearchBar,
  SkeletonList,
  StatusBadge,
  Text,
} from '@/ui';
import { AdminHeaderActions, LoadMore, Section } from '@/features/admin/ops/kit';
import { Appear, go } from '@/features/admin/platform/kit';
import type { AdminUserRow, DirectoryRow } from '@/features/admin/common/api';
import { useAdminList } from '@/features/admin/ops/kit/hooks';

type Segment = 'suppliers' | 'businesses' | 'users';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'businesses', label: 'Businesses' },
  { value: 'users', label: 'Users' },
];

/**
 * Admin directory — mirrors the web SuppliersPage / BusinessesPage / UsersPage
 * (GET /admin/suppliers, /admin/businesses, /admin/users) with segments + search.
 */
export function DirectoryScreen() {
  const [segment, setSegment] = useState<Segment>('suppliers');

  return (
    <ListScreen
      tabBar
      data={[]}
      renderItem={null}
      header={
        <ListHeader>
          <ScreenHeader
            kicker="Registry"
            title="Directory"
            subtitle="Suppliers, buyer businesses and platform users."
            right={<AdminHeaderActions />}
          />
          <Gutter>
            <ChipRow<Segment> value={segment} onChange={setSegment} options={SEGMENTS} />
          </Gutter>
        </ListHeader>
      }
      ListEmptyComponent={
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          {segment === 'suppliers' ? <SegmentList<DirectoryRow> endpoint="/admin/suppliers" queryKey={['admin-suppliers']} rowKey="suppliers" kind="suppliers" /> : null}
          {segment === 'businesses' ? <SegmentList<DirectoryRow> endpoint="/admin/businesses" queryKey={['admin-businesses']} rowKey="businesses" kind="businesses" /> : null}
          {segment === 'users' ? <SegmentList<AdminUserRow> endpoint="/admin/users" queryKey={['admin-users']} rowKey="users" kind="users" /> : null}
        </View>
      }
    />
  );
}

function SegmentList<T extends DirectoryRow>({
  endpoint,
  queryKey,
  rowKey,
  kind,
}: {
  endpoint: string;
  queryKey: readonly unknown[];
  rowKey: string;
  kind: Segment;
}) {
  const t = useAdminList<T>({ endpoint, queryKey, rowKey });
  const Icon = kind === 'suppliers' ? Store : kind === 'businesses' ? Building2 : Users;
  const detailHref = (id: string) =>
    kind === 'users' ? '/admin/users' : kind === 'suppliers' ? `/admin/suppliers/${id}` : `/admin/businesses/${id}`;

  return (
    <View style={{ gap: 10 }}>
      <SearchBar value={t.searchInput} onChangeText={t.setSearchInput} placeholder={`Search ${kind}…`} />
      {t.loading ? (
        <SkeletonList rows={6} height={84} />
      ) : t.error ? (
        <ErrorState message={errorMessage(t.error)} onRetry={() => t.refetch()} />
      ) : t.rows.length === 0 ? (
        <EmptyState icon={Icon} title={`No ${kind} found`} message="Try a different search." />
      ) : (
        <>
          <Section kicker={`${t.rows.length} loaded${t.hasMore ? '+' : ''}`} title={humanize(kind)}>
            <View style={{ gap: 10 }}>
              {t.rows.map((r, i) => (
                <Appear key={r.id} i={i % 10}>
                  <Card kind="flat" padding={13} onPress={() => go(detailHref(r.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Avatar name={r.name} size={40} tone={kind === 'suppliers' ? 'ink' : kind === 'businesses' ? 'copper' : 'volt'} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="semibold" numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text variant="caption" color="ink4" numberOfLines={1}>
                        {[r.city, r.district].filter(Boolean).join(', ') || r.email || 'No location'}
                        {r.createdAt ? ` · ${formatDate(r.createdAt)}` : ''}
                      </Text>
                    </View>
                    {r.status || r.verificationStatus ? (
                      <StatusBadge status={(r.verificationStatus ?? r.status ?? '') as string} size="sm" />
                    ) : null}
                  </Card>
                </Appear>
              ))}
            </View>
          </Section>
          <LoadMore hasMore={t.hasMore} loading={t.fetchingMore} onPress={t.loadMore} />
          {t.fetchingMore ? <ActivityIndicator color={colors.ink} /> : null}
        </>
      )}
    </View>
  );
}
