import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  Building2,
  ChevronRight,
  Clock,
  Mail,
  MapPin,
  ShieldCheck,
  Star,
  Store,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { formatDate, humanize, timeAgo } from '@/lib/format';
import { usePermission } from '@/features/admin/common/permissions';
import {
  Avatar,
  Button,
  Card,
  ChipRow,
  EmptyState,
  ErrorState,
  Gutter,
  ListHeader,
  ListScreen,
  ScreenHeader,
  SearchBar,
  Segmented,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import {
  AdminHeaderActions,
  BulkConfirmSheet,
  BulkResultSheet,
  LoadMore,
  SelectDot,
  SelectionBar,
  useBulk,
  useSelection,
  type BulkResult,
  type Selection,
} from '@/features/admin/ops/kit';
import { Appear, go } from '@/features/admin/platform/kit';
import type { DirectoryRow } from '@/features/admin/common/api';
import { useAdminList } from '@/features/admin/ops/kit/hooks';

type Segment = 'suppliers' | 'businesses' | 'users';

const SEGMENTS: { value: Segment; label: string }[] = [
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'businesses', label: 'Businesses' },
  { value: 'users', label: 'Users' },
];

/** Server-side status/role filter chips per segment. */
const FILTERS: Record<Segment, { key: string; options: { value: string; label: string }[] }> = {
  suppliers: {
    key: 'status',
    options: [
      { value: '', label: 'All' },
      { value: 'active', label: 'Active' },
      { value: 'suspended', label: 'Suspended' },
    ],
  },
  businesses: {
    key: 'status',
    options: [
      { value: '', label: 'All' },
      { value: 'active', label: 'Active' },
      { value: 'suspended', label: 'Suspended' },
    ],
  },
  users: {
    key: 'isAdmin',
    options: [
      { value: '', label: 'All' },
      { value: 'true', label: 'Admins' },
      { value: 'false', label: 'Members' },
    ],
  },
};

/** Rows carry more fields than the shared DirectoryRow type declares. */
type Row = DirectoryRow & {
  reviewAvg?: number;
  reviewCount?: number;
  kycLevel?: 'none' | 'basic' | 'enhanced';
  adminRole?: string | null;
  isAdmin?: boolean;
  membershipsCount?: number;
  lastActivityAt?: number | null;
};

/**
 * Admin directory — mirrors the web SuppliersPage / BusinessesPage / UsersPage
 * (GET /admin/suppliers, /admin/businesses, /admin/users) with segments + search.
 */
export function DirectoryScreen() {
  const [segment, setSegment] = useState<Segment>('suppliers');
  const toast = useToast();
  // Bulk selection — businesses only, mirroring the web BusinessesPage.
  const sel = useSelection();
  const canSuspend = usePermission('user:suspend');
  const [confirmKind, setConfirmKind] = useState<'suspend' | 'unsuspend' | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const bulkSuspend = useBulk<{ ids: string[] }>('businesses/suspend', [['admin-businesses']]);
  const bulkUnsuspend = useBulk<{ ids: string[] }>('businesses/unsuspend', [['admin-businesses']]);
  const bulkBusy = bulkSuspend.isPending || bulkUnsuspend.isPending;

  const bulkActions = canSuspend
    ? [
        { label: 'Suspend', run: () => setConfirmKind('suspend' as const), destructive: true, disabled: bulkSuspend.isPending },
        { label: 'Reinstate', run: () => setConfirmKind('unsuspend' as const), disabled: bulkUnsuspend.isPending },
      ]
    : [];

  const onBulkError = (e: unknown) => toast.error('Bulk action failed', errorMessage(e));
  const runBulk = () => {
    const ids = sel.ids;
    const onDone = (r: BulkResult) => {
      setResult(r);
      sel.stop();
      setConfirmKind(null);
    };
    if (confirmKind === 'suspend') bulkSuspend.mutate({ ids }, { onSuccess: onDone, onError: onBulkError });
    else bulkUnsuspend.mutate({ ids }, { onSuccess: onDone, onError: onBulkError });
  };

  return (
    <View style={{ flex: 1 }}>
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
              <Segmented<Segment>
                value={segment}
                onChange={(s) => {
                  setSegment(s);
                  sel.stop();
                }}
                options={SEGMENTS}
              />
            </Gutter>
          </ListHeader>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 20, gap: 12 }}>
            {segment === 'suppliers' ? <SegmentList<Row> endpoint="/admin/suppliers" queryKey={['admin-suppliers']} rowKey="suppliers" kind="suppliers" /> : null}
            {segment === 'businesses' ? (
              <SegmentList<Row> endpoint="/admin/businesses" queryKey={['admin-businesses']} rowKey="businesses" kind="businesses" sel={canSuspend ? sel : undefined} />
            ) : null}
            {segment === 'users' ? <SegmentList<Row> endpoint="/admin/users" queryKey={['admin-users']} rowKey={['users', 'items']} kind="users" /> : null}
          </View>
        }
      />
      {sel.mode && segment === 'businesses' ? (
        <SelectionBar tabBar count={sel.count} actions={bulkActions} onClear={sel.stop} />
      ) : null}
      <BulkConfirmSheet
        visible={!!confirmKind}
        count={sel.count}
        action={confirmKind === 'suspend' ? 'Suspend' : 'Reinstate'}
        destructive={confirmKind === 'suspend'}
        loading={bulkBusy}
        onClose={() => setConfirmKind(null)}
        onConfirm={runBulk}
      />
      <BulkResultSheet
        result={result}
        onClose={() => setResult(null)}
        onRetryFailed={(ids) => {
          setResult(null);
          sel.start();
          sel.setAll(ids);
        }}
      />
    </View>
  );
}

/* ---------------------------------- Rows ---------------------------------- */

function MetaChip({ icon: Icon, label, accent }: { icon: LucideIcon; label: string; accent?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: radii.pill,
        backgroundColor: accent ? colors.voltSoft : colors.pearl,
      }}
    >
      <Icon size={11} color={accent ? colors.voltDeep : colors.ink4} strokeWidth={2} />
      <Text variant="caption" weight="medium" color={accent ? 'voltDeep' : 'ink3'} style={{ fontSize: 11 }}>
        {label}
      </Text>
    </View>
  );
}

function rowBadge(r: Row, kind: Segment) {
  if (kind === 'suppliers') return r.verificationStatus ?? r.status;
  if (kind === 'users') return r.adminRole ? humanize(r.adminRole) : r.status === 'suspended' ? 'suspended' : null;
  return r.status;
}

function rowMeta(r: Row, kind: Segment): { icon: LucideIcon; label: string; accent?: boolean }[] {
  const out: { icon: LucideIcon; label: string; accent?: boolean }[] = [];
  if (kind === 'users') {
    if (r.email) out.push({ icon: Mail, label: r.email });
    if (r.membershipsCount) out.push({ icon: Building2, label: `${r.membershipsCount} org${r.membershipsCount === 1 ? '' : 's'}` });
    if (r.lastActivityAt) out.push({ icon: Clock, label: `active ${timeAgo(r.lastActivityAt)}` });
  } else {
    const place = [r.city, r.district].filter(Boolean).join(', ');
    if (place) out.push({ icon: MapPin, label: place });
    if (r.contactPerson) out.push({ icon: User, label: r.contactPerson });
    if (kind === 'suppliers' && r.reviewCount) out.push({ icon: Star, label: `${((r.reviewAvg ?? 0) / 100).toFixed(1)} (${r.reviewCount})`, accent: true });
    if (kind === 'businesses' && r.kycLevel && r.kycLevel !== 'none') out.push({ icon: ShieldCheck, label: `KYC ${r.kycLevel}`, accent: r.kycLevel === 'enhanced' });
  }
  return out.slice(0, 3);
}

function DirectoryCard({
  r,
  kind,
  i,
  selecting,
  selected,
  onPress,
}: {
  r: Row;
  kind: Segment;
  i: number;
  selecting: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const badge = rowBadge(r, kind);
  const meta = rowMeta(r, kind);
  const joined = r.createdAt ? formatDate(r.createdAt) : null;
  return (
    <Appear i={i % 10}>
      <Card padding={14} onPress={onPress} style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {selecting ? <SelectDot on={selected} /> : null}
          <Avatar name={r.name} size={44} tone={kind === 'suppliers' ? 'ink' : kind === 'businesses' ? 'copper' : 'volt'} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="body" weight="semibold" numberOfLines={1}>
              {r.name}
            </Text>
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {kind === 'users' ? `Platform user${joined ? ` · joined ${joined}` : ''}` : `${humanize(kind === 'suppliers' ? 'supplier' : 'buyer business')}${joined ? ` · joined ${joined}` : ''}`}
            </Text>
          </View>
          {badge ? <StatusBadge status={badge} size="sm" /> : null}
          {!selecting ? <ChevronRight size={16} color={colors.ink5} /> : null}
        </View>
        {meta.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 56 }}>
            {meta.map((m) => (
              <MetaChip key={m.label} {...m} />
            ))}
          </View>
        ) : null}
      </Card>
    </Appear>
  );
}

/* --------------------------------- Segment -------------------------------- */

function SegmentList<T extends Row>({
  endpoint,
  queryKey,
  rowKey,
  kind,
  sel,
}: {
  endpoint: string;
  queryKey: readonly unknown[];
  rowKey: string | string[];
  kind: Segment;
  sel?: Selection;
}) {
  const t = useAdminList<T>({ endpoint, queryKey, rowKey });
  const Icon = kind === 'suppliers' ? Store : kind === 'businesses' ? Building2 : Users;
  const detailHref = (id: string) =>
    kind === 'users' ? '/admin/users' : kind === 'suppliers' ? `/admin/suppliers/${id}` : `/admin/businesses/${id}`;
  const selecting = !!sel?.mode;
  const f = FILTERS[kind];
  const activeFilter = t.filter[f.key] ?? '';

  return (
    <View style={{ gap: 10 }}>
      <SearchBar value={t.searchInput} onChangeText={t.setSearchInput} placeholder={`Search ${kind}…`} />
      <ChipRow
        options={f.options}
        value={activeFilter}
        onChange={(v) => t.setFilter((prev) => ({ ...prev, [f.key]: v }))}
      />
      {t.loading ? (
        <SkeletonList rows={6} height={84} />
      ) : t.error ? (
        <ErrorState message={errorMessage(t.error)} onRetry={() => t.refetch()} />
      ) : t.rows.length === 0 ? (
        <EmptyState icon={Icon} title={`No ${kind} found`} message="Try a different search or filter." />
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginTop: 4 }}>
            <Text variant="overline" color="ink4">
              {humanize(kind)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {selecting && sel ? (
                <Button title="All" size="sm" variant="ghost" onPress={() => sel.setAll(t.rows.map((r) => r.id))} />
              ) : null}
              <Text variant="caption" color="ink5">
                {t.rows.length} loaded{t.hasMore ? '+' : ''}
              </Text>
              {sel ? (
                <Button
                  title={selecting ? 'Done' : 'Select'}
                  size="sm"
                  variant="ghost"
                  onPress={() => (selecting ? sel.stop() : sel.start())}
                />
              ) : null}
            </View>
          </View>
          {t.rows.map((r, i) => (
            <DirectoryCard
              key={r.id}
              r={r}
              kind={kind}
              i={i}
              selecting={selecting}
              selected={sel?.has(r.id) ?? false}
              onPress={() => (sel?.mode ? sel.toggle(r.id) : go(detailHref(r.id)))}
            />
          ))}
          <LoadMore hasMore={t.hasMore} loading={t.fetchingMore} onPress={t.loadMore} />
          {t.fetchingMore ? <ActivityIndicator color={colors.ink} /> : null}
        </>
      )}
    </View>
  );
}
