import { router } from 'expo-router';
import { View } from 'react-native';
import {
  ArrowLeftRight,
  Bell,
  Building2,
  CreditCard,
  FileText,
  HelpCircle,
  Landmark,
  LogOut,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Store,
} from 'lucide-react-native';
import { Avatar, Button, Card, MenuGrid, MenuTile, Screen, Text, useToast } from '@/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { colors } from '@/theme/tokens';
import { PortalSwitcher } from '../common/PortalSwitcher';
import { go } from './orders/kit';

const LINKS: { icon: typeof Package; label: string; hint: string; to: string; tone?: 'paper' | 'ink' | 'volt' }[] = [
  { icon: Package, label: 'Orders', hint: 'Purchase orders & tracking', to: '/buyer/orders' },
  { icon: FileText, label: 'RFQs', hint: 'Quote requests & compare', to: '/buyer/rfqs' },
  { icon: Receipt, label: 'Invoices', hint: 'Billing & statements', to: '/buyer/invoices' },
  { icon: CreditCard, label: 'VYRO Credit', hint: 'Net-terms facility', to: '/buyer/credit' },
  { icon: Landmark, label: 'Accounts', hint: 'Ledger & payments', to: '/buyer/accounts' },
  { icon: ShieldCheck, label: 'KYC', hint: 'Business verification', to: '/buyer/kyc' },
  { icon: Bell, label: 'Notifications', hint: 'Alerts & updates', to: '/notifications' },
  { icon: HelpCircle, label: 'How it works', hint: 'Procurement guide', to: '/how-it-works' },
  { icon: Settings, label: 'Settings', hint: 'Profile & preferences', to: '/settings' },
];

/** Buyer account tab — profile, module hub, portal switching, sign out. */
export function BuyerAccountScreen() {
  const { user, business, signOut } = useAuth();
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
    <Screen tabBar kicker="Buyer account" title="Your workspace" subtitle="Profile, modules and preferences.">
      {/* Profile card */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={user?.name} uri={user?.image} size={48} />
          <View style={{ flex: 1 }}>
            <Text variant="h3" numberOfLines={1}>
              {user?.name ?? 'Buyer'}
            </Text>
            <Text variant="caption" color="ink4" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>
        {business ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
            <Building2 size={14} color={colors.copper} />
            <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
              {business.businessName}
            </Text>
            <Text variant="caption" color="ink4">
              {business.role}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
            <Text variant="bodySm" color="ink3">
              No business profile yet — set one up to unlock ordering.
            </Text>
            <Button title="Set up business" size="sm" variant="secondary" icon={Store} onPress={() => go('/onboarding/business')} />
          </View>
        )}
      </Card>

      {/* Module hub */}
      <MenuGrid>
        {LINKS.map((l) => (
          <MenuTile key={l.to} icon={l.icon} label={l.label} hint={l.hint} tone={l.tone} onPress={() => go(l.to)} />
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
        <PortalSwitcher current="buyer" />
        <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
          <Button title="Sign out" icon={LogOut} variant="ghost" onPress={out} />
        </View>
      </Card>
    </Screen>
  );
}
