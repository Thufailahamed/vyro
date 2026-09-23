import { type ReactNode } from 'react';
import { View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Building2, Lock, ShieldAlert, Store } from 'lucide-react-native';
import { useAuth } from '@/lib/auth';
import { EmptyState, Loader, Screen } from '@/ui';

export type GateNeed = 'auth' | 'business' | 'supplier' | 'admin';

/**
 * Screen-level access gate — the mobile equivalent of the web's RequireAuth /
 * RequireBusiness / RequireAdmin. Renders a friendly prompt instead of
 * redirecting so back-navigation stays predictable.
 *
 *   export default function CartTab() {
 *     return <Gate need="business"><CartScreen /></Gate>;
 *   }
 */
export function Gate({ need = 'auth', children, tabBar }: { need?: GateNeed; children: ReactNode; tabBar?: boolean }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <Screen scroll={false}>
        <Loader label="Checking your session…" />
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen tabBar={tabBar}>
        <View style={{ paddingTop: 60 }}>
          <EmptyState
            icon={Lock}
            title="Sign in to continue"
            message="This part of VYRO needs a workspace account."
            action={{ label: 'Sign in', onPress: () => router.push({ pathname: '/login', params: { next: pathname } }) }}
          />
        </View>
      </Screen>
    );
  }

  if (need === 'business' && user.memberships.length === 0) {
    return (
      <Screen tabBar={tabBar}>
        <View style={{ paddingTop: 60 }}>
          <EmptyState
            icon={Building2}
            title="Set up your business"
            message="Register your buyer business to order, request quotes and use credit."
            action={{ label: 'Register business', onPress: () => router.push('/onboarding/business') }}
          />
        </View>
      </Screen>
    );
  }

  if (need === 'supplier' && user.supplierMemberships.length === 0) {
    return (
      <Screen tabBar={tabBar}>
        <View style={{ paddingTop: 60 }}>
          <EmptyState
            icon={Store}
            title="No supplier workspace"
            message="Register your supplier business to list products and receive orders."
            action={{ label: 'Become a supplier', onPress: () => router.push('/onboarding/supplier') }}
          />
        </View>
      </Screen>
    );
  }

  if (need === 'admin' && !user.isAdmin) {
    return (
      <Screen tabBar={tabBar}>
        <View style={{ paddingTop: 60 }}>
          <EmptyState icon={ShieldAlert} title="Admins only" message="Your account doesn't have platform operator access." action={{ label: 'Go home', onPress: () => router.replace('/') }} />
        </View>
      </Screen>
    );
  }

  return <>{children}</>;
}
