import { useMemo, useState } from 'react';
import { ActivityIndicator, View, ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ArrowDownLeft, Banknote, Building2, CreditCard, Landmark, SlidersHorizontal, Store, Wallet, type LucideIcon } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { formatCompactLKR, formatDateTime, humanize } from '@/lib/format';
import { usePermission } from '@/features/admin/common/permissions';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Gutter,
  IconButton,
  IconTile,
  Input,
  ListHeader,
  ListScreen,
  Row,
  ScreenHeader,
  SearchBar,
  Select,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
} from '@/ui';
import { Appear, MoneyText, go, rupeesToCents } from '@/features/admin/platform/kit';
import { useAdminPaymentOptions, useAdminPaymentSearch, type PaymentMethod, type PaymentProvider, type PaymentRow, type PaymentSearchFilters, type PaymentSort, type PaymentStatus } from '../api';

const ALL_STATUSES: PaymentStatus[] = ['pending', 'confirmed', 'failed', 'cancelled', 'chargeback', 'refunded'];
const METHOD_ICON: Record<PaymentMethod, LucideIcon> = { cash: Banknote, bank_transfer: Landmark, online: CreditCard };

const SORTS: { value: PaymentSort; label: string }[] = [
  { value: 'createdAt-desc', label: 'Newest first' },
  { value: 'createdAt-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Amount high → low' },
  { value: 'amount-asc', label: 'Amount low → high' },
];

function statusTone(s: PaymentStatus): 'in' | 'out' | 'warn' | 'neutral' {
  if (s === 'confirmed') return 'in';
  if (s === 'failed' || s === 'cancelled') return 'out';
  if (s === 'refunded' || s === 'chargeback') return 'warn';
  return 'neutral';
}

function PaymentCard({ p }: { p: PaymentRow }) {
  const Icon = METHOD_ICON[p.method] ?? Wallet;
  const tone = statusTone(p.status);
  return (
    <Card kind="flat" padding={16} onPress={() => go(`/admin/payments/${p.id}`)} style={{ gap: 12 }}>
      <Row gap={12} align="center">
        <IconTile icon={Icon} tone={tone === 'in' ? 'success' : tone === 'out' ? 'danger' : tone === 'warn' ? 'warning' : 'ink'} size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="mono" style={{ fontFamily: 'IBMPlexMono_500Medium', fontSize: 14.5, color: colors.ink }} numberOfLines={1}>
            {p.poNumber || p.id.slice(0, 16)}
          </Text>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {humanize(p.method)} · {formatDateTime(p.createdAt)}
          </Text>
        </View>
        <StatusBadge status={p.status} size="sm" />
      </Row>
      <View style={{ gap: 6, padding: 12, borderRadius: radii.lg, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
        <Row gap={8}>
          <Building2 size={13} color={colors.ink4} />
          <Text variant="bodySm" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
            {p.businessName}
          </Text>
        </Row>
        <Row gap={8}>
          <Store size={13} color={colors.copper} />
          <Text variant="bodySm" color="ink3" numberOfLines={1} style={{ flex: 1 }}>
            {p.supplierName}
          </Text>
        </Row>
      </View>
      <Row justify="space-between" align="flex-end">
        <Text variant="caption" color="ink5">
          Fee {formatCompactLKR(p.feeCents)} · Net {formatCompactLKR(p.netCents)}
        </Text>
        <MoneyText cents={p.amountCents} size="lg" tone={tone === 'neutral' ? 'neutral' : tone} />
      </Row>
    </Card>
  );
}

export function PaymentsScreen() {
  const can = usePermission('payment:read');
  const params = useLocalSearchParams<{ q?: string; status?: string; businessId?: string; supplierId?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [filters, setFilters] = useState<PaymentSearchFilters>(() => ({
    q: params.q || undefined,
    status: params.status ? (params.status.split(',') as PaymentStatus[]) : undefined,
    businessId: params.businessId || undefined,
    supplierId: params.supplierId || undefined,
    sort: 'createdAt-desc',
  }));
  const [sheet, setSheet] = useState(false);

  const q = useAdminPaymentSearch(filters, can);
  const options = useAdminPaymentOptions(can);
  const rows = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p?.payments ?? []), [q.data]);
  const volume = rows.reduce((s, p) => s + (p.status === 'confirmed' ? p.amountCents : 0), 0);

  const set = (patch: Partial<PaymentSearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleStatus = (s: PaymentStatus) => {
    const cur = filters.status ?? [];
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    set({ status: next.length ? next : undefined });
  };
  const advancedCount = [filters.method, filters.provider, filters.businessId, filters.supplierId, filters.minCents, filters.maxCents].filter(
    (v) => v !== undefined,
  ).length + (filters.sort && filters.sort !== 'createdAt-desc' ? 1 : 0);

  if (!can) {
    return (
      <ListScreen
        data={[]}
        renderItem={null}
        header={
          <ListHeader>
            <ScreenHeader back kicker="Money" title="Payments" />
            <Gutter>
              <EmptyState title="Restricted" message="You need payment:read permission to search payments." />
            </Gutter>
          </ListHeader>
        }
      />
    );
  }

  const header = (
    <ListHeader>
      <ScreenHeader
        back
        kicker="Money"
        title="Payments"
        subtitle="Cross-tenant payment search and detail."
        right={<IconButton icon={SlidersHorizontal} variant={advancedCount ? 'ink' : 'surface'} badge={advancedCount || undefined} accessibilityLabel="Filters" onPress={() => setSheet(true)} />}
      />
      <Gutter style={{ gap: 12 }}>
        <SearchBar
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (!v) set({ q: undefined });
          }}
          onSubmit={() => set({ q: text.trim() || undefined })}
          placeholder="Payment id, txn ref or gateway ref"
        />
      </Gutter>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 4 }} style={{ overflow: 'visible' }}>
        <Chip label="Any status" selected={!filters.status?.length} onPress={() => set({ status: undefined })} />
        {ALL_STATUSES.map((s) => (
          <Chip key={s} label={humanize(s)} selected={!!filters.status?.includes(s)} onPress={() => toggleStatus(s)} />
        ))}
      </ScrollView>
      {rows.length ? (
        <Gutter>
          <Card kind="ink" flow="payments-strip" padding={14}>
            <Row justify="space-between">
              <View style={{ gap: 2 }}>
                <Text variant="overline" color="paperMuted">
                  Loaded
                </Text>
                <Text variant="metricSm" color="paper">
                  {rows.length}
                  {q.hasNextPage ? '+' : ''}
                </Text>
              </View>
              <View style={{ gap: 2, alignItems: 'flex-end' }}>
                <Row gap={4}>
                  <ArrowDownLeft size={12} color={colors.volt} />
                  <Text variant="overline" color="paperMuted">
                    Confirmed volume
                  </Text>
                </Row>
                <Text variant="metricSm" color="volt">
                  {formatCompactLKR(volume)}
                </Text>
              </View>
            </Row>
          </Card>
        </Gutter>
      ) : null}
    </ListHeader>
  );

  return (
    <>
      <ListScreen<PaymentRow>
        data={q.isLoading || q.isError ? [] : rows}
        keyExtractor={(p) => p.id}
        header={header}
        onRefresh={() => q.refetch()}
        renderItem={({ item, index }) => (
          <Appear i={index % 10}>
            <PaymentCard p={item} />
          </Appear>
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
        }}
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonList rows={5} height={150} />
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState icon={Wallet} title="No payments match" message="Try clearing a filter or searching by a different reference." />
          )
        }
        ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={colors.ink} style={{ marginVertical: 16 }} /> : null}
      />

      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        filters={filters}
        options={options.data}
        onApply={(f) => {
          setFilters((cur) => ({ ...cur, ...f }));
          setSheet(false);
        }}
      />
    </>
  );
}

function FilterSheet({
  visible,
  onClose,
  filters,
  options,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  filters: PaymentSearchFilters;
  options?: { businesses: { id: string; name: string }[]; suppliers: { id: string; name: string }[] };
  onApply: (f: PaymentSearchFilters) => void;
}) {
  const [method, setMethod] = useState<string>(filters.method ?? '');
  const [provider, setProvider] = useState<string>(filters.provider ?? '');
  const [sort, setSort] = useState<PaymentSort>(filters.sort ?? 'createdAt-desc');
  const [businessId, setBusinessId] = useState(filters.businessId ?? '');
  const [supplierId, setSupplierId] = useState(filters.supplierId ?? '');
  const [min, setMin] = useState(filters.minCents !== undefined ? String(filters.minCents / 100) : '');
  const [max, setMax] = useState(filters.maxCents !== undefined ? String(filters.maxCents / 100) : '');

  const reset = () => {
    setMethod('');
    setProvider('');
    setSort('createdAt-desc');
    setBusinessId('');
    setSupplierId('');
    setMin('');
    setMax('');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filter payments"
      scroll
      footer={
        <Row gap={10}>
          <Button title="Reset" variant="secondary" onPress={reset} style={{ flex: 1 }} />
          <Button
            title="Apply filters"
            style={{ flex: 2 }}
            onPress={() => {
              const minC = min.trim() ? rupeesToCents(min) : null;
              const maxC = max.trim() ? rupeesToCents(max) : null;
              onApply({
                method: (method || undefined) as PaymentMethod | undefined,
                provider: (provider || undefined) as PaymentProvider | undefined,
                sort,
                businessId: businessId || undefined,
                supplierId: supplierId || undefined,
                minCents: minC ?? undefined,
                maxCents: maxC ?? undefined,
              });
            }}
          />
        </Row>
      }
    >
      <View style={{ gap: 16 }}>
        <Field label="Method">
          <Row gap={8} wrap>
            {[
              { v: '', l: 'Any' },
              { v: 'cash', l: 'Cash' },
              { v: 'bank_transfer', l: 'Bank transfer' },
              { v: 'online', l: 'Online' },
            ].map((o) => (
              <Chip key={o.v || 'any'} label={o.l} selected={method === o.v} onPress={() => setMethod(o.v)} />
            ))}
          </Row>
        </Field>
        <Field label="Provider">
          <Row gap={8} wrap>
            {[
              { v: '', l: 'Any' },
              { v: 'payhere', l: 'PayHere' },
              { v: 'mock', l: 'Mock' },
            ].map((o) => (
              <Chip key={o.v || 'any'} label={o.l} selected={provider === o.v} onPress={() => setProvider(o.v)} />
            ))}
          </Row>
        </Field>
        <Field label="Sort">
          <Select<PaymentSort> value={sort} onChange={setSort} options={SORTS} title="Sort payments" />
        </Field>
        <Field label="Business">
          <Select
            value={businessId}
            onChange={setBusinessId}
            title="Business"
            options={[{ value: '', label: 'Any business' }, ...(options?.businesses ?? []).map((b) => ({ value: b.id, label: b.name }))]}
          />
        </Field>
        <Field label="Supplier">
          <Select
            value={supplierId}
            onChange={setSupplierId}
            title="Supplier"
            options={[{ value: '', label: 'Any supplier' }, ...(options?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))]}
          />
        </Field>
        <Row gap={10}>
          <Field label="Min (LKR)" style={{ flex: 1 }}>
            <Input value={min} onChangeText={setMin} keyboardType="decimal-pad" placeholder="0" />
          </Field>
          <Field label="Max (LKR)" style={{ flex: 1 }}>
            <Input value={max} onChangeText={setMax} keyboardType="decimal-pad" placeholder="Any" />
          </Field>
        </Row>
        {filters.q ? <Badge label={`Search: ${filters.q}`} tone="ink" /> : null}
      </View>
    </Sheet>
  );
}
