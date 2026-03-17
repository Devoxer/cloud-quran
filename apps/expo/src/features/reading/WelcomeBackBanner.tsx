import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SURAH_METADATA } from 'quran-data';

import { AppText } from '@/components/AppText';
import { useTheme } from '@/theme/ThemeProvider';
import { animation, spacing } from '@/theme/tokens';
import { useUIStore } from '@/theme/useUIStore';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface WelcomeBackBannerProps {
  onDismiss: () => void;
  dismissed?: boolean;
}

export function WelcomeBackBanner({ onDismiss, dismissed = false }: WelcomeBackBannerProps) {
  const lastReadTimestamp = useUIStore((s) => s.lastReadTimestamp);
  const currentSurah = useUIStore((s) => s.currentSurah);
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const hasShown = useRef(false);
  const [visible, setVisible] = useState(() => Date.now() - lastReadTimestamp > SEVEN_DAYS_MS);

  useEffect(() => {
    if (!visible) return;
    hasShown.current = true;

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: animation.fade,
        useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        onDismiss();
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [visible, fadeAnim, onDismiss]);

  if (!visible || dismissed) return null;

  const metadata = SURAH_METADATA[currentSurah - 1];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + spacing.sm,
          backgroundColor: tokens.accent.audio + 'CC',
          opacity: fadeAnim,
        },
      ]}
    >
      <AppText variant="ui" style={{ color: tokens.surface.primary }}>
        Welcome back. You were reading {metadata.nameEnglish}.
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    zIndex: 20,
    alignItems: 'center',
  },
});
