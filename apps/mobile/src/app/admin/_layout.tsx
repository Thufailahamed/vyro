import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { Gate } from '@/features/common/Gate';
import { colors } from '@/theme/tokens';

/** Admin portal navigator. Tabs live in (tabs); every other screen pushes over them. */
export default function AdminLayout() {
  const { user, setPortal } = useAuth();
  useEffect(() => {
    if (user) setPortal('admin');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);
  return (
    <Gate need="admin">
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bone }, animation: 'slide_from_right' }} />
    </Gate>
  );
}
