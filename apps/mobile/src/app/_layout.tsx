import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { AuthProvider } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { ToastProvider } from '@/ui';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
        return count < 2;
      },
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // Registered under semantic names (see theme/tokens `fonts`) so the
    // typefaces can change without touching call sites.
    'Display-Semi': PlusJakartaSans_600SemiBold,
    'Display-Bold': PlusJakartaSans_700Bold,
    'Display-Black': PlusJakartaSans_800ExtraBold,
    'Sans-Regular': Inter_400Regular,
    'Sans-Medium': Inter_500Medium,
    'Sans-Semi': Inter_600SemiBold,
    'Sans-Bold': Inter_700Bold,
  });

  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.ink }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bone }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bone },
                  animation: 'slide_from_right',
                  gestureEnabled: true,
                }}
              >
                <Stack.Screen name="index" options={{ animation: 'fade' }} />
                <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
                <Stack.Screen name="buyer" options={{ animation: 'fade' }} />
                <Stack.Screen name="supplier" options={{ animation: 'fade' }} />
                <Stack.Screen name="admin" options={{ animation: 'fade' }} />
              </Stack>
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
