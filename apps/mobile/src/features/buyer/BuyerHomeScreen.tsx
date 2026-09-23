import { useMemo } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Building2, CreditCard, FileText, MessagesSquare, Package, Search, ShoppingCart, Sparkles, Tag } from 'lucide-react-native';
import {
  Card,
  EmptyState,
  ErrorState,
  Gutter,
  IconButton,
  IconTile,
  InkHero,
  ListHeader,
  ListScreen,
  QuickAction,
  QuickActions,
  SectionHeader,
  SkeletonList,
  Stat,
  StatGrid,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useAuth, useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDate } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';
import { Enter, MonoTag, go } from './orders/kit';
import { PortalSwitcher } from '../common/PortalSwitcher';
import { IN_FLIGHT } from './orders/orderStatus';
import { useCart, useRepeatOffersPreview } from './commerce/data';
import type { OrderRow } from './orders/types';
import type { CreditFacilityResponse } from './commerce/types';

function today() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Buyer home — procurement dashboard: hero, quick actions, KPIs, in-flight POs. */
export function BuyerHomeScreen() {
  const { user, business } = useAuth();
  const businessId = useBusinessId();
  const cart = useCart(businessId);

  const orders = useQuery({
    queryKey: ['orders', businessId],
    queryFn: () => api.get<{ orders: OrderRow[] }>('/purchase-orders' + qs({ businessId })),
    enabled: !!businessId,
  });
  const credit = useQuery({
    queryKey: ['credit-facility', businessId],
    queryFn: () => api.get<CreditFacilityResponse>('/credit/facility' + qs({ businessId })),
    enabled: !!businessId,
  });
  const repeatOffers = useRepeatOffersPreview(businessId);

  const list = useMemo(() => orders.data?.orders ?? [], [orders.data]);
  const inFlight = useMemo(() => list.filter((o) => (IN_FLIGHT as readonly string[]).includes(o.status)), [list]);
  const inFlightValue = useMemo(() => inFlight.reduce((sum, o) => sum + (o.totalCents ?? 0), 0), [inFlight]);
  const recent = list.slice(0, 4);
  const cartLines = cart.data?.items?.length ?? 0;
  const cartTotal = cart.data?.totalCents ?? 0;
  const topRepeat = (repeatOffers.data?.offers ?? []).slice(0, 2);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const header = (
    <ListHeader>
      {/* App bar: workspace chip + notifications */}
      <Gutter style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 6 }}>
        <View style={{ flexShrink: 1 }}>
          <PortalSwitcher current="buyer" />
        </View>
        <IconButton icon={Bell} variant="surface" accessibilityLabel="Notifications" onPress={() => go('/notifications')} />
      </Gutter>

      {/* Greeting */}
      <Gutter style={{ gap: 4, paddingTop: 4 }}>
        <Text variant="overline" color="copper">
          {today()}
        </Text>
        <Text variant="displayMd">Ayubowan, {firstName}</Text>
      </Gutter>

      {/* Hero: in-flight POs + quick actions */}
      <Gutter>
        <Enter>
          <InkHero seed="buyer-home" style={{ gap: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ gap: 6, flex: 1 }}>
                <Text variant="overline" color="paperMuted">
                  In-flight purchase orders
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                  <Text variant="metric" color="volt" style={{ fontSize: 44, lineHeight: 48 }}>
                    {inFlight.length}
                  </Text>
                  {inFlightValue ? (
                    <Text style={{ fontFamily: fonts.monoMedium, fontSize: 15, color: colors.paper }}>{formatCompactLKR(inFlightValue)}</Text>
                  ) : null}
                </View>
                <Text variant="caption" color="paperMuted">
                  {list.length} total · {cartLines} cart line{cartLines === 1 ? '' : 's'}
                </Text>
              </View>
              <Touchable
                onPress={() => go('/buyer/orders')}
                hapticOnPress
                accessibilityLabel="All orders"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: colors.volt,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ArrowRight size={19} color={colors.ink} strokeWidth={2.1} />
              </Touchable>
            </View>
            <View style={{ height: 1, backgroundColor: colors.paperLine }} />
            <QuickActions>
              <QuickAction icon={Search} label="Catalog" tone="glass" onPress={() => go('/buyer/catalog')} />
              <QuickAction icon={FileText} label="RFQs" tone="glass" onPress={() => go('/buyer/rfqs')} />
              <QuickAction icon={Sparkles} label="Ask VYRO" tone="volt" onPress={() => go('/buyer/ask')} />
              <QuickAction icon={MessagesSquare} label="By chat" tone="glass" onPress={() => go('/buyer/order/conversational')} />
            </QuickActions>
          </InkHero>
        </Enter>
      </Gutter>

      {/* KPIs */}
      <Gutter>
        <Enter i={1}>
          <StatGrid>
            <Stat label="Cart" value={cartLines} hint={cartLines ? formatCompactLKR(cartTotal) : 'Empty'} icon={ShoppingCart} onPress={() => go('/buyer/cart')} />
            <Stat
              label="VYRO credit"
              value={credit.data?.eligible ? formatCompactLKR(credit.data.availableCents) : '—'}
              hint={credit.data?.eligible ? 'Available now' : (credit.data?.reason ?? 'Not eligible yet')}
              icon={CreditCard}
              onPress={() => go('/buyer/credit')}
            />
          </StatGrid>
        </Enter>
      </Gutter>

      <Gutter style={{ marginTop: 8 }}>
        <SectionHeader kicker="Procurement" title="Recent orders" action={list.length ? { label: 'See all', onPress: () => go('/buyer/orders') } : undefined} style={{ marginBottom: 0 }} />
      </Gutter>
    </ListHeader>
  );

  return (
    <ListScreen
      tabBar
      data={recent}
      keyExtractor={(o) => o.id}
      header={header}
      onRefresh={() => Promise.all([orders.refetch(), cart.refetch(), credit.refetch()])}
      renderItem={({ item: o, index }) => (
        <Enter i={index + 2}>
          <Card onPress={() => go(`/buyer/order/${o.id}`)} padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconTile icon={FileText} tone={(IN_FLIGHT as readonly string[]).includes(o.status) ? 'ink' : 'paper'} size={44} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text variant="body" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                  {o.poNumber}
                </Text>
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14.5, color: colors.ink }}>{formatCompactLKR(o.totalCents)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" color="ink4" numberOfLines={1} style={{ flex: 1 }}>
                  {[o.supplierName, formatDate(o.createdAt)].filter(Boolean).join(' · ')}
                </Text>
                <StatusBadge status={o.status} size="sm" />
              </View>
            </View>
          </Card>
        </Enter>
      )}
      ListEmptyComponent={
        orders.isLoading ? (
          <SkeletonList rows={3} height={76} />
        ) : orders.isError ? (
          <ErrorState message={errorMessage(orders.error)} onRetry={() => orders.refetch()} />
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No purchase orders yet"
            message="Source mill-direct lots from the catalog — every order is escrow-protected."
            action={{ label: 'Browse catalog', onPress: () => go('/buyer/catalog') }}
            compact
          />
        )
      }
      ListFooterComponent={
        <View style={{ gap: 14, marginTop: 10 }}>
          {/* Repeat offers */}
          {topRepeat.length ? (
            <Card kind="volt" padding={18} style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon={Tag} tone="ink" size={40} />
                <View style={{ flex: 1 }}>
                  <Text variant="overline" color="ink3">
                    Repeat offers
                  </Text>
                  <Text variant="h2">Loyalty pricing</Text>
                </View>
              </View>
              <View style={{ backgroundColor: 'rgba(255,253,249,0.6)', borderRadius: 16, paddingHorizontal: 14 }}>
                {topRepeat.map((o, i) => (
                  <View
                    key={o.supplierId}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      borderTopWidth: i ? 1 : 0,
                      borderTopColor: 'rgba(12,14,11,0.08)',
                    }}
                  >
                    <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                      {o.supplierName}
                    </Text>
                    <MonoTag label={`−${o.percent}%`} tone="ink" />
                  </View>
                ))}
              </View>
              <Text variant="caption" color="ink3">
                Suppliers discounting your repeat spend
              </Text>
            </Card>
          ) : null}

          {/* Business card */}
          {business ? (
            <Card onPress={() => go('/buyer/account')} padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <IconTile icon={Building2} tone="copper" size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="semibold" numberOfLines={1}>
                  {business.businessName}
                </Text>
                <Text variant="caption" color="ink4">
                  {business.role} · procurement account
                </Text>
              </View>
              <ArrowRight size={17} color={colors.ink4} />
            </Card>
          ) : (
            <Card kind="ink" padding={18} style={{ gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <IconTile icon={Package} tone="glass" size={44} />
                <Text variant="bodySm" color="paperMuted" style={{ flex: 1 }}>
                  Set up your business profile to start ordering mill-direct.
                </Text>
              </View>
              <Touchable
                onPress={() => go('/onboarding/business')}
                hapticOnPress
                style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 38, borderRadius: 19, backgroundColor: colors.volt }}
              >
                <Text variant="bodySm" weight="semibold">
                  Set up business
                </Text>
                <ArrowRight size={15} color={colors.ink} />
              </Touchable>
            </Card>
          )}
        </View>
      }
    />
  );
}
