import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Building2, ChevronsUpDown, LogOut, ShieldCheck, Store, type LucideIcon } from 'lucide-react-native';
import { useAuth, type Portal } from '@/lib/auth';
import { Avatar, Button, ListRow, Sheet, Text, Touchable, Kicker } from '@/ui';
import { colors, radii } from '@/theme/tokens';

const PORTAL_META: Record<Portal, { label: string; hint: string; icon: LucideIcon; href: string }> = {
  buyer: { label: 'Buyer workspace', hint: 'Source, order and pay', icon: Building2, href: '/buyer' },
  supplier: { label: 'Supplier portal', hint: 'Sell, fulfil and grow', icon: Store, href: '/supplier' },
  admin: { label: 'Control centre', hint: 'Operate the platform', icon: ShieldCheck, href: '/admin' },
};

export function switchPortal(p: Portal, setPortal: (p: Portal) => void) {
  setPortal(p);
  router.replace(PORTAL_META[p].href as never);
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
          backgroundColor: dark ? 'rgba(250,247,240,0.1)' : colors.paper,
          borderWidth: 1,
          borderColor: dark ? colors.paperLine : colors.lineSoft,
          maxWidth: 220,
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
        <ChevronsUpDown size={14} color={dark ? colors.paperMuted : colors.ink4} />
      </Touchable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Workspaces" subtitle={user.email} scroll>
        <Kicker style={{ marginTop: 4, marginBottom: 4 }}>Portals</Kicker>
        {availablePortals.map((p, i) => {
          const m = PORTAL_META[p];
          return (
            <ListRow
              key={p}
              icon={m.icon}
              iconTone={p === current ? 'volt' : 'ink'}
              title={m.label}
              subtitle={m.hint}
              last={i === availablePortals.length - 1}
              trailing={p === current ? <Text variant="caption" color="voltDeep">Active</Text> : undefined}
              onPress={() => {
                setOpen(false);
                if (p !== current) switchPortal(p, setPortal);
              }}
            />
          );
        })}

        {current === 'buyer' && user.memberships.length > 1 ? (
          <>
            <Kicker style={{ marginTop: 18, marginBottom: 4 }}>Businesses</Kicker>
            {user.memberships.map((m, i) => (
              <ListRow
                key={m.businessId}
                leading={<Avatar name={m.businessName} size={36} tone={m.businessId === business?.businessId ? 'volt' : 'ink'} />}
                title={m.businessName}
                subtitle={m.role}
                last={i === user.memberships.length - 1}
                onPress={() => {
                  setBusinessId(m.businessId);
                  setOpen(false);
                }}
              />
            ))}
          </>
        ) : null}

        {current === 'supplier' && user.supplierMemberships.length > 1 ? (
          <>
            <Kicker style={{ marginTop: 18, marginBottom: 4 }}>Supplier orgs</Kicker>
            {user.supplierMemberships.map((m, i) => (
              <ListRow
                key={m.supplierId}
                leading={<Avatar name={m.supplierName} size={36} tone={m.supplierId === supplier?.supplierId ? 'volt' : 'copper'} />}
                title={m.supplierName}
                subtitle={m.role}
                last={i === user.supplierMemberships.length - 1}
                onPress={() => {
                  setSupplierId(m.supplierId);
                  setOpen(false);
                }}
              />
            ))}
          </>
        ) : null}

        {!user.supplierMemberships.length ? (
          <Button
            title="Become a supplier"
            variant="secondary"
            icon={Store}
            full
            style={{ marginTop: 18 }}
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
