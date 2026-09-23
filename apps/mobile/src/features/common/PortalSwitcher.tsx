import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Building2, Check, ChevronsUpDown, LogOut, ShieldCheck, Store, type LucideIcon } from 'lucide-react-native';
import { useAuth, type Portal } from '@/lib/auth';
import { Avatar, Button, ListRow, ListSection, Sheet, Text, Touchable } from '@/ui';
import { colors, radii, shadow } from '@/theme/tokens';

const PORTAL_META: Record<Portal, { label: string; hint: string; icon: LucideIcon; href: string }> = {
  buyer: { label: 'Buyer workspace', hint: 'Source, order and pay', icon: Building2, href: '/buyer' },
  supplier: { label: 'Supplier portal', hint: 'Sell, fulfil and grow', icon: Store, href: '/supplier' },
  admin: { label: 'Control centre', hint: 'Operate the platform', icon: ShieldCheck, href: '/admin' },
};

export function switchPortal(p: Portal, setPortal: (p: Portal) => void) {
  setPortal(p);
  router.replace(PORTAL_META[p].href as never);
}

/** Volt check disc marking the active portal / org. */
function ActiveMark() {
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
      <Check size={14} color={colors.volt} strokeWidth={2.6} />
    </View>
  );
}

/**
 * Header chip showing the active org; opens a sheet to switch portal,
 * switch business / supplier org, or sign out.
 */
export function PortalSwitcher({ current, dark }: { current: Portal; dark?: boolean }) {
  const { user, business, supplier, availablePortals, setPortal, setBusinessId, setSupplierId, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const orgName =
    current === 'buyer' ? (business?.businessName ?? user.name) : current === 'supplier' ? (supplier?.supplierName ?? 'Supplier') : 'VYRO Control';

  return (
    <>
      <Touchable
        onPress={() => setOpen(true)}
        hapticOnPress
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingLeft: 4,
          paddingRight: 10,
          height: 40,
          borderRadius: radii.pill,
          backgroundColor: dark ? 'rgba(250,247,240,0.09)' : colors.paper,
          borderWidth: dark ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.paperLine,
          maxWidth: 220,
          ...(dark ? null : shadow.sm),
        }}
        accessibilityLabel="Switch workspace"
      >
        <Avatar name={orgName} size={32} tone={current === 'supplier' ? 'copper' : current === 'admin' ? 'volt' : 'ink'} />
        <View style={{ flexShrink: 1 }}>
          <Text variant="caption" color={dark ? 'paperMuted' : 'ink4'} style={{ fontSize: 9.5, lineHeight: 11, letterSpacing: 1 }}>
            {PORTAL_META[current].label.toUpperCase()}
          </Text>
          <Text variant="bodySm" weight="semibold" color={dark ? 'paper' : 'ink'} numberOfLines={1}>
            {orgName}
          </Text>
        </View>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: dark ? 'rgba(250,247,240,0.08)' : colors.bone,
          }}
        >
          <ChevronsUpDown size={12} color={dark ? colors.paperMuted : colors.ink4} strokeWidth={2} />
        </View>
      </Touchable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Workspaces" subtitle={user.email} scroll>
        <View style={{ gap: 22 }}>
          <ListSection label="Portals">
            {availablePortals.map((p, i) => {
              const m = PORTAL_META[p];
              const active = p === current;
              return (
                <ListRow
                  key={p}
                  icon={m.icon}
                  iconTone={active ? 'volt' : 'paper'}
                  title={m.label}
                  subtitle={m.hint}
                  last={i === availablePortals.length - 1}
                  chevron={!active}
                  trailing={active ? <ActiveMark /> : undefined}
                  onPress={() => {
                    setOpen(false);
                    if (p !== current) switchPortal(p, setPortal);
                  }}
                />
              );
            })}
          </ListSection>

          {current === 'buyer' && user.memberships.length > 1 ? (
            <ListSection label="Businesses">
              {user.memberships.map((m, i) => {
                const active = m.businessId === business?.businessId;
                return (
                  <ListRow
                    key={m.businessId}
                    leading={<Avatar name={m.businessName} size={38} tone={active ? 'volt' : 'ink'} />}
                    title={m.businessName}
                    subtitle={m.role}
                    last={i === user.memberships.length - 1}
                    chevron={false}
                    trailing={active ? <ActiveMark /> : undefined}
                    onPress={() => {
                      setBusinessId(m.businessId);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </ListSection>
          ) : null}

          {current === 'supplier' && user.supplierMemberships.length > 1 ? (
            <ListSection label="Supplier orgs">
              {user.supplierMemberships.map((m, i) => {
                const active = m.supplierId === supplier?.supplierId;
                return (
                  <ListRow
                    key={m.supplierId}
                    leading={<Avatar name={m.supplierName} size={38} tone={active ? 'volt' : 'copper'} />}
                    title={m.supplierName}
                    subtitle={m.role}
                    last={i === user.supplierMemberships.length - 1}
                    chevron={false}
                    trailing={active ? <ActiveMark /> : undefined}
                    onPress={() => {
                      setSupplierId(m.supplierId);
                      setOpen(false);
                    }}
                  />
                );
              })}
            </ListSection>
          ) : null}
        </View>

        {!user.supplierMemberships.length ? (
          <Button
            title="Become a supplier"
            variant="secondary"
            icon={Store}
            full
            style={{ marginTop: 22 }}
            onPress={() => {
              setOpen(false);
              router.push('/onboarding/supplier');
            }}
          />
        ) : null}

        <Button
          title="Sign out"
          variant="ghost"
          icon={LogOut}
          full
          style={{ marginTop: 10 }}
          onPress={async () => {
            setOpen(false);
            await signOut();
            router.replace('/welcome');
          }}
        />
      </Sheet>
    </>
  );
}
