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
  ArrowLeftRight,
  LogOut,
  Bell,
  HelpCircle,
} from 'lucide-react-native';
import { Avatar, Button, Card, MenuGrid, MenuTile, Screen, Text, useToast } from '@/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { colors } from '@/theme/tokens';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';

const LINKS: { icon: typeof Users; label: string; hint: string; to: string; tone?: 'paper' | 'ink' | 'volt' }[] = [
  { icon: Truck, label: 'Deliveries', hint: 'Fleet & proof of delivery', to: '/supplier/deliveries' },
  { icon: Wallet, label: 'Payments', hint: 'Settlements & payouts', to: '/supplier/payments' },
  { icon: Landmark, label: 'Accounts', hint: 'Ledger & bank accounts', to: '/supplier/accounts' },
  { icon: Users, label: 'Customers', hint: 'Commercial buyers', to: '/supplier/customers' },
  { icon: Target, label: 'Leads', hint: 'RFQ pipeline CRM', to: '/supplier/leads' },
  { icon: ChartBar, label: 'Analytics', hint: 'Revenue & trends', to: '/supplier/analytics' },
  { icon: Tags, label: 'Pricing', hint: 'Tiers & MOQs', to: '/supplier/pricing' },
  { icon: Warehouse, label: 'Inventory', hint: 'Stock levels', to: '/supplier/inventory' },
  { icon: Settings, label: 'Settings', hint: 'Depot & payouts', to: '/supplier/settings' },
  { icon: ShieldCheck, label: 'Verification', hint: 'KYC & documents', to: '/supplier/verification' },
  { icon: GraduationCap, label: 'Learning', hint: 'Training centre', to: '/supplier/learning' },
  { icon: Megaphone, label: 'Sponsored', hint: 'Boost listings', to: '/supplier/sponsored', tone: 'volt' },
  { icon: Bell, label: 'Notifications', hint: 'Alerts & updates', to: '/notifications' },
  { icon: HelpCircle, label: 'How it works', hint: 'Platform guide', to: '/how-it-works' },
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
    <Screen tabBar kicker="Supplier" title="More" subtitle="Every supplier module in one place.">
      {/* Identity */}
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={supplier?.supplierName ?? user?.name} size={44} tone="copper" />
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>
              {supplier?.supplierName ?? user?.name ?? 'Supplier'}
            </Text>
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>
      </Card>

      <MenuGrid>
        {LINKS.map((l) => (
          <MenuTile
            key={l.to}
            icon={l.icon}
            label={l.label}
            hint={l.hint}
            tone={l.tone}
            onPress={() => router.push(l.to as never)}
          />
        ))}
      </MenuGrid>

      {/* Portal switching + sign out */}
      <Card kind="bone" style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <ArrowLeftRight size={14} color={colors.copper} />
          <Text variant="bodySm" weight="semibold">
            Portals
          </Text>
        </View>
        <PortalSwitcher current="supplier" />
        <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
          <Button title="Sign out" icon={LogOut} variant="ghost" onPress={out} />
        </View>
      </Card>
    </Screen>
  );
}
