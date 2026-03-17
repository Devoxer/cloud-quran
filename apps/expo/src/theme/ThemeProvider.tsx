import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, useColorScheme } from 'react-native';

import { animation, type ThemeName, themes, type ThemeTokens } from './tokens';
import { useUIStore } from './useUIStore';

interface ThemeContextValue {
  tokens: ThemeTokens;
  themeName: ThemeName;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const selectedTheme = useUIStore((s) => s.selectedTheme);
  const systemScheme = useColorScheme();

  // On web, wait for Zustand hydration to prevent light mode flash
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (Platform.OS === 'web') {
      const unsub = useUIStore.persist.onFinishHydration(() => setHydrated(true));
      // Already hydrated (e.g. synchronous storage)
      if (useUIStore.persist.hasHydrated()) setHydrated(true);
      return unsub;
    }
  }, []);

  const resolvedTheme: ThemeName =
    selectedTheme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : selectedTheme;

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevThemeRef = useRef(resolvedTheme);

  useEffect(() => {
    if (prevThemeRef.current !== resolvedTheme) {
      prevThemeRef.current = resolvedTheme;
      // Start from partial opacity to avoid a jarring flash to invisible
      fadeAnim.setValue(0.4);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: animation.theme,
        useNativeDriver: true,
      }).start();
    }
  }, [resolvedTheme, fadeAnim]);

  const value = useMemo(
    () => ({
      tokens: themes[resolvedTheme],
      themeName: resolvedTheme,
    }),
    [resolvedTheme],
  );

  if (!hydrated) return null;

  return (
    <ThemeContext.Provider value={value}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>{children}</Animated.View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
