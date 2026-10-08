import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import {
  ArrowUpRight,
  Bell,
  ChartBar,
  ChevronsUpDown,
  GraduationCap,
  HelpCircle,
  Landmark,
  LogOut,
  Megaphone,
  Settings,
  ShieldCheck,
  Tags,
  Target,
  Truck,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react-native';
import { Avatar, Card, InkHero, Kicker, ListRow, ListSection, Screen, Text, Touchable, useToast } from '@/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { colors, fonts, radii, shadow } from '@/theme/tokens';
import { PortalSwitcher } from '@/features/common/PortalSwitcher';

type Link = { icon: LucideIcon; label: string; hint: string; to: string; iconTone?: 'ink' | 'volt' | 'copper' | 'paper' };

const GROUPS: { label: string; links: Link[] }[] = [
  {
    label: 'Business',
    links: [
      { icon: Landmark, label: 'Accounts', hint: 'Ledger & bank accounts', to: '/supplier/accounts', iconTone: 'ink' },
      { icon: Users, label: 'Customers', hint: 'Commercial buyers', to: '/supplier/customers', iconTone: 'copper' },
      { icon: Target, label: 'Leads', hint: 'RFQ pipeline CRM', to: '/supplier/leads', iconTone: 'copper' },
    ],
  },
  {
    label: 'Catalog & stock',
    links: [
      { icon: Tags, label: 'Pricing', hint: 'Tiers & minimum order quantities', to: '/supplier/pricing', iconTone: 'volt' },
      { icon: Warehouse, label: 'Inventory', hint: 'Stock levels & reorder points', to: '/supplier/inventory', iconTone: 'volt' },
    ],
  },
  {
    label: 'Workspace',
    links: [
      { icon: Settings, label: 'Settings', hint: 'Depot, team & payouts', to: '/supplier/settings', iconTone: 'ink' },
      { icon: ShieldCheck, label: 'Verification', hint: 'KYC & documents', to: '/supplier/verification', iconTone: 'ink' },
      { icon: GraduationCap, label: 'Learning', hint: 'Supplier training centre', to: '/supplier/learning', iconTone: 'ink' },
    ],
  },
  {
    label: 'Help',
    links: [
      { icon: Bell, label: 'Notifications', hint: 'Alerts & updates', to: '/notifications', iconTone: 'paper' },
      { icon: HelpCircle, label: 'How it works', hint: 'Platform guide', to: '/how-it-works', iconTone: 'paper' },
    ],
  },
];

const go = (to: string) => () => router.push(to as never);

/** Corner arrow disc shared by the bento tiles. */
function Arrow({ tone }: { tone: 'ink' | 'paper' | 'volt' }) {
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'ink' ? 'rgba(250,247,240,0.08)' : tone === 'volt' ? colors.ink : colors.bone,
      }}
    >
      <ArrowUpRight size={14} color={tone === 'ink' ? colors.paper : tone === 'volt' ? colors.volt : colors.ink3} strokeWidth={2.2} />
    </View>
  );
}

/** Compact light tile for the right-hand column of the bento. */
function MiniTile({ icon: Icon, label, hint, to }: { icon: LucideIcon; label: string; hint: string; to: string }) {
  return (
    <Card onPress={go(to)} padding={14} radius={radii['2xl']} style={{ flex: 1, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={[styles.iconInk, { width: 36, height: 36, borderRadius: 12 }]}>
          <Icon size={17} color={colors.volt} strokeWidth={1.9} />
        </View>
        <Arrow tone="paper" />
      </View>
      <View style={{ gap: 1 }}>
        <Text variant="h3" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" color="ink4" numberOfLines={1}>
          {hint}
        </Text>
      </View>
    </Card>
  );
}

/** Supplier "More" tab — module hub, portal switching and sign out. */
export function SupplierMoreScreen() {
  const { user, supplier, availablePortals, signOut } = useAuth();
  const toast = useToast();
  const name = supplier?.supplierName ?? user?.name ?? 'Supplier';
  const version = Constants.expoConfig?.version;

  const out = async () => {
    try {
      await signOut();
      router.replace('/welcome');
    } catch (e) {
      toast.error('Could not sign out', errorMessage(e));
    }
  };

  return (
    <Screen tabBar kicker="Supplier" title="More" subtitle="Every supplier module in one place." gap={26}>
      {/* Identity */}
      <InkHero seed={`more-${supplier?.supplierId ?? 'supplier'}`} style={{ padding: 0 }}>
        <View style={{ padding: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View>
            <View style={{ padding: 3, borderRadius: 34, borderWidth: 1.5, borderColor: 'rgba(198,220,74,0.45)' }}>
              <Avatar name={name} size={56} tone="copper" />
            </View>
            <View style={styles.onlineDot} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Kicker color="volt">Supplier workspace</Kicker>
            <Text variant="displaySm" color="paper" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" color="paperMuted" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        {supplier?.role ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 16 }}>
            <View style={styles.rolePill}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.volt }} />
              <Text style={styles.roleText}>{humanize(supplier.role).toUpperCase()}</Text>
            </View>
            {availablePortals.length > 1 ? (
              <View style={[styles.rolePill, { backgroundColor: 'rgba(250,247,240,0.07)' }]}>
                <Text style={[styles.roleText, { color: colors.paperMuted }]}>{availablePortals.length} PORTALS</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <PortalSwitcher
          current="supplier"
          trigger={({ open }) => (
            <Touchable onPress={open} hapticOnPress scaleTo={0.99} accessibilityLabel="Switch workspace" style={styles.switchRow}>
              <View style={{ flex: 1, gap: 1 }}>
                <Text variant="bodySm" weight="semibold" color="paper">
                  Switch workspace
                </Text>
                <Text variant="caption" color="paperFaint">
                  Buyer, supplier and admin portals
                </Text>
              </View>
              <View style={styles.switchIcon}>
                <ChevronsUpDown size={15} color={colors.ink} strokeWidth={2.2} />
              </View>
            </Touchable>
          )}
        />
      </InkHero>

      {/* Bento: key modules */}
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12, height: 240 }}>
          <Card kind="ink" onPress={go('/supplier/deliveries')} padding={18} radius={radii['2xl']} style={{ flex: 1.05, justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={[styles.iconInk, { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.volt }]}>
                <Truck size={21} color={colors.ink} strokeWidth={1.9} />
              </View>
              <Arrow tone="ink" />
            </View>
            <View style={{ gap: 6 }}>
              <Text variant="overline" color="paperFaint">
                Fulfilment
              </Text>
              <Text variant="h1" color="paper">
                Deliveries
              </Text>
              <Text variant="bodySm" color="paperMuted" numberOfLines={2}>
                Dispatch, fleet & proof of delivery
              </Text>
            </View>
          </Card>
          <View style={{ flex: 1, gap: 12 }}>
            <MiniTile icon={Wallet} label="Payments" hint="Payouts & fees" to="/supplier/payments" />
            <MiniTile icon={ChartBar} label="Analytics" hint="Revenue & trends" to="/supplier/analytics" />
          </View>
        </View>

        <Card kind="volt" onPress={go('/supplier/sponsored')} padding={16} radius={radii['2xl']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[styles.iconInk, { width: 48, height: 48, borderRadius: 16 }]}>
              <Megaphone size={21} color={colors.volt} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h2">Sponsored listings</Text>
              <Text variant="caption" color="ink3" numberOfLines={2}>
                Get seen first by buyers searching your category.
              </Text>
            </View>
            <Arrow tone="volt" />
          </View>
        </Card>
      </View>

      {GROUPS.map((g) => (
        <ListSection key={g.label} label={g.label}>
          {g.links.map((l, i) => (
            <ListRow key={l.to} icon={l.icon} iconTone={l.iconTone} title={l.label} subtitle={l.hint} onPress={go(l.to)} last={i === g.links.length - 1} />
          ))}
        </ListSection>
      ))}

      <View style={{ gap: 14, alignItems: 'center' }}>
        <Touchable onPress={out} hapticOnPress scaleTo={0.98} accessibilityRole="button" accessibilityLabel="Sign out" style={styles.signOut}>
          <LogOut size={17} color={colors.rose} strokeWidth={2} />
          <Text variant="button" color="rose">
            Sign out
          </Text>
        </Touchable>
        <Text variant="caption" color="ink5" align="center">
          VYRO for suppliers{version ? ` · v${version}` : ''}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconInk: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.volt,
    borderWidth: 2.5,
    borderColor: colors.ink,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(198,220,74,0.14)',
  },
  roleText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.8, color: colors.volt },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.paperLine,
    backgroundColor: 'rgba(250,247,240,0.04)',
  },
  switchIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.volt,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radii.xl,
    borderCurve: 'continuous',
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,90,74,0.25)',
    ...shadow.sm,
  },
});
