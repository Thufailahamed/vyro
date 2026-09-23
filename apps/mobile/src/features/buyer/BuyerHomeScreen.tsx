import { useMemo } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  Building2,
  CreditCard,
  FileText,
  MessagesSquare,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
} from 'lucide-react-native';
import {
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  InkHero,
  ListScreen,
  MenuGrid,
  MenuTile,
  ScreenHeader,
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
import { Enter, MonoTag, Section, go } from './orders/kit';
import { PortalSwitcher } from '../common/PortalSwitcher';
import { IN_FLIGHT } from './orders/orderStatus';
import { useCart, useRepeatOffersPreview } from './commerce/data';
import type { OrderRow } from './orders/types';
import type { CreditFacilityResponse } from './commerce/types';

/** Buyer home — procurement dashboard: stats, quick actions, in-flight POs. */
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
  const recent = list.slice(0, 4);
  const cartLines = cart.data?.items?.length ?? 0;
  const cartTotal = cart.data?.totalCents ?? 0;
  const topRepeat = (repeatOffers.data?.offers ?? []).slice(0, 2);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const header = (
    <>
      <ScreenHeader
        kicker={business?.businessName ?? 'VYRO wholesale'}
        title={`Ayubowan, ${firstName}`}
        subtitle="Mill-direct wholesale for Sri Lankan businesses."
        right={
          <>
            <IconButton icon={Bell} variant="surface" accessibilityLabel="Notifications" onPress={() => go('/notifications')} />
            <PortalSwitcher current="buyer" />
          </>
        }
      />
      <InkHero seed="buyer-home" style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ gap: 4 }}>
            <Text variant="overline" color="paperMuted">
              In-flight purchase orders
            </Text>
            <Text variant="metric" color="volt">
              {inFlight.length}
            </Text>
            <Text variant="caption" color="paperMuted">
              {list.length} total · {cartLines} cart line{cartLines === 1 ? '' : 's'}
            </Text>
          </View>
          <Package size={44} color={colors.volt} strokeWidth={1.2} />
        </View>
      </InkHero>
    </>
  );

  return (
    <ListScreen
      tabBar
      data={recent}
      keyExtractor={(o) => o.id}
      header={header}
      onRefresh={() => Promise.all([orders.refetch(), cart.refetch(), credit.refetch()])}
      renderItem={({ item: o, index }) => (
        <Enter i={index}>
          <Card onPress={() => go(`/buyer/order/${o.id}`)} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <FileText size={15} color={colors.copper} />
                <Text variant="body" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                  {o.poNumber}
                </Text>
              </View>
              <StatusBadge status={o.status} size="sm" />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="caption" color="ink4" numberOfLines={1} style={{ flex: 1 }}>
                {[o.supplierName, formatDate(o.createdAt)].filter(Boolean).join(' · ')}
              </Text>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink }}>{formatCompactLKR(o.totalCents)}</Text>
            </View>
          </Card>
        </Enter>
      )}
      ListEmptyComponent={
        orders.isLoading ? (
          <SkeletonList rows={3} height={80} />
        ) : orders.isError ? (
          <ErrorState message={errorMessage(orders.error)} onRetry={() => orders.refetch()} />
        ) : (
          <EmptyState
            icon={ShoppingCart}
            title="No purchase orders yet"
            message="Source mill-direct lots from the catalog — every order is escrow-protected."
            action={{ label: 'Browse catalog', onPress: () => go('/buyer/catalog') }}
          />
        )
      }
      ListFooterComponent={
        <View style={{ gap: 14, marginTop: 6 }}>
          {/* Quick stats */}
          <StatGrid>
            <Stat label="Cart" value={cartLines} hint={cartLines ? formatCompactLKR(cartTotal) : 'Empty'} icon={ShoppingCart} onPress={() => go('/buyer/cart')} />
            <Stat
              label="VYRO credit"
              value={credit.data?.eligible ? formatCompactLKR(credit.data.availableCents) : '—'}
              hint={credit.data?.eligible ? 'Available now' : credit.data?.reason ?? 'Not eligible yet'}
              icon={CreditCard}
              onPress={() => go('/buyer/credit')}
            />
          </StatGrid>

          {/* Quick actions */}
          <MenuGrid>
            <MenuTile icon={Search} label="Catalog" hint="Mill-direct lots" onPress={() => go('/buyer/catalog')} />
            <MenuTile icon={FileText} label="RFQs" hint="Request supplier quotes" onPress={() => go('/buyer/rfqs')} />
            <MenuTile icon={Sparkles} label="Ask VYRO" hint="AI sourcing assistant" tone="volt" onPress={() => go('/buyer/ask')} />
            <MenuTile icon={MessagesSquare} label="Order by chat" hint="Describe it, we build the cart" onPress={() => go('/buyer/order/conversational')} />
          </MenuGrid>

          {/* Repeat offers */}
          {topRepeat.length ? (
            <Section icon={Package} kicker="Repeat offers" title="Loyalty pricing" sub="Suppliers discounting your repeat spend">
              {topRepeat.map((o) => (
                <View key={o.supplierId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <Text variant="bodySm" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                    {o.supplierName}
                  </Text>
                  <MonoTag label={`−${o.percent}%`} tone="volt" />
                </View>
              ))}
            </Section>
          ) : null}

          {/* Business card */}
          {business ? (
            <Card kind="bone" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Building2 size={18} color={colors.copper} />
              <View style={{ flex: 1 }}>
                <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                  {business.businessName}
                </Text>
                <Text variant="caption" color="ink4">
                  {business.role} · procurement account
                </Text>
              </View>
              <Touchable onPress={() => go('/buyer/account')} accessibilityLabel="Account settings">
                <ArrowRight size={16} color={colors.ink4} />
              </Touchable>
            </Card>
          ) : (
            <Card kind="bone">
              <Text variant="bodySm" color="ink3">
                Set up your business profile to start ordering mill-direct.
              </Text>
              <View style={{ marginTop: 10 }}>
                <Touchable onPress={() => go('/onboarding/business')}>
                  <Text variant="bodySm" weight="semibold" color="copper">
                    Set up business →
                  </Text>
                </Touchable>
              </View>
            </Card>
          )}
        </View>
      }
    />
  );
}
