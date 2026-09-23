import { useState } from 'react';
import { View } from 'react-native';
import { Building2, FileText, Package, SearchX, ShieldAlert, Store, Truck, UserRound } from 'lucide-react-native';
import { errorMessage, qs } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Card, ListCard, ListRow, QueryView, Screen, SearchBar, Text } from '@/ui';
import { useAdminGet } from '@/features/admin/common/api';
import { Appear, go } from '@/features/admin/platform/kit';
import { useDebounced } from '@/features/admin/ops/kit/hooks';

interface SearchResults {
  users?: { id: string; email: string; name: string; role: string }[];
  suppliers?: { id: string; name: string; email: string }[];
  businesses?: { id: string; name: string; email: string }[];
  products?: { id: string; name: string }[];
  orders?: { id: string; poNumber: string; status: string }[];
  invoices?: { id: string; number: string }[];
  deliveries?: { id: string; status: string }[];
  abuseReports?: { id: string; reason: string; status: string }[];
}

/** Mirrors web GlobalSearchBar (GET /admin/search?q=). */
export function AdminSearchScreen() {
  const [text, setText] = useState('');
  const debounced = useDebounced(text.trim(), 300);
  const q = useAdminGet<SearchResults>(
    ['admin-search', debounced],
    '/admin/search' + qs({ q: debounced }),
    debounced.length >= 2,
  );

  const groups: { title: string; icon: typeof Store; rows: { id: string; title: string; sub: string; href: string }[] }[] = [
    {
      title: 'Suppliers',
      icon: Store,
      rows: (q.data?.suppliers ?? []).map((s) => ({ id: s.id, title: s.name, sub: s.email, href: `/admin/suppliers/${s.id}` })),
    },
    {
      title: 'Businesses',
      icon: Building2,
      rows: (q.data?.businesses ?? []).map((b) => ({ id: b.id, title: b.name, sub: b.email, href: `/admin/businesses/${b.id}` })),
    },
    {
      title: 'Users',
      icon: UserRound,
      rows: (q.data?.users ?? []).map((u) => ({ id: u.id, title: u.name, sub: `${u.email} · ${humanize(u.role)}`, href: '/admin/users' })),
    },
    {
      title: 'Orders',
      icon: Package,
      rows: (q.data?.orders ?? []).map((o) => ({ id: o.id, title: o.poNumber || o.id.slice(0, 8), sub: humanize(o.status), href: `/admin/order/${o.id}` })),
    },
    {
      title: 'Products',
      icon: FileText,
      rows: (q.data?.products ?? []).map((p) => ({ id: p.id, title: p.name, sub: p.id.slice(0, 8), href: `/admin/catalog/product/${p.id}` })),
    },
    {
      title: 'Deliveries',
      icon: Truck,
      rows: (q.data?.deliveries ?? []).map((d) => ({ id: d.id, title: d.id.slice(0, 12), sub: humanize(d.status), href: '/admin/deliveries' })),
    },
    {
      title: 'Abuse reports',
      icon: ShieldAlert,
      rows: (q.data?.abuseReports ?? []).map((r) => ({ id: r.id, title: r.reason, sub: humanize(r.status), href: '/admin/trust-safety' })),
    },
  ];
  const shown = groups.filter((g) => g.rows.length > 0);
  const total = shown.reduce((s, g) => s + g.rows.length, 0);

  return (
    <Screen back kicker="Command" title="Search" subtitle="One query across every registry." onRefresh={() => q.refetch()}>
      <SearchBar value={text} onChangeText={setText} placeholder="PO#, name, email, product…" autoFocus />
      {debounced.length < 2 ? (
        <Card kind="bone">
          <Text variant="bodySm" color="ink4">
            Type at least 2 characters to search suppliers, businesses, users, orders, products, deliveries and abuse reports.
          </Text>
        </Card>
      ) : (
        <QueryView
          query={{ ...q, isLoading: q.isLoading || q.isFetching } as typeof q}
          empty={() => total === 0}
          emptyTitle="No matches"
          emptyMessage={`Nothing found for “${debounced}”.`}
          emptyIcon={SearchX}
        >
          {() => (
            <View style={{ gap: 16 }}>
              {shown.map((g, gi) => (
                <Appear key={g.title} i={gi}>
                  <View style={{ gap: 8 }}>
                    <Text variant="overline" color="copper">
                      {g.title} · {g.rows.length}
                    </Text>
                    <ListCard>
                      {g.rows.slice(0, 6).map((r, i) => (
                        <ListRow
                          key={r.id}
                          title={r.title}
                          subtitle={r.sub}
                          icon={g.icon}
                          last={i === Math.min(g.rows.length, 6) - 1}
                          onPress={() => go(r.href)}
                        />
                      ))}
                    </ListCard>
                  </View>
                </Appear>
              ))}
            </View>
          )}
        </QueryView>
      )}
      {q.isError ? <Text variant="caption" color="ink4">{errorMessage(q.error)}</Text> : null}
    </Screen>
  );
}
