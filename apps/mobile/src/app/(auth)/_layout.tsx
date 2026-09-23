import { Stack } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function AuthGroupLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ink }, animation: 'slide_from_right' }} />;
}
