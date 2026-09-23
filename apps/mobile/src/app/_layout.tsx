import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Syne_600SemiBold } from '@expo-google-fonts/syne/600SemiBold';
import { Syne_700Bold } from '@expo-google-fonts/syne/700Bold';
import { Syne_800ExtraBold } from '@expo-google-fonts/syne/800ExtraBold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
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
    Syne_600SemiBold,
    Syne_700Bold,
    Syne_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
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
