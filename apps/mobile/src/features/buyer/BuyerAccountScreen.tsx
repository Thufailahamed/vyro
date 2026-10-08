import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import {
  ArrowRight,
  Bell,
  ChevronDown,
  CreditCard,
  FileText,
  HelpCircle,
  Landmark,
  LogOut,
  Package,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  Store,
  type LucideIcon,
} from 'lucide-react-native';
import { Avatar, Card, IconButton, ListRow, ListSection, Screen, Text, Touchable, useToast } from '@/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { colors, radii, shadow } from '@/theme/tokens';
import { PortalSwitcher } from '../common/PortalSwitcher';
import { Enter, go } from './orders/kit';

type Link = { icon: LucideIcon; label: string; to: string; tone?: 'ink' | 'volt' | 'copper' | 'paper' };

/** Most-used modules — surfaced as a shortcut strip under the profile. */
const SHORTCUTS: { icon: LucideIcon; label: string; to: string }[] = [
  { icon: Package, label: 'Orders', to: '/buyer/orders' },
  { icon: FileText, label: 'RFQs', to: '/buyer/rfqs' },
  { icon: Receipt, label: 'Invoices', to: '/buyer/invoices' },
  { icon: CreditCard, label: 'Credit', to: '/buyer/credit' },
];

const GROUPS: { label: string; links: Link[] }[] = [
  {
    label: 'Finance',
    links: [
      { icon: CreditCard, label: 'VYRO Credit', to: '/buyer/credit', tone: 'volt' },
      { icon: Landmark, label: 'Accounts & ledger', to: '/buyer/accounts' },
    ],
  },
  {
    label: 'Business',
    links: [
      { icon: ShieldCheck, label: 'Verification (KYC)', to: '/buyer/kyc', tone: 'copper' },
      { icon: Bell, label: 'Notifications', to: '/notifications' },
    ],
  },
  {
    label: 'Support',
    links: [
      { icon: HelpCircle, label: 'How it works', to: '/how-it-works', tone: 'paper' },
      { icon: Settings, label: 'Settings', to: '/settings', tone: 'paper' },
    ],
  },
];

/** Buyer account tab — profile, shortcuts, module hub, workspace switching, sign out. */
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
    <Screen tabBar gap={24}>
      {/* Title bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
        <Text variant="displayMd">Account</Text>
        <IconButton icon={Settings} variant="surface" size={44} accessibilityLabel="Settings" onPress={() => go('/settings')} />
      </View>

      {/* Profile */}
      <Enter style={{ alignItems: 'center', gap: 14 }}>
        <View style={[{ padding: 4, borderRadius: 52, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.volt }, shadow.md]}>
          <Avatar name={user?.name} uri={user?.image} size={88} tone="ink" />
        </View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text variant="displaySm" align="center" numberOfLines={1}>
            {user?.name ?? 'Buyer'}
          </Text>
          <Text variant="bodySm" color="ink4" align="center" numberOfLines={1}>
            {user?.email}
          </Text>
        </View>

        {business ? (
          <PortalSwitcher
            current="buyer"
            trigger={({ open }) => (
              <Touchable
                onPress={open}
                hapticOnPress
                scaleTo={0.96}
                accessibilityLabel="Switch workspace"
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingLeft: 6, paddingRight: 12, borderRadius: radii.pill, backgroundColor: colors.paper, maxWidth: '100%' },
                  shadow.sm,
                ]}
              >
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <Store size={13} color={colors.volt} strokeWidth={2} />
                </View>
                <Text variant="bodySm" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {business.businessName}
                </Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colors.voltSoft }}>
                  <Text variant="caption" weight="semibold" color="voltDeep" style={{ textTransform: 'capitalize' }}>
                    {business.role}
                  </Text>
                </View>
                <ChevronDown size={15} color={colors.ink4} strokeWidth={2.2} />
              </Touchable>
            )}
          />
        ) : null}
      </Enter>

      {/* No business yet → setup prompt */}
      {!business ? (
        <Enter i={1}>
          <Card kind="ink" padding={18} radius={radii['2xl']} style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text variant="h2" color="paper">
                Set up your business
              </Text>
              <Text variant="bodySm" color="paperMuted">
                Add your business profile to unlock ordering, credit and invoices.
              </Text>
            </View>
            <Touchable
              onPress={() => go('/onboarding/business')}
              hapticOnPress
              style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: colors.volt }}
            >
              <Text variant="bodySm" weight="semibold">
                Get started
              </Text>
              <ArrowRight size={15} color={colors.ink} />
            </Touchable>
          </Card>
        </Enter>
      ) : null}

      {/* Shortcuts */}
      <Enter i={1}>
        <Card padding={0} radius={radii['2xl']} style={{ flexDirection: 'row' }}>
          {SHORTCUTS.map((s, i) => (
            <View key={s.to} style={{ flex: 1, flexDirection: 'row' }}>
              {i ? <View style={{ width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.lineSoft, marginVertical: 18 }} /> : null}
              <Touchable onPress={() => go(s.to)} hapticOnPress scaleTo={0.94} accessibilityLabel={s.label} style={{ flex: 1, alignItems: 'center', gap: 8, paddingVertical: 16 }}>
                <View style={{ width: 44, height: 44, borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.bone, alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={20} color={colors.ink} strokeWidth={1.9} />
                </View>
                <Text variant="caption" weight="semibold" color="ink3">
                  {s.label}
                </Text>
              </Touchable>
            </View>
          ))}
        </Card>
      </Enter>

      {/* Module groups */}
      {GROUPS.map((g, gi) => (
        <Enter key={g.label} i={gi + 2}>
          <ListSection label={g.label}>
            {g.links.map((l, i) => (
              <ListRow key={l.to} icon={l.icon} iconTone={l.tone ?? 'ink'} title={l.label} onPress={() => go(l.to)} last={i === g.links.length - 1 && g.label !== 'Business'} />
            ))}
            {g.label === 'Business' ? (
              <PortalSwitcher
                current="buyer"
                trigger={({ open }) => <ListRow icon={Repeat} iconTone="paper" title="Switch workspace" onPress={open} last />}
              />
            ) : null}
          </ListSection>
        </Enter>
      ))}

      {/* Sign out */}
      <Enter i={GROUPS.length + 2} style={{ gap: 16 }}>
        <Touchable
          onPress={out}
          hapticOnPress
          scaleTo={0.97}
          accessibilityLabel="Sign out"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: radii.xl, borderCurve: 'continuous', backgroundColor: colors.roseSoft }}
        >
          <LogOut size={17} color={colors.rose} strokeWidth={2.1} />
          <Text variant="body" weight="semibold" color="rose">
            Sign out
          </Text>
        </Touchable>
        <Text variant="caption" color="ink5" align="center">
          VYRO{Constants.expoConfig?.version ? ` · v${Constants.expoConfig.version}` : ''}
        </Text>
      </Enter>
    </Screen>
  );
}
