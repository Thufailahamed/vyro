import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme/tokens';

/** Buyer portal navigator. Tabs live in (tabs); every other screen pushes over them. */
export default function BuyerLayout() {
  const { user, setPortal } = useAuth();
  useEffect(() => {
    if (user) setPortal('buyer');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bone }, animation: 'slide_from_right' }} />;
}
