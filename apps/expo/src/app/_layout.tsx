import {
  DefaultTheme,
  type Theme as NavigationTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuthStore } from '@/features/auth';
import { SyncProvider } from '@/features/sync/components/SyncProvider';
import { authClient } from '@/services/auth-client';
import { setupNotificationHandler } from '@/services/notifications';
import { queryClient, queryPersister, setupReactQueryFocusManager } from '@/services/query-client';
import { clearAuthToken, getAuthToken } from '@/services/secure-store';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { KFGQPC_FONT_FAMILY } from '@/theme/tokens';

if (Platform.OS !== 'web') {
  setupNotificationHandler();
}

function useNavigationTheme(): NavigationTheme {
  const { tokens, themeName } = useTheme();
  return {
    dark: themeName === 'dark',
    colors: {
      primary: tokens.accent.audio,
      background: tokens.surface.primary,
      card: tokens.surface.secondary,
      text: tokens.text.ui,
      border: tokens.border,
      notification: tokens.accent.highlight,
    },
    fonts: DefaultTheme.fonts,
  };
}

function AppContent() {
  const navigationTheme = useNavigationTheme();
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <AnimatedSplashOverlay />
      <ErrorBoundary screenName="App">
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" options={{ presentation: 'modal' }} />
          <Stack.Screen name="quran/[surah]/[verse]" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </ErrorBoundary>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  // Config plugin embeds font natively; useFonts provides web runtime fallback
  const [fontsLoaded] = useFonts(
    Platform.OS === 'web'
      ? { [KFGQPC_FONT_FAMILY]: require('@/assets/fonts/kfgqpc/KFGQPCUthmanicScriptHAFS.ttf') }
      : {},
  );

  useEffect(() => {
    setupReactQueryFocusManager();
  }, []);

  // Handle notification tap → navigate to reading tab at last saved position
  // Hook is safe on all platforms (returns null on web where notifications aren't supported)
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastNotificationResponse) return;
    const data = lastNotificationResponse.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    if (data?.type === 'reading-reminder') {
      router.push('/(tabs)/');
    }
  }, [lastNotificationResponse]);

  // Restore auth session on launch
  useEffect(() => {
    (async () => {
      const token = await getAuthToken();
      if (!token) return;
      try {
        const session = await authClient.getSession();
        if (session.data?.user) {
          useAuthStore.getState().setUser({
            userId: session.data.user.id,
            email: session.data.user.email ?? null,
            displayName: session.data.user.name ?? null,
          });
        } else {
          // Session expired/invalid — clear silently
          await clearAuthToken();
        }
      } catch {
        // Network error or invalid session — clear silently, stay anonymous
        await clearAuthToken();
      }
    })();
  }, []);

  if (!fontsLoaded && Platform.OS === 'web') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister }}
      >
        <ThemeProvider>
          <SyncProvider>
            <AppContent />
          </SyncProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
