import { router } from 'expo-router';
import { View } from 'react-native';
import {
  Users,
  Target,
  ChartBar,
  Tags,
  Warehouse,
  Settings,
  ShieldCheck,
  GraduationCap,
  Megaphone,
  Truck,
  Wallet,
  Landmark,
  LogOut,
  Bell,
  HelpCircle,
} from 'lucide-react-native';
import { Avatar, InkHero, Kicker, ListRow, ListSection, MenuGrid, MenuTile, Screen, Text, useToast } from '@/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { colors, fonts, radii } from '@/theme/tokens';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';

type Link = { icon: typeof Users; label: string; hint: string; to: string; tone?: 'paper' | 'ink' | 'volt' };

/** The most-used modules, shown as tiles at the top of the hub. */
const TOP: Link[] = [
  { icon: Truck, label: 'Deliveries', hint: 'Fleet & proof of delivery', to: '/supplier/deliveries', tone: 'ink' },
  { icon: Wallet, label: 'Payments', hint: 'Settlements & payouts', to: '/supplier/payments' },
  { icon: ChartBar, label: 'Analytics', hint: 'Revenue & trends', to: '/supplier/analytics' },
  { icon: Megaphone, label: 'Sponsored', hint: 'Boost listings', to: '/supplier/sponsored', tone: 'volt' },
];

const GROUPS: { label: string; links: (Link & { iconTone?: 'ink' | 'volt' | 'copper' | 'paper' })[] }[] = [
  {
    label: 'Money',
    links: [{ icon: Landmark, label: 'Accounts', hint: 'Ledger & bank accounts', to: '/supplier/accounts', iconTone: 'ink' }],
  },
  {
    label: 'Customers & growth',
    links: [
      { icon: Users, label: 'Customers', hint: 'Commercial buyers', to: '/supplier/customers', iconTone: 'copper' },
      { icon: Target, label: 'Leads', hint: 'RFQ pipeline CRM', to: '/supplier/leads', iconTone: 'copper' },
    ],
  },
  {
    label: 'Catalog & stock',
    links: [
      { icon: Tags, label: 'Pricing', hint: 'Tiers & MOQs', to: '/supplier/pricing', iconTone: 'volt' },
      { icon: Warehouse, label: 'Inventory', hint: 'Stock levels', to: '/supplier/inventory', iconTone: 'volt' },
    ],
  },
  {
    label: 'Facility',
    links: [
      { icon: Settings, label: 'Settings', hint: 'Depot & payouts', to: '/supplier/settings', iconTone: 'ink' },
      { icon: ShieldCheck, label: 'Verification', hint: 'KYC & documents', to: '/supplier/verification', iconTone: 'ink' },
      { icon: GraduationCap, label: 'Learning', hint: 'Training centre', to: '/supplier/learning', iconTone: 'ink' },
    ],
  },
  {
    label: 'Help & alerts',
    links: [
      { icon: Bell, label: 'Notifications', hint: 'Alerts & updates', to: '/notifications', iconTone: 'paper' },
      { icon: HelpCircle, label: 'How it works', hint: 'Platform guide', to: '/how-it-works', iconTone: 'paper' },
    ],
  },
];

/** Supplier "More" tab — module hub, portal switching and sign out. */
export function SupplierMoreScreen() {
  const { user, supplier, signOut } = useAuth();
  const toast = useToast();

  const out = async () => {
    try {
      await signOut();
      router.replace('/welcome');
    } catch (e) {
      toast.error('Could not sign out', errorMessage(e));
    }
  };

  return (
    <Screen tabBar kicker="Supplier" title="More" subtitle="Every supplier module in one place." gap={22}>
      {/* Identity */}
      <InkHero seed={`more-${supplier?.supplierId ?? 'supplier'}`} style={{ padding: 18, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ padding: 3, borderRadius: 32, backgroundColor: 'rgba(250,247,240,0.1)' }}>
            <Avatar name={supplier?.supplierName ?? user?.name} size={54} tone="copper" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Kicker color="volt">Supplier workspace</Kicker>
            <Text variant="h1" color="paper" numberOfLines={1}>
              {supplier?.supplierName ?? user?.name ?? 'Supplier'}
            </Text>
            <Text variant="caption" color="paperMuted" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          {supplier?.role ? (
            <View style={{ paddingHorizontal: 10, height: 26, borderRadius: radii.pill, justifyContent: 'center', backgroundColor: 'rgba(198,220,74,0.14)' }}>
              <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.6, color: colors.volt }}>{humanize(supplier.role).toUpperCase()}</Text>
            </View>
          ) : (
            <View />
          )}
          <PortalSwitcher current="supplier" dark />
        </View>
      </InkHero>

      <MenuGrid>
        {TOP.map((l) => (
          <MenuTile key={l.to} icon={l.icon} label={l.label} hint={l.hint} tone={l.tone} onPress={() => router.push(l.to as never)} />
        ))}
      </MenuGrid>

      {GROUPS.map((g) => (
        <ListSection key={g.label} label={g.label}>
          {g.links.map((l, i) => (
            <ListRow
              key={l.to}
              icon={l.icon}
              iconTone={l.iconTone}
              title={l.label}
              subtitle={l.hint}
              onPress={() => router.push(l.to as never)}
              last={i === g.links.length - 1}
            />
          ))}
        </ListSection>
      ))}

      <ListSection footer="You can switch between buyer, supplier and admin portals from the workspace pill above.">
        <ListRow icon={LogOut} iconTone="danger" title="Sign out" destructive chevron={false} onPress={out} last />
      </ListSection>
    </Screen>
  );
}
