import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuth, homeFor } from '@/lib/auth';
import { BrandMark, Loader } from '@/ui';
import { colors } from '@/theme/tokens';

/** Boot gate: waits for the session, then routes into the right portal. */
export default function Index() {
  const { user, loading, portal } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <BrandMark size={56} />
        <Loader dark />
      </View>
    );
  }
  return <Redirect href={homeFor(user, portal) as never} />;
}
