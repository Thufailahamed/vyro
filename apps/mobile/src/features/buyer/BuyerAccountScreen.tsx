import { router } from 'expo-router';
import { View } from 'react-native';
import {
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
import { Avatar, Button, InkHero, ListRow, ListSection, QuickAction, QuickActions, Screen, Text, useToast } from '@/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { colors } from '@/theme/tokens';
import { PortalSwitcher } from '../common/PortalSwitcher';
import { Enter, go } from './orders/kit';

type Link = { icon: typeof Package; label: string; hint: string; to: string; tone?: 'ink' | 'volt' | 'copper' | 'paper' };

const GROUPS: { label: string; links: Link[] }[] = [
  {
    label: 'Procurement',
    links: [
      { icon: Package, label: 'Orders', hint: 'Purchase orders & tracking', to: '/buyer/orders' },
      { icon: FileText, label: 'RFQs', hint: 'Quote requests & compare', to: '/buyer/rfqs' },
      { icon: Receipt, label: 'Invoices', hint: 'Billing & statements', to: '/buyer/invoices', tone: 'copper' },
    ],
  },
  {
    label: 'Money',
    links: [
      { icon: CreditCard, label: 'VYRO Credit', hint: 'Net-terms facility', to: '/buyer/credit', tone: 'volt' },
      { icon: Landmark, label: 'Accounts', hint: 'Ledger & payments', to: '/buyer/accounts' },
    ],
  },
  {
    label: 'Business',
    links: [
      { icon: ShieldCheck, label: 'KYC', hint: 'Business verification', to: '/buyer/kyc', tone: 'copper' },
      { icon: Bell, label: 'Notifications', hint: 'Alerts & updates', to: '/notifications' },
    ],
  },
  {
    label: 'Help & preferences',
    links: [
      { icon: HelpCircle, label: 'How it works', hint: 'Procurement guide', to: '/how-it-works', tone: 'paper' },
      { icon: Settings, label: 'Settings', hint: 'Profile & preferences', to: '/settings', tone: 'paper' },
    ],
  },
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
    <Screen tabBar kicker="Buyer account" title="Your workspace" gap={22}>
      {/* Profile hero */}
      <Enter>
        <InkHero seed={user?.email ?? 'account'} style={{ gap: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ padding: 3, borderRadius: 34, backgroundColor: 'rgba(198,220,74,0.22)' }}>
              <Avatar name={user?.name} uri={user?.image} size={58} tone="volt" />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h1" color="paper" numberOfLines={1}>
                {user?.name ?? 'Buyer'}
              </Text>
              <Text variant="caption" color="paperMuted" numberOfLines={1}>
                {user?.email}
              </Text>
            </View>
          </View>
          {business ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                padding: 12,
                borderRadius: 16,
                backgroundColor: 'rgba(250,247,240,0.06)',
                borderWidth: 1,
                borderColor: colors.paperLine,
              }}
            >
              <Building2 size={16} color={colors.volt} />
              <Text variant="bodySm" weight="semibold" color="paper" numberOfLines={1} style={{ flex: 1 }}>
                {business.businessName}
              </Text>
              <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(198,220,74,0.16)' }}>
                <Text variant="caption" weight="semibold" color="volt">
                  {business.role}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text variant="bodySm" color="paperMuted">
                No business profile yet — set one up to unlock ordering.
              </Text>
              <Button title="Set up business" size="sm" variant="volt" icon={Store} onPress={() => go('/onboarding/business')} />
            </View>
          )}
          <QuickActions>
            <QuickAction icon={Package} label="Orders" tone="glass" onPress={() => go('/buyer/orders')} />
            <QuickAction icon={FileText} label="RFQs" tone="glass" onPress={() => go('/buyer/rfqs')} />
            <QuickAction icon={CreditCard} label="Credit" tone="glass" onPress={() => go('/buyer/credit')} />
            <QuickAction icon={Settings} label="Settings" tone="glass" onPress={() => go('/settings')} />
          </QuickActions>
        </InkHero>
      </Enter>

      {/* Module groups */}
      {GROUPS.map((g, gi) => (
        <Enter key={g.label} i={gi + 1}>
          <ListSection label={g.label}>
            {g.links.map((l, i) => (
              <ListRow key={l.to} icon={l.icon} iconTone={l.tone ?? 'ink'} title={l.label} subtitle={l.hint} onPress={() => go(l.to)} last={i === g.links.length - 1} />
            ))}
          </ListSection>
        </Enter>
      ))}

      {/* Portal switching */}
      <Enter i={GROUPS.length + 1}>
        <View style={{ gap: 8 }}>
          <Text variant="overline" color="ink4" style={{ marginLeft: 6 }}>
            Workspace
          </Text>
          <View style={{ alignSelf: 'flex-start' }}>
            <PortalSwitcher current="buyer" />
          </View>
        </View>
      </Enter>

      {/* Sign out */}
      <Enter i={GROUPS.length + 2}>
        <ListSection>
          <ListRow icon={LogOut} iconTone="danger" title="Sign out" destructive chevron={false} onPress={out} last />
        </ListSection>
      </Enter>
    </Screen>
  );
}
