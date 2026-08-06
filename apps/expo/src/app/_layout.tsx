import {
  DefaultTheme,
  type Theme as NavigationTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useGuestDataTransfer } from '@/features/auth/hooks/useGuestDataTransfer';
import { db } from '@/services/instantdb';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { KFGQPC_FONT_FAMILY } from '@/theme/tokens';
import { ensureInstantDBEntities, useInstantDBSync } from '@/theme/useUIStore';

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

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, user, error } = db.useAuth();

  useEffect(() => {
    if (!isLoading && !user && !error) {
      db.auth.signInAsGuest();
    }
  }, [isLoading, user, error]);

  // Once authenticated, ensure InstantDB entities exist
  useEffect(() => {
    if (user) {
      ensureInstantDBEntities();
    }
  }, [user]);

  // Transfer linked guest data when upgrading from guest to authenticated
  useGuestDataTransfer(user);

  // Sync InstantDB data into Zustand local cache
  useInstantDBSync();

  // Don't block rendering — app works offline via local store
  return <>{children}</>;
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

  if (!fontsLoaded && Platform.OS === 'web') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthGate>
          <AppContent />
        </AuthGate>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
