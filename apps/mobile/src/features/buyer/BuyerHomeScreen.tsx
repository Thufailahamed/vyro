import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  MessagesSquare,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  type LucideIcon,
} from 'lucide-react-native';
import {
  Avatar,
  Card,
  CountUp,
  EmptyState,
  ErrorState,
  IconButton,
  IconTile,
  QuickAction,
  QuickActions,
  Screen,
  SectionHeader,
  SkeletonList,
  StatusBadge,
  Text,
  Touchable,
} from '@/ui';
import { api, errorMessage, qs } from '@/lib/api';
import { useAuth, useBusinessId } from '@/lib/auth';
import { formatCompactLKR, formatDate, formatRs } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { Enter, MonoTag, go } from './orders/kit';
import { PortalSwitcher } from '../common/PortalSwitcher';
import { IN_FLIGHT } from './orders/orderStatus';
import { useCart, useRepeatOffersPreview } from './commerce/data';
import type { OrderRow } from './orders/types';
import type { CreditFacilityResponse } from './commerce/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Buyer home — procurement dashboard: identity bar, spend card, shortcuts, recent POs. */
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

  return (
    <Screen tabBar gap={0} onRefresh={() => Promise.all([orders.refetch(), cart.refetch(), credit.refetch(), repeatOffers.refetch()])}>
      {/* App bar: identity (opens workspace switcher) + actions */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 20 }}>
        <View style={{ flex: 1 }}>
          <PortalSwitcher
            current="buyer"
            trigger={({ open, orgName }) => (
              <Touchable onPress={open} hapticOnPress scaleTo={0.97} accessibilityLabel="Switch workspace" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ padding: 2, borderRadius: 26, borderWidth: 1.5, borderColor: colors.volt }}>
                  <Avatar name={orgName} size={42} />
                </View>
                <View style={{ flexShrink: 1, gap: 1 }}>
                  <Text variant="bodySm" color="ink4">
                    {greeting()}, {firstName}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {orgName}
                    </Text>
                    <ChevronDown size={16} color={colors.ink4} strokeWidth={2.2} />
                  </View>
                </View>
              </Touchable>
            )}
          />
        </View>
        <IconButton icon={Search} variant="surface" size={44} accessibilityLabel="Search catalog" onPress={() => go('/buyer/catalog')} />
        <IconButton icon={Bell} variant="surface" size={44} accessibilityLabel="Notifications" onPress={() => go('/notifications')} />
      </View>

      {/* Spend card — the wallet-style hero */}
      <Enter>
        <SpendCard
          count={inFlight.length}
          value={inFlightValue}
          creditLabel={credit.data?.eligible ? formatCompactLKR(credit.data.availableCents) : '—'}
          creditHint={credit.data?.eligible ? 'Available' : 'Not eligible yet'}
          cartLabel={cartLines ? formatCompactLKR(cartTotal) : 'Empty'}
          cartHint={`${cartLines} line${cartLines === 1 ? '' : 's'}`}
        />
      </Enter>

      {/* Shortcuts */}
      <Enter i={1}>
        <QuickActions style={{ marginTop: 24 }}>
          <QuickAction icon={Search} label="Catalog" onPress={() => go('/buyer/catalog')} />
          <QuickAction icon={FileText} label="RFQs" onPress={() => go('/buyer/rfqs')} />
          <QuickAction icon={Sparkles} label="Ask VYRO" tone="volt" onPress={() => go('/buyer/ask')} />
          <QuickAction icon={MessagesSquare} label="By chat" onPress={() => go('/buyer/order/conversational')} />
        </QuickActions>
      </Enter>

      {/* Repeat offers — a slim promo strip */}
      {topRepeat.length ? (
        <Enter i={2}>
          <Card kind="volt" padding={16} radius={radii['2xl']} style={{ marginTop: 28, gap: 12 }} onPress={() => go('/buyer/catalog')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile icon={Tag} tone="ink" size={38} />
              <View style={{ flex: 1 }}>
                <Text variant="h3">Loyalty pricing unlocked</Text>
                <Text variant="caption" color="ink3">
                  Suppliers discounting your repeat spend
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {topRepeat.map((o) => (
                <View
                  key={o.supplierId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingLeft: 12,
                    paddingRight: 4,
                    height: 34,
                    borderRadius: radii.pill,
                    backgroundColor: 'rgba(255,253,249,0.65)',
                    maxWidth: '100%',
                  }}
                >
                  <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {o.supplierName}
                  </Text>
                  <MonoTag label={`−${o.percent}%`} tone="ink" />
                </View>
              ))}
            </View>
          </Card>
        </Enter>
      ) : null}

      {/* Recent orders — one inset-grouped card */}
      <SectionHeader
        title="Recent orders"
        action={list.length ? { label: 'See all', onPress: () => go('/buyer/orders') } : undefined}
        style={{ marginTop: 32, marginBottom: 12 }}
      />
      <Enter i={3}>
        {recent.length ? (
          <Card padding={0} radius={radii['2xl']} style={{ paddingHorizontal: 16 }}>
            {recent.map((o, i) => (
              <OrderLine key={o.id} order={o} last={i === recent.length - 1} />
            ))}
          </Card>
        ) : orders.isLoading ? (
          <SkeletonList rows={3} height={72} />
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
        )}
      </Enter>

      {/* Onboarding nudge when there's no business yet */}
      {!business ? (
        <Card kind="ink" padding={18} radius={radii['2xl']} style={{ gap: 14, marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon={Package} tone="glass" size={44} />
            <Text variant="bodySm" color="paperMuted" style={{ flex: 1 }}>
              Set up your business profile to start ordering mill-direct.
            </Text>
          </View>
          <Touchable
            onPress={() => go('/onboarding/business')}
            hapticOnPress
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: colors.volt }}
          >
            <Text variant="bodySm" weight="semibold">
              Set up business
            </Text>
            <ArrowRight size={15} color={colors.ink} />
          </Touchable>
        </Card>
      ) : null}
    </Screen>
  );
}

/** Wallet-style ink card: in-flight spend up top, credit + cart split below. */
function SpendCard({
  count,
  value,
  creditLabel,
  creditHint,
  cartLabel,
  cartHint,
}: {
  count: number;
  value: number;
  creditLabel: string;
  creditHint: string;
  cartLabel: string;
  cartHint: string;
}) {
  return (
    <View style={[{ borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink, overflow: 'hidden' }, shadow.ink]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#2F3524', '#171A13', colors.ink]}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(198,220,74,0.16)', 'rgba(198,220,74,0)']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.35, y: 0.6 }}
        style={StyleSheet.absoluteFill}
      />

      <Touchable onPress={() => go('/buyer/orders')} hapticOnPress scaleTo={0.985} accessibilityLabel="In-flight orders" style={{ padding: 22, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: count ? colors.volt : colors.paperFaint }} />
            <Text variant="bodySm" weight="medium" color="paperMuted">
              In-flight spend
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 12, paddingRight: 8, height: 30, borderRadius: 15, backgroundColor: 'rgba(250,247,240,0.1)' }}>
            <Text variant="caption" weight="semibold" color="paper">
              {count} order{count === 1 ? '' : 's'}
            </Text>
            <ChevronRight size={14} color={colors.paperMuted} strokeWidth={2.2} />
          </View>
        </View>

        <CountUp
          value={value}
          format={(n) => formatRs(n)}
          style={{ fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 46, letterSpacing: -1.2, color: colors.paper, marginTop: 14 }}
        />
        <Text variant="bodySm" color="paperFaint">
          {count ? 'Escrow-protected · moving through fulfilment' : 'Nothing on the move right now'}
        </Text>
      </Touchable>

      <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.paperLine }}>
        <SplitCell icon={CreditCard} label="VYRO credit" value={creditLabel} hint={creditHint} onPress={() => go('/buyer/credit')} />
        <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.paperLine, marginVertical: 14 }} />
        <SplitCell icon={ShoppingCart} label="Cart" value={cartLabel} hint={cartHint} onPress={() => go('/buyer/cart')} />
      </View>
    </View>
  );
}

function SplitCell({ icon: Icon, label, value, hint, onPress }: { icon: LucideIcon; label: string; value: string; hint: string; onPress: () => void }) {
  return (
    <Touchable onPress={onPress} hapticOnPress scaleTo={0.97} accessibilityLabel={label} style={{ flex: 1, paddingHorizontal: 22, paddingVertical: 16, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon size={14} color={colors.volt} strokeWidth={2} />
          <Text variant="caption" color="paperMuted">
            {label}
          </Text>
        </View>
        <ArrowUpRight size={14} color={colors.paperFaint} strokeWidth={2} />
      </View>
      <Text variant="h1" color="paper" numberOfLines={1} tabular>
        {value}
      </Text>
      <Text variant="caption" color="paperFaint" numberOfLines={1}>
        {hint}
      </Text>
    </Touchable>
  );
}

/** One row of the recent-orders group: supplier first, PO number as metadata. */
function OrderLine({ order: o, last }: { order: OrderRow; last: boolean }) {
  const live = (IN_FLIGHT as readonly string[]).includes(o.status);
  return (
    <Touchable onPress={() => go(`/buyer/order/${o.id}`)} hapticOnPress scaleTo={0.985} accessibilityLabel={`Order ${o.poNumber}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 }}>
        <IconTile icon={FileText} tone={live ? 'ink' : 'paper'} size={44} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {o.supplierName || o.poNumber}
          </Text>
          <Text variant="caption" color="ink4" numberOfLines={1}>
            {[o.supplierName ? o.poNumber : null, formatDate(o.createdAt)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 5 }}>
          <Text variant="body" weight="semibold" tabular>
            {formatCompactLKR(o.totalCents)}
          </Text>
          <StatusBadge status={o.status} size="sm" />
        </View>
      </View>
      {!last ? <View style={{ position: 'absolute', left: 58, right: 0, bottom: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft }} /> : null}
    </Touchable>
  );
}
